-- Shop billing (P7), behind an admin ON/OFF switch. Design: docs/features/FEATURE-008-BILLING.md
-- The owner bills in Zoho today, so the switch is OFF by default. While it is OFF the database itself
-- refuses to create bills (hiding menus is not the control). Prices carry no tax yet by owner decision.

insert into public.permissions (key, module, description) values
  ('items.edit_price',      'items',   'Set the selling price of an item'),
  ('bills.view',            'billing', 'See bills of your locations'),
  ('bills.create',          'billing', 'Make bills at your location (stock goes down)'),
  ('bills.void',            'billing', 'Void a bill (stock comes back)'),
  ('bills.override_price',  'billing', 'Change the price of a line while billing');

-- ---------- the switch ----------
create table public.app_settings (
  key        text primary key check (key in ('billing_enabled')),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value) values ('billing_enabled', 'false'::jsonb);
create policy app_settings_select on public.app_settings for select to authenticated using (true);
create trigger app_settings_audit after insert or update on public.app_settings
  for each row execute function public.log_audit();

create or replace function public.billing_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = 'billing_enabled'), false);
$$;

create or replace function public.admin_set_billing_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.app_settings set value = to_jsonb(p_enabled), updated_at = now(), updated_by = (select auth.uid())
   where key = 'billing_enabled';
end $$;

-- ---------- selling price on the item ----------
alter table public.items add column selling_price numeric(14,2) check (selling_price is null or (selling_price >= 0 and selling_price <= 99999999));

create or replace function public.items_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  new.updated_by := (select auth.uid());
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if new.selling_item_name is distinct from old.selling_item_name
     and not (select public.has_permission('items.edit_selling_name')) then
    raise exception 'missing permission: items.edit_selling_name' using errcode = '42501';
  end if;
  if new.selling_price is distinct from old.selling_price
     and not (select public.has_permission('items.edit_price')) then
    raise exception 'missing permission: items.edit_price' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active
     and not (select public.has_permission('items.archive')) then
    raise exception 'missing permission: items.archive' using errcode = '42501';
  end if;
  -- anything other than the archive flag and the price needs items.edit
  if not (select public.has_permission('items.edit'))
     and (to_jsonb(new) - 'is_active' - 'selling_price' - 'updated_at' - 'updated_by')
         is distinct from
         (to_jsonb(old) - 'is_active' - 'selling_price' - 'updated_at' - 'updated_by') then
    raise exception 'missing permission: items.edit' using errcode = '42501';
  end if;
  return new;
end $$;

drop policy items_update on public.items;
create policy items_update on public.items for update to authenticated
  using ((select public.has_permission('items.edit')) or (select public.has_permission('items.archive')) or (select public.has_permission('items.edit_price')))
  with check ((select public.has_permission('items.edit')) or (select public.has_permission('items.archive')) or (select public.has_permission('items.edit_price')));

-- ---------- bills ----------
create type public.bill_status as enum ('COMPLETED', 'VOIDED');
create sequence public.bill_seq;
revoke all on sequence public.bill_seq from public, anon, authenticated;

create table public.bills (
  id             uuid primary key default gen_random_uuid(),
  bill_no        text not null unique default ('BILL-' || lpad(nextval('public.bill_seq')::text, 6, '0')),
  location_id    uuid not null references public.locations (id) on delete restrict,
  location_code  text not null,
  location_name  text not null,
  status         public.bill_status not null default 'COMPLETED',
  customer_name  text check (customer_name is null or char_length(customer_name) <= 100),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 30),
  payment_mode   text not null check (payment_mode in ('CASH', 'UPI', 'CARD', 'OTHER')),
  subtotal       numeric(14,2) not null check (subtotal >= 0),
  discount       numeric(14,2) not null default 0 check (discount >= 0),
  total          numeric(14,2) not null check (total >= 0),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) default auth.uid(),
  voided_at      timestamptz,
  voided_by      uuid references public.profiles (id),
  void_reason    text check (void_reason is null or char_length(void_reason) <= 300),
  constraint bills_total_matches check (total = subtotal - discount and discount <= subtotal)
);
create index bills_location_idx on public.bills (location_id, created_at desc);
alter table public.bills enable row level security;
create trigger bills_audit after insert or update or delete on public.bills
  for each row execute function public.log_audit();

create table public.bill_lines (
  id         bigint generated always as identity primary key,
  bill_id    uuid not null references public.bills (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete restrict,
  -- what was printed on the bill at that moment; later edits to the item never change old bills
  item_code  text not null,
  item_name  text not null,
  unit       text not null,
  quantity   numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  constraint bill_lines_one_per_item unique (bill_id, item_id)
);
alter table public.bill_lines enable row level security;

-- Bills are history: only the void function may change a bill (COMPLETED -> VOIDED); lines never change.
create or replace function public.bills_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Bills cannot be deleted' using errcode = '42501'; end if;
  if old.status <> 'COMPLETED'
     or (to_jsonb(new) - 'status' - 'voided_at' - 'voided_by' - 'void_reason')
        is distinct from (to_jsonb(old) - 'status' - 'voided_at' - 'voided_by' - 'void_reason') then
    raise exception 'A bill cannot be changed (it can only be voided once)' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger bills_no_change before update or delete on public.bills
  for each row execute function public.bills_immutable();

create or replace function public.bill_lines_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then return new; end if;
  raise exception 'The lines of a bill cannot be changed' using errcode = '42501';
end $$;
create trigger bill_lines_no_change before insert or update or delete on public.bill_lines
  for each row execute function public.bill_lines_immutable();

create policy bills_select on public.bills for select to authenticated
  using (((select public.has_permission('bills.view')) or (select public.has_permission('bills.create')) or (select public.has_permission('bills.void')))
         and (select public.can_access_location(location_id)));
create policy bill_lines_select on public.bill_lines for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_lines.bill_id));

-- ---------- make a bill: one call, all or nothing ----------
-- p_header: {location_id, payment_mode, customer_name, customer_phone, discount}
-- p_lines : [{item_id, quantity, unit_price (optional)}]
create or replace function public.create_bill(p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_mode text := upper(btrim(coalesce(p_header->>'payment_mode', '')));
  v_cname text := nullif(btrim(coalesce(p_header->>'customer_name', '')), '');
  v_cphone text := nullif(btrim(coalesce(p_header->>'customer_phone', '')), '');
  v_discount numeric := coalesce(nullif(btrim(coalesce(p_header->>'discount', '')), '')::numeric, 0);
  v_override boolean := public.has_permission('bills.override_price');
  v_lc text; v_ln text; v_id uuid; v_no text; v_sub numeric := 0; v_total numeric; v_n int; v_bad text;
  v_errors jsonb := '[]'::jsonb; x record; v_price numeric;
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

  insert into public.bills (location_id, location_code, location_name, customer_name, customer_phone, payment_mode, subtotal, discount, total)
  values (v_loc, v_lc, v_ln, v_cname, v_cphone, v_mode, v_sub, v_discount, v_total) returning id, bill_no into v_id, v_no;

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

-- ---------- void: the goods come back, the bill stays as history ----------
create or replace function public.void_bill(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bills%rowtype; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  -- Voiding stays possible while billing is switched off: the switch stops NEW bills only.
  if not public.has_permission('bills.void') then
    raise exception 'missing permission: bills.void' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Write a reason (at least 3 letters)'; end if;
  if char_length(v_reason) > 300 then raise exception 'The reason is too long (max 300)'; end if;
  select * into b from public.bills where id = p_id for update;
  if not found then raise exception 'bill not found'; end if;
  if not public.can_access_location(b.location_id) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if b.status <> 'COMPLETED' then raise exception 'This bill is already voided'; end if;

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, null, b.location_id, l.quantity, 'SALE_RETURN', 'Bill voided: ' || left(v_reason, 200), b.bill_no
    from public.bill_lines l where l.bill_id = p_id order by l.id;
  update public.bills set status = 'VOIDED', voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason where id = p_id;
  return jsonb_build_object('ok', true, 'bill_no', b.bill_no);
end $$;

revoke all on function public.billing_enabled() from public, anon;
revoke all on function public.admin_set_billing_enabled(boolean) from public, anon;
revoke all on function public.create_bill(jsonb, jsonb) from public, anon;
revoke all on function public.void_bill(uuid, text) from public, anon;
revoke all on function public.bills_immutable() from public, anon, authenticated;
revoke all on function public.bill_lines_immutable() from public, anon, authenticated;
grant execute on function public.billing_enabled() to authenticated;
grant execute on function public.admin_set_billing_enabled(boolean) to authenticated;
grant execute on function public.create_bill(jsonb, jsonb) to authenticated;
grant execute on function public.void_bill(uuid, text) to authenticated;
