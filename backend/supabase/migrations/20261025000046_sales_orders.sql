-- Sales Orders (owner's mock): an order is a record of what a customer wants, made before anything is billed or dispatched.
-- IT DOES NOT TOUCH STOCK (owner's choice): no stock is reserved or taken. Stock will go out in the later steps (Picking & Packing, Dispatch).
-- Status: PENDING (waiting for confirmation), CONFIRMED, IN_PACKING, DISPATCHED, CANCELLED. On this page a person with sales_orders.create
-- makes and edits PENDING orders, a person with sales_orders.confirm confirms them, and either can cancel before packing starts.
-- IN_PACKING and DISPATCHED will be set by the Picking & Packing and Dispatch pages (not built yet).
-- Money: line rate (starts as the item's selling price, can be changed), discount and shipping charges; NO TAX (owner: later, with the accountant).
-- All writes go through the functions below (no direct table writes).

insert into public.permissions (key, module, description) values
  ('sales_orders.view',    'sales', 'See sales orders of your locations'),
  ('sales_orders.create',  'sales', 'Make and edit sales orders that wait for confirmation, and cancel them'),
  ('sales_orders.confirm', 'sales', 'Confirm sales orders')
on conflict (key) do nothing;

create sequence public.sales_order_seq;
revoke all on sequence public.sales_order_seq from public, anon, authenticated;

create table public.sales_orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          text not null unique default ('SO-' || to_char((now() at time zone 'Asia/Kolkata'), 'YYYY') || '-' || lpad(nextval('public.sales_order_seq')::text, 4, '0')),
  customer_id       uuid not null references public.customers (id) on delete restrict,
  location_id       uuid not null references public.locations (id) on delete restrict,
  channel           text not null check (channel in ('WEBSITE', 'AMAZON', 'FLIPKART', 'MEESHO', 'DIRECT', 'OTHER')),
  order_date        date not null default ((now() at time zone 'Asia/Kolkata')::date),
  expected_dispatch date,
  dispatch_date     date,
  shipping_address  text check (shipping_address is null or char_length(shipping_address) <= 500),
  remarks           text check (remarks is null or char_length(remarks) <= 500),
  discount          numeric(14,2) not null default 0 check (discount >= 0 and discount <= 99999999),
  shipping_charges  numeric(14,2) not null default 0 check (shipping_charges >= 0 and shipping_charges <= 99999999),
  status            text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'IN_PACKING', 'DISPATCHED', 'CANCELLED')),
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles (id) default auth.uid(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid references public.profiles (id),
  confirmed_at      timestamptz,
  confirmed_by      uuid references public.profiles (id),
  cancelled_at      timestamptz,
  cancel_note       text check (cancel_note is null or char_length(cancel_note) <= 300),
  constraint sales_orders_dates check (expected_dispatch is null or expected_dispatch >= order_date)
);
create index sales_orders_location_idx on public.sales_orders (location_id, created_at desc);
create index sales_orders_customer_idx on public.sales_orders (customer_id);
alter table public.sales_orders enable row level security;
create trigger sales_orders_updated_at before update on public.sales_orders for each row execute function public.set_updated_at();
create trigger sales_orders_audit after insert or update or delete on public.sales_orders for each row execute function public.log_audit();

create table public.sales_order_lines (
  id        bigint generated always as identity primary key,
  order_id  uuid not null references public.sales_orders (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete restrict,
  quantity  numeric(14,3) not null check (quantity > 0),
  rate      numeric(14,2) not null check (rate >= 0 and rate <= 99999999),
  constraint sales_order_lines_one_per_item unique (order_id, item_id)
);
alter table public.sales_order_lines enable row level security;

create policy sales_orders_select on public.sales_orders for select to authenticated
  using (((select public.has_permission('sales_orders.view')) or (select public.has_permission('sales_orders.create')) or (select public.has_permission('sales_orders.confirm')))
         and (select public.can_access_location(location_id)));
create policy sales_order_lines_select on public.sales_order_lines for select to authenticated
  using (exists (select 1 from public.sales_orders o where o.id = sales_order_lines.order_id));
revoke all on public.sales_orders, public.sales_order_lines from anon, authenticated;
grant select on public.sales_orders, public.sales_order_lines to authenticated;

-- Immutability after PENDING: lines and header details change only through save_sales_order, and only while PENDING.
-- p_header: {customer_id, location_id, channel, order_date, expected_dispatch, shipping_address, remarks, discount, shipping_charges}
-- p_lines : [{item_id, quantity, rate}]
create or replace function public.save_sales_order(p_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cust uuid := (p_header->>'customer_id')::uuid;
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_channel text := upper(coalesce(p_header->>'channel', ''));
  v_date date := coalesce(nullif(p_header->>'order_date', '')::date, (now() at time zone 'Asia/Kolkata')::date);
  v_exp date := nullif(p_header->>'expected_dispatch', '')::date;
  v_addr text := nullif(btrim(coalesce(p_header->>'shipping_address', '')), '');
  v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
  v_disc numeric := coalesce(nullif(p_header->>'discount', '')::numeric, 0);
  v_ship numeric := coalesce(nullif(p_header->>'shipping_charges', '')::numeric, 0);
  v_id uuid; v_no text; v_status text; v_old_loc uuid; v_n int; v_sub numeric := 0; v_errors jsonb := '[]'::jsonb;
  x record; v_dec smallint; v_code text;
begin
  if not public.has_permission('sales_orders.create') then raise exception 'missing permission: sales_orders.create' using errcode = '42501'; end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if not exists (select 1 from public.locations where id = v_loc and is_active and type <> 'TRANSIT') then raise exception 'location not found or archived'; end if;
  if not exists (select 1 from public.customers where id = v_cust and is_active) then raise exception 'Customer not found or switched off'; end if;
  if v_channel not in ('WEBSITE', 'AMAZON', 'FLIPKART', 'MEESHO', 'DIRECT', 'OTHER') then raise exception 'Choose the sales channel'; end if;
  if v_exp is not null and v_exp < v_date then raise exception 'The expected dispatch date cannot be before the order date'; end if;
  if v_addr is not null and char_length(v_addr) > 500 then raise exception 'The shipping address is too long (max 500)'; end if;
  if v_rem is not null and char_length(v_rem) > 500 then raise exception 'Remarks are too long (max 500)'; end if;
  if v_disc < 0 or v_disc > 99999999 or v_ship < 0 or v_ship > 99999999 then raise exception 'Discount or shipping charges are not valid'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 200 then raise exception 'at most 200 lines per order'; end if;

  if p_id is not null then
    select status, location_id into v_status, v_old_loc from public.sales_orders where id = p_id for update;
    if not found then raise exception 'Sales order not found'; end if;
    if v_status <> 'PENDING' then raise exception 'Only an order that waits for confirmation can be edited'; end if;
    if not public.can_access_location(v_old_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  end if;

  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, rate numeric) loop
    select i.internal_item_code, u.decimals into v_code, v_dec from public.items i join public.units u on u.code = i.unit where i.id = x.item_id and i.is_active;
    if not found then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found or archived');
    elsif x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, v_dec) then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Too many decimals for this unit');
    elsif x.rate is null or x.rate < 0 or x.rate > 99999999 then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Rate is not valid');
    else v_sub := v_sub + x.quantity * x.rate; end if;
  end loop;
  for x in select (e->>'item_id')::uuid as item_id from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop
    v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'The same item is listed twice');
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    raise exception '%', coalesce((v_errors->0->>'code') || ': ', '') || (v_errors->0->>'message') using errcode = 'P0001', detail = v_errors::text;
  end if;
  if v_disc > v_sub then raise exception 'The discount is more than the items total'; end if;

  if p_id is null then
    insert into public.sales_orders (customer_id, location_id, channel, order_date, expected_dispatch, shipping_address, remarks, discount, shipping_charges)
    values (v_cust, v_loc, v_channel, v_date, v_exp, v_addr, v_rem, v_disc, v_ship) returning id, order_no into v_id, v_no;
  else
    update public.sales_orders set customer_id = v_cust, channel = v_channel, order_date = v_date, expected_dispatch = v_exp, shipping_address = v_addr, remarks = v_rem,
           discount = v_disc, shipping_charges = v_ship, updated_by = auth.uid() where id = p_id returning id, order_no into v_id, v_no;
    delete from public.sales_order_lines where order_id = v_id;
  end if;
  insert into public.sales_order_lines (order_id, item_id, quantity, rate)
    select v_id, t.item_id, t.quantity, round(t.rate, 2) from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, rate numeric);
  return jsonb_build_object('id', v_id, 'order_no', v_no);
end $$;
revoke execute on function public.save_sales_order(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_sales_order(uuid, jsonb, jsonb) to authenticated;

create or replace function public.confirm_sales_order(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sales_orders%rowtype;
begin
  if not public.has_permission('sales_orders.confirm') then raise exception 'missing permission: sales_orders.confirm' using errcode = '42501'; end if;
  select * into o from public.sales_orders where id = p_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if not public.can_access_location(o.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if o.status <> 'PENDING' then raise exception 'Only an order that waits for confirmation can be confirmed (this one is %)', lower(replace(o.status, '_', ' ')); end if;
  update public.sales_orders set status = 'CONFIRMED', confirmed_at = now(), confirmed_by = auth.uid() where id = p_id;
end $$;
revoke execute on function public.confirm_sales_order(uuid) from public, anon;
grant execute on function public.confirm_sales_order(uuid) to authenticated;

create or replace function public.cancel_sales_order(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sales_orders%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (public.has_permission('sales_orders.create') or public.has_permission('sales_orders.confirm')) then raise exception 'missing permission: sales_orders.create' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'The note is too long (max 300)'; end if;
  select * into o from public.sales_orders where id = p_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if not public.can_access_location(o.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if o.status not in ('PENDING', 'CONFIRMED') then raise exception 'An order that is already % cannot be cancelled here', lower(replace(o.status, '_', ' ')); end if;
  update public.sales_orders set status = 'CANCELLED', cancelled_at = now(), cancel_note = v_note where id = p_id;
end $$;
revoke execute on function public.cancel_sales_order(uuid, text) from public, anon;
grant execute on function public.cancel_sales_order(uuid, text) to authenticated;

-- ---------- the screen ----------
-- p_channel: all | WEBSITE | AMAZON | FLIPKART | MEESHO | DIRECT | OTHER ; p_status: all | PENDING | CONFIRMED | IN_PACKING | DISPATCHED | CANCELLED
-- Order value = items total - discount + shipping charges (no tax).
create or replace function public.sales_orders_page(
  p_q text default null, p_channel text default null, p_status text default null, p_customer uuid default null,
  p_from date default null, p_to date default null, p_limit int default 10, p_offset int default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not (public.has_permission('sales_orders.view') or public.has_permission('sales_orders.create') or public.has_permission('sales_orders.confirm')) then
    raise exception 'You do not have permission to see sales orders' using errcode = '42501';
  end if;
  if p_channel is not null and p_channel not in ('', 'all', 'WEBSITE', 'AMAZON', 'FLIPKART', 'MEESHO', 'DIRECT', 'OTHER') then raise exception 'Unknown channel filter' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'PENDING', 'CONFIRMED', 'IN_PACKING', 'DISPATCHED', 'CANCELLED') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select o.id, o.order_no, o.order_date, o.status, o.channel, o.dispatch_date, o.created_at, o.expected_dispatch,
           c.id as customer_id, c.name as customer_name, l.id as location_id, l.name as place_name,
           coalesce(t.items, 0) as items, coalesce(t.qty, 0) as qty,
           coalesce(t.sub, 0) - o.discount + o.shipping_charges as total
      from public.sales_orders o
      join public.customers c on c.id = o.customer_id
      join public.locations l on l.id = o.location_id
      left join (select sl.order_id, count(*) as items, sum(sl.quantity) as qty, sum(sl.quantity * sl.rate) as sub from public.sales_order_lines sl group by sl.order_id) t on t.order_id = o.id
  ),
  filtered as (
    select b.* from base b
     where (coalesce(p_channel, '') in ('', 'all') or b.channel = p_channel)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (p_customer is null or b.customer_id = p_customer)
       and (p_from is null or b.order_date >= p_from)
       and (p_to is null or b.order_date <= p_to)
       and (coalesce(p_q, '') = '' or b.order_no ilike v_like or b.customer_name ilike v_like
            or exists (select 1 from public.sales_order_lines sl join public.items i on i.id = sl.item_id
                        where sl.order_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.order_no desc), '[]'::jsonb)
               from (select * from filtered order by created_at desc, order_no desc limit v_limit offset v_offset) t),
    'customers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.customers),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'pending', (select count(*) from base where status = 'PENDING'),
      'confirmed', (select count(*) from base where status = 'CONFIRMED'),
      'in_packing', (select count(*) from base where status = 'IN_PACKING'),
      'dispatched', (select count(*) from base where status = 'DISPATCHED'),
      'cancelled', (select count(*) from base where status = 'CANCELLED'),
      'new_month', (select count(*) from base where order_date >= date_trunc('month', v_today)::date)),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', s.d::text, 'orders', coalesce(x.n, 0), 'value', coalesce(x.v, 0)) order by s.d), '[]'::jsonb)
                from (select (v_today - g)::date as d from generate_series(0, 29) g) s
                left join (select order_date as d, count(*) as n, sum(total) as v from base where status <> 'CANCELLED' group by 1) x on x.d = s.d))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.sales_orders_page(text, text, text, uuid, date, date, int, int) from public, anon;
grant execute on function public.sales_orders_page(text, text, text, uuid, date, date, int, int) to authenticated;

-- People who work with sales orders must be able to read the customer list (to pick a customer and to see the name on an order).
drop policy customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using ((select public.has_permission('customers.view')) or (select public.has_permission('customers.manage'))
         or (select public.has_permission('bills.create')) or (select public.has_permission('bills.view'))
         or (select public.has_permission('sales_orders.view')) or (select public.has_permission('sales_orders.create')) or (select public.has_permission('sales_orders.confirm')));
