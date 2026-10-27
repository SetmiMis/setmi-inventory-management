-- Customers (owner's mock): a list of the people and companies you sell to, an automatic code (CUST-001...),
-- and an optional link from a bill to a customer, so the screen can show each customer's orders and sales.
-- There is NO credit or receivables system: the credit limit and payment terms are notes for the staff, nothing is enforced.
-- The GSTIN is stored as plain text only (no tax is calculated anywhere; GST waits for the accountant).

insert into public.permissions (key, module, description) values
  ('customers.view', 'sales', 'See the customer list'),
  ('customers.manage', 'sales', 'Create and edit customers')
on conflict (key) do nothing;

create sequence if not exists public.customer_code_seq;
grant usage on sequence public.customer_code_seq to authenticated;

create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('CUST-' || lpad(nextval('public.customer_code_seq')::text, 3, '0')),
  name           text not null check (btrim(name) <> '' and char_length(name) <= 150),
  customer_type  text not null default 'RETAILER' check (customer_type in ('DEALER', 'DISTRIBUTOR', 'RETAILER', 'OEM', 'PROJECT', 'GOVERNMENT', 'OTHER')),
  gstin          text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  contact_person text check (contact_person is null or char_length(contact_person) <= 100),
  phone          text check (phone is null or char_length(phone) <= 30),
  email          text check (email is null or char_length(email) <= 150),
  address        text check (address is null or char_length(address) <= 500),
  city           text check (city is null or char_length(city) <= 60),
  state          text check (state is null or char_length(state) <= 60),
  credit_limit   numeric(14,2) check (credit_limit is null or (credit_limit >= 0 and credit_limit <= 99999999999)),
  payment_terms  text check (payment_terms is null or char_length(payment_terms) <= 60),
  notes          text check (notes is null or char_length(notes) <= 1000),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id)
);
create index customers_name_idx on public.customers (lower(name));

create or replace function public.customers_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.code := old.code;      -- the code never changes
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.customers_before_write() from public, anon, authenticated;
create trigger customers_write before insert or update on public.customers
  for each row execute function public.customers_before_write();
create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function public.log_audit();

alter table public.customers enable row level security;
-- People who make or look at bills need the list to pick a customer.
create policy customers_select on public.customers for select to authenticated
  using ((select public.has_permission('customers.view')) or (select public.has_permission('customers.manage'))
         or (select public.has_permission('bills.create')) or (select public.has_permission('bills.view')));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select public.has_permission('customers.manage')));
create policy customers_update on public.customers for update to authenticated
  using ((select public.has_permission('customers.manage'))) with check ((select public.has_permission('customers.manage')));
revoke all on public.customers from anon;
grant select, insert, update on public.customers to authenticated;

-- A bill may point at a customer (optional). Bills stay immutable; the link is written when the bill is made.
alter table public.bills add column customer_id uuid references public.customers (id) on delete restrict;
create index bills_customer_idx on public.bills (customer_id) where customer_id is not null;

-- create_bill: the same function as before, plus an optional customer_id in p_header. When a customer is chosen,
-- an empty name or phone on the bill is filled from the customer. An unknown or switched-off customer is refused.
create or replace function public.create_bill(p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_mode text := upper(btrim(coalesce(p_header->>'payment_mode', '')));
  v_cname text := nullif(btrim(coalesce(p_header->>'customer_name', '')), '');
  v_cphone text := nullif(btrim(coalesce(p_header->>'customer_phone', '')), '');
  v_cust uuid := nullif(btrim(coalesce(p_header->>'customer_id', '')), '')::uuid;
  v_discount numeric := coalesce(nullif(btrim(coalesce(p_header->>'discount', '')), '')::numeric, 0);
  v_override boolean := public.has_permission('bills.override_price');
  v_lc text; v_ln text; v_id uuid; v_no text; v_sub numeric := 0; v_total numeric; v_n int; v_bad text;
  v_errors jsonb := '[]'::jsonb; x record; v_price numeric; v_custname text; v_custphone text;
begin
  if not public.billing_enabled() then raise exception 'Billing is switched off'; end if;
  if not public.has_permission('bills.create') then
    raise exception 'missing permission: bills.create' using errcode = '42501';
  end if;
  if not public.can_access_location(v_loc) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  select code, name into v_lc, v_ln from public.locations where id = v_loc and is_active and type <> 'TRANSIT';
  if not found then raise exception 'location not found or archived'; end if;
  if v_mode not in ('CASH', 'UPI', 'CARD', 'OTHER') then raise exception 'Choose a payment mode'; end if;
  if v_cust is not null then
    select c.name, c.phone into v_custname, v_custphone from public.customers c where c.id = v_cust and c.is_active;
    if not found then raise exception 'Customer not found or switched off'; end if;
    v_cname := coalesce(v_cname, left(v_custname, 100));
    v_cphone := coalesce(v_cphone, left(v_custphone, 30));
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 200 then raise exception 'at most 200 lines per bill'; end if;
  if v_discount < 0 or v_discount > 99999999 then raise exception 'Discount is not valid'; end if;

  for x in select t.item_id, t.quantity, t.unit_price, i.internal_item_code as code, i.selling_price as list_price, u.decimals as dec, (i.id is not null and i.is_active) as ok
           from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, unit_price numeric)
           left join public.items i on i.id = t.item_id
           left join public.units u on u.code = i.unit loop
    if not coalesce(x.ok, false) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found or archived');
      continue;
    end if;
    v_price := coalesce(x.unit_price, x.list_price);
    if x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, x.dec) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', case when x.dec = 0 then 'This item is sold in whole numbers' else 'At most ' || x.dec || ' decimals for this unit' end);
    elsif v_price is null then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'No selling price is set for this item');
    elsif v_price < 0 or v_price > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'Price is not valid');
    elsif x.unit_price is not null and x.list_price is distinct from x.unit_price and not v_override then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'You may not change the price');
    else
      v_sub := v_sub + round(x.quantity * v_price, 2);
    end if;
  end loop;
  for x in select (e->>'item_id')::uuid as item_id from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop
    v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'The same item is listed twice');
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;
  if v_discount > v_sub then raise exception 'Discount cannot be more than the bill amount'; end if;
  v_total := v_sub - v_discount;

  select string_agg(i.internal_item_code || ' (has ' || coalesce(b.quantity, 0)::text || ', needs ' || t.quantity::text || ')', ', ') into v_bad
    from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric)
    join public.items i on i.id = t.item_id
    left join public.stock_balances b on b.item_id = t.item_id and b.location_id = v_loc
    where coalesce(b.quantity, 0) < t.quantity;
  if v_bad is not null then raise exception 'Not enough stock: %', v_bad; end if;

  insert into public.bills (location_id, location_code, location_name, customer_id, customer_name, customer_phone, payment_mode, subtotal, discount, total)
  values (v_loc, v_lc, v_ln, v_cust, v_cname, v_cphone, v_mode, v_sub, v_discount, v_total) returning id, bill_no into v_id, v_no;

  insert into public.bill_lines (bill_id, item_id, item_code, item_name, unit, quantity, unit_price, line_total)
  select v_id, i.id, i.internal_item_code, i.selling_item_name, i.unit, t.quantity,
         coalesce(t.unit_price, i.selling_price), round(t.quantity * coalesce(t.unit_price, i.selling_price), 2)
    from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, unit_price numeric)
    join public.items i on i.id = t.item_id;

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select t.item_id, v_loc, null, t.quantity, 'SALE', 'Sold on ' || v_no, v_no
    from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric);

  return jsonb_build_object('ok', true, 'id', v_id, 'bill_no', v_no, 'total', v_total, 'errors', '[]'::jsonb);
end $$;
revoke all on function public.create_bill(jsonb, jsonb) from public, anon;
grant execute on function public.create_bill(jsonb, jsonb) to authenticated;

-- One call for the Customers screen. Runs as the caller (SECURITY INVOKER): bills are counted only where the
-- person may see them.
create or replace function public.customers_page(
  p_q text default null,
  p_type text default null,
  p_status text default null,    -- all | active | inactive
  p_city text default null,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not (public.has_permission('customers.view') or public.has_permission('customers.manage')) then
    raise exception 'You do not have permission to see customers' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'active', 'inactive') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_type is not null and p_type not in ('', 'DEALER', 'DISTRIBUTOR', 'RETAILER', 'OEM', 'PROJECT', 'GOVERNMENT', 'OTHER') then
    raise exception 'Unknown type filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select c.id, c.code, c.name, c.customer_type as type, c.city, c.state, c.contact_person, c.phone, c.email, c.gstin,
           c.is_active as active, c.created_at,
           coalesce(s.orders, 0) as orders, coalesce(s.sales, 0) as sales, s.last_order
      from public.customers c
      left join (select b.customer_id, count(*) as orders, sum(b.total) as sales,
                        max((b.created_at at time zone 'Asia/Kolkata')::date) as last_order
                   from public.bills b where b.status = 'COMPLETED' and b.customer_id is not null group by b.customer_id) s on s.customer_id = c.id
  ),
  filtered as (
    select b.* from base b
     where (coalesce(p_type, '') = '' or b.type = p_type)
       and (coalesce(p_status, '') in ('', 'all') or (p_status = 'active' and b.active) or (p_status = 'inactive' and not b.active))
       and (coalesce(p_city, '') = '' or b.city = p_city)
       and (coalesce(p_q, '') = '' or b.name ilike v_like or b.code ilike v_like or coalesce(b.contact_person, '') ilike v_like
            or coalesce(b.email, '') ilike v_like or coalesce(b.phone, '') ilike v_like or coalesce(b.city, '') ilike v_like
            or coalesce(b.gstin, '') ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.code), '[]'::jsonb)
               from (select * from filtered order by code limit v_limit offset v_offset) t),
    'cities', (select coalesce(jsonb_agg(distinct city order by city), '[]'::jsonb) from base where city is not null),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'active', (select count(*) from base where active),
      'inactive', (select count(*) from base where not active),
      'orders', (select coalesce(sum(orders), 0) from base),
      'sales', (select coalesce(sum(sales), 0) from base),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.customers_page(text, text, text, text, int, int) from public, anon;
grant execute on function public.customers_page(text, text, text, text, int, int) to authenticated;
