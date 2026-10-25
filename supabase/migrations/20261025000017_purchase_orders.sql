-- P9: purchase orders (idea taken from the owner's separate ERP repo, rebuilt for this database).
-- Flow: DRAFT -> SENT -> PARTIAL -> COMPLETED, or CANCELLED (before anything is received).
-- A goods receipt can be made "against" a purchase order; posting it updates the received quantities and the PO status.
-- Prices stay behind receipts.cost, exactly like on receipts. No tax (owner: later).

create type public.po_status as enum ('DRAFT', 'SENT', 'PARTIAL', 'COMPLETED', 'CANCELLED');

insert into public.permissions (key, module, description) values
  ('purchase.view',    'purchasing', 'See purchase orders of your locations'),
  ('purchase.create',  'purchasing', 'Create and edit draft purchase orders'),
  ('purchase.approve', 'purchasing', 'Send, cancel or close a purchase order');

create sequence public.purchase_order_seq;
revoke all on sequence public.purchase_order_seq from public, anon, authenticated;

create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  po_no         text not null unique default ('PO-' || lpad(nextval('public.purchase_order_seq')::text, 6, '0')),
  supplier_id   uuid not null references public.suppliers (id) on delete restrict,
  location_id   uuid not null references public.locations (id) on delete restrict,
  order_date    date not null default current_date,
  expected_date date,
  notes         text check (notes is null or char_length(notes) <= 1000),
  status        public.po_status not null default 'DRAFT',
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id),
  sent_at       timestamptz,
  sent_by       uuid references public.profiles (id),
  closed_at     timestamptz,
  closed_by     uuid references public.profiles (id),
  close_note    text check (close_note is null or char_length(close_note) <= 300),
  constraint purchase_orders_dates check (expected_date is null or expected_date >= order_date)
);
create index purchase_orders_location_idx on public.purchase_orders (location_id, created_at desc);
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
alter table public.purchase_orders enable row level security;
create trigger purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
create trigger purchase_orders_audit after insert or update or delete on public.purchase_orders
  for each row execute function public.log_audit();

create table public.purchase_order_lines (
  id           bigint generated always as identity primary key,
  po_id        uuid not null references public.purchase_orders (id) on delete cascade,
  item_id      uuid not null references public.items (id) on delete restrict,
  quantity     numeric(14,3) not null check (quantity > 0),
  received_qty numeric(14,3) not null default 0 check (received_qty >= 0),
  constraint purchase_order_lines_one_per_item unique (po_id, item_id)
);
alter table public.purchase_order_lines enable row level security;

create table public.purchase_order_costs (
  line_id   bigint primary key references public.purchase_order_lines (id) on delete cascade,
  unit_cost numeric(14,4) not null check (unit_cost >= 0)
);
alter table public.purchase_order_costs enable row level security;

-- Which receipt belongs to which order (optional).
alter table public.goods_receipts add column purchase_order_id uuid references public.purchase_orders (id) on delete restrict;
create index goods_receipts_po_idx on public.goods_receipts (purchase_order_id) where purchase_order_id is not null;

-- ---------- guards ----------
-- Status moves only forward; after DRAFT the order details cannot change; nothing is ever deleted.
create or replace function public.purchase_orders_flow()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Purchase orders cannot be deleted' using errcode = '42501';
  end if;
  if old.status = 'DRAFT' and new.status = 'DRAFT' then
    return new;
  end if;
  if old.status = new.status then
    raise exception 'A purchase order that is not a draft cannot be edited' using errcode = '42501';
  end if;
  if not ((old.status = 'DRAFT'   and new.status in ('SENT', 'CANCELLED'))
       or (old.status = 'SENT'    and new.status in ('PARTIAL', 'COMPLETED', 'CANCELLED'))
       or (old.status = 'PARTIAL' and new.status = 'COMPLETED')) then
    raise exception 'A % purchase order cannot become %', lower(old.status::text), lower(new.status::text) using errcode = '42501';
  end if;
  if new.supplier_id <> old.supplier_id or new.location_id <> old.location_id or new.order_date <> old.order_date
     or new.expected_date is distinct from old.expected_date or new.notes is distinct from old.notes
     or new.po_no <> old.po_no then
    raise exception 'The details of a sent purchase order cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger purchase_orders_flow_guard before update or delete on public.purchase_orders
  for each row execute function public.purchase_orders_flow();

-- Lines: insert/delete only while the order is a DRAFT. Afterwards only received_qty may go up (by posting a receipt).
create or replace function public.purchase_order_lines_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.po_status;
begin
  select status into v_status from public.purchase_orders where id = coalesce(new.po_id, old.po_id);
  if tg_op = 'UPDATE' and v_status is distinct from 'DRAFT' then
    if new.po_id <> old.po_id or new.item_id <> old.item_id or new.quantity <> old.quantity or new.received_qty < old.received_qty then
      raise exception 'The lines of a sent purchase order cannot be changed' using errcode = '42501';
    end if;
    return new;
  end if;
  if v_status is distinct from 'DRAFT' then
    raise exception 'The lines of a sent purchase order cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.purchase_order_lines_guard() from public, anon, authenticated;
create trigger purchase_order_lines_guard before insert or update or delete on public.purchase_order_lines
  for each row execute function public.purchase_order_lines_guard();

create or replace function public.purchase_order_costs_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.po_status;
begin
  select o.status into v_status from public.purchase_order_lines l join public.purchase_orders o on o.id = l.po_id
   where l.id = coalesce(new.line_id, old.line_id);
  if v_status is distinct from 'DRAFT' then
    raise exception 'The prices of a sent purchase order cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.purchase_order_costs_guard() from public, anon, authenticated;
create trigger purchase_order_costs_guard before insert or update or delete on public.purchase_order_costs
  for each row execute function public.purchase_order_costs_guard();
revoke all on function public.purchase_orders_flow() from public, anon, authenticated;

-- ---------- read rules (no direct writes for anyone) ----------
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (((select public.has_permission('purchase.view')) or (select public.has_permission('purchase.create'))
          or (select public.has_permission('purchase.approve')))
         and (select public.can_access_location(location_id)));
create policy purchase_order_lines_select on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders o where o.id = purchase_order_lines.po_id));
create policy purchase_order_costs_select on public.purchase_order_costs for select to authenticated
  using ((select public.has_permission('receipts.cost'))
         and exists (select 1 from public.purchase_order_lines l where l.id = purchase_order_costs.line_id));

-- ---------- save a draft ----------
-- p_header: {supplier_id, location_id, order_date, expected_date, notes}
-- p_lines : [{item_id, quantity, unit_cost}]   (unit_cost only used by people with receipts.cost)
create or replace function public.save_purchase_order(p_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_date date := coalesce(nullif(p_header->>'order_date', '')::date, current_date);
  v_exp date := nullif(p_header->>'expected_date', '')::date;
  v_notes text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_can_cost boolean := public.has_permission('receipts.cost');
  v_id uuid; v_no text; v_status public.po_status; v_old_loc uuid;
  v_old_costs jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  x record; v_dec smallint; v_code text; v_line bigint; v_cost numeric; v_n int;
begin
  if not public.has_permission('purchase.create') then
    raise exception 'missing permission: purchase.create' using errcode = '42501';
  end if;
  if not public.can_access_location(v_loc) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locations where id = v_loc and is_active) then
    raise exception 'location not found or archived';
  end if;
  if not exists (select 1 from public.suppliers where id = v_supplier and is_active) then
    raise exception 'Supplier not found or archived';
  end if;
  if v_exp is not null and v_exp < v_date then
    raise exception 'The expected date cannot be before the order date';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 500 then raise exception 'at most 500 lines per order'; end if;

  if p_id is not null then
    select status, location_id into v_status, v_old_loc from public.purchase_orders where id = p_id for update;
    if not found then raise exception 'purchase order not found'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft purchase order can be edited' using errcode = '42501'; end if;
    if not public.can_access_location(v_old_loc) then
      raise exception 'you do not work in this location' using errcode = '42501';
    end if;
  end if;

  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, unit_cost numeric) loop
    select i.internal_item_code, u.decimals into v_code, v_dec
      from public.items i join public.units u on u.code = i.unit
      where i.id = x.item_id and i.is_active;
    if not found then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found or archived');
    elsif x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, v_dec) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code,
        'message', case when v_dec = 0 then 'This item is ordered in whole numbers' else 'At most ' || v_dec || ' decimals for this unit' end);
    elsif x.unit_cost is not null and (x.unit_cost < 0 or x.unit_cost > 999999999) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Price is not valid');
    end if;
  end loop;
  for x in select (e->>'item_id')::uuid as item_id, count(*) as n
           from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop
    v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'The same item is listed twice');
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  if p_id is null then
    insert into public.purchase_orders (supplier_id, location_id, order_date, expected_date, notes)
    values (v_supplier, v_loc, v_date, v_exp, v_notes) returning id, po_no into v_id, v_no;
  else
    select coalesce(jsonb_object_agg(l.item_id::text, c.unit_cost), '{}'::jsonb) into v_old_costs
      from public.purchase_order_lines l join public.purchase_order_costs c on c.line_id = l.id where l.po_id = p_id;
    update public.purchase_orders
       set supplier_id = v_supplier, location_id = v_loc, order_date = v_date, expected_date = v_exp,
           notes = v_notes, updated_by = (select auth.uid())
     where id = p_id returning id, po_no into v_id, v_no;
    delete from public.purchase_order_lines where po_id = v_id;
  end if;

  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, unit_cost numeric) loop
    insert into public.purchase_order_lines (po_id, item_id, quantity) values (v_id, x.item_id, x.quantity) returning id into v_line;
    v_cost := case when v_can_cost then x.unit_cost else (v_old_costs->>(x.item_id::text))::numeric end;
    if v_cost is not null then
      insert into public.purchase_order_costs (line_id, unit_cost) values (v_line, v_cost);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'po_no', v_no, 'errors', '[]'::jsonb);
end $$;

-- ---------- send / cancel / close ----------
create or replace function public.send_purchase_order(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.purchase_orders%rowtype;
begin
  if not public.has_permission('purchase.approve') then
    raise exception 'missing permission: purchase.approve' using errcode = '42501';
  end if;
  select * into o from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'purchase order not found'; end if;
  if not public.can_access_location(o.location_id) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if o.status <> 'DRAFT' then raise exception 'This purchase order is already %', lower(o.status::text); end if;
  if not exists (select 1 from public.purchase_order_lines where po_id = p_id) then raise exception 'The purchase order has no lines'; end if;
  if not exists (select 1 from public.suppliers where id = o.supplier_id and is_active) then raise exception 'The supplier is archived'; end if;
  if exists (select 1 from public.purchase_order_lines l join public.items i on i.id = l.item_id where l.po_id = p_id and not i.is_active) then
    raise exception 'An item on the order is archived. Remove it first.';
  end if;
  update public.purchase_orders set status = 'SENT', sent_at = now(), sent_by = (select auth.uid()), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SEND_PO', 'purchase_orders', p_id::text, jsonb_build_object('po_no', o.po_no));
  return jsonb_build_object('ok', true, 'po_no', o.po_no);
end $$;

create or replace function public.cancel_purchase_order(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.purchase_orders%rowtype;
begin
  if not public.has_permission('purchase.approve') then
    raise exception 'missing permission: purchase.approve' using errcode = '42501';
  end if;
  select * into o from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'purchase order not found'; end if;
  if not public.can_access_location(o.location_id) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if o.status not in ('DRAFT', 'SENT') then
    raise exception 'A % purchase order cannot be cancelled. Use "close" if the rest will not come.', lower(o.status::text);
  end if;
  if exists (select 1 from public.goods_receipts r where r.purchase_order_id = p_id and r.status <> 'CANCELLED') then
    raise exception 'There are receipts against this order. Cancel the draft receipts first, or close the order.';
  end if;
  update public.purchase_orders set status = 'CANCELLED', closed_at = now(), closed_by = (select auth.uid()), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'CANCEL_PO', 'purchase_orders', p_id::text, jsonb_build_object('po_no', o.po_no));
  return jsonb_build_object('ok', true, 'po_no', o.po_no);
end $$;

-- Close a partly received order: the supplier will not send the rest.
create or replace function public.close_purchase_order(p_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.purchase_orders%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_permission('purchase.approve') then
    raise exception 'missing permission: purchase.approve' using errcode = '42501';
  end if;
  if v_note is null then raise exception 'Write a short reason'; end if;
  if char_length(v_note) > 300 then raise exception 'The reason is too long (max 300)'; end if;
  select * into o from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'purchase order not found'; end if;
  if not public.can_access_location(o.location_id) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if o.status <> 'PARTIAL' then raise exception 'Only a partly received order can be closed'; end if;
  update public.purchase_orders set status = 'COMPLETED', closed_at = now(), closed_by = (select auth.uid()), close_note = v_note, updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'CLOSE_PO', 'purchase_orders', p_id::text, jsonb_build_object('po_no', o.po_no, 'note', v_note));
  return jsonb_build_object('ok', true, 'po_no', o.po_no);
end $$;

-- ---------- receipts against an order ----------
-- save_goods_receipt: same as before, plus an optional purchase_order_id in the header.
create or replace function public.save_goods_receipt(p_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_date date := coalesce(nullif(p_header->>'receipt_date', '')::date, current_date);
  v_inv text := nullif(btrim(coalesce(p_header->>'supplier_invoice_no', '')), '');
  v_notes text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_po uuid := nullif(p_header->>'purchase_order_id', '')::uuid;
  v_can_cost boolean := public.has_permission('receipts.cost');
  v_id uuid; v_no text; v_status public.receipt_status; v_old_loc uuid;
  v_old_costs jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  po public.purchase_orders%rowtype;
  x record; v_dec smallint; v_code text; v_line bigint; v_cost numeric; v_n int; v_open numeric;
begin
  if not public.has_permission('receipts.create') then
    raise exception 'missing permission: receipts.create' using errcode = '42501';
  end if;
  if not public.can_access_location(v_loc) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locations where id = v_loc and is_active) then
    raise exception 'location not found or archived';
  end if;
  if not exists (select 1 from public.suppliers where id = v_supplier and is_active) then
    raise exception 'Supplier not found or archived';
  end if;
  if v_po is not null then
    select * into po from public.purchase_orders where id = v_po;
    if not found then raise exception 'purchase order not found'; end if;
    if po.status not in ('SENT', 'PARTIAL') then raise exception 'The purchase order % is not open for receiving', po.po_no; end if;
    if po.supplier_id <> v_supplier then raise exception 'The supplier must be the one on the purchase order'; end if;
    if po.location_id <> v_loc then raise exception 'The purchase order is for another place'; end if;
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 500 then raise exception 'at most 500 lines per receipt'; end if;

  if p_id is not null then
    select status, location_id into v_status, v_old_loc from public.goods_receipts where id = p_id for update;
    if not found then raise exception 'receipt not found'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft receipt can be edited' using errcode = '42501'; end if;
    if not public.can_access_location(v_old_loc) then
      raise exception 'you do not work in this location' using errcode = '42501';
    end if;
  end if;

  -- pass 1: check every line
  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, unit_cost numeric) loop
    select i.internal_item_code, u.decimals into v_code, v_dec
      from public.items i join public.units u on u.code = i.unit
      where i.id = x.item_id and i.is_active;
    if not found then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found or archived');
    elsif x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, v_dec) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code,
        'message', case when v_dec = 0 then 'This item is received in whole numbers' else 'At most ' || v_dec || ' decimals for this unit' end);
    elsif x.unit_cost is not null and (x.unit_cost < 0 or x.unit_cost > 999999999) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Price is not valid');
    elsif v_po is not null then
      select l.quantity - l.received_qty into v_open from public.purchase_order_lines l where l.po_id = v_po and l.item_id = x.item_id;
      if not found then
        v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'This item is not on the purchase order');
      elsif x.quantity > v_open then
        v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'More than still open on the order (' || v_open || ')');
      end if;
    end if;
  end loop;
  for x in select (e->>'item_id')::uuid as item_id, count(*) as n
           from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop
    v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'The same item is listed twice');
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  -- pass 2: write
  if p_id is null then
    insert into public.goods_receipts (supplier_id, location_id, receipt_date, supplier_invoice_no, notes, purchase_order_id)
    values (v_supplier, v_loc, v_date, v_inv, v_notes, v_po) returning id, receipt_no into v_id, v_no;
  else
    select coalesce(jsonb_object_agg(l.item_id::text, c.unit_cost), '{}'::jsonb) into v_old_costs
      from public.goods_receipt_lines l join public.goods_receipt_costs c on c.line_id = l.id where l.receipt_id = p_id;
    update public.goods_receipts
       set supplier_id = v_supplier, location_id = v_loc, receipt_date = v_date,
           supplier_invoice_no = v_inv, notes = v_notes, purchase_order_id = v_po, updated_by = (select auth.uid())
     where id = p_id returning id, receipt_no into v_id, v_no;
    delete from public.goods_receipt_lines where receipt_id = v_id;
  end if;

  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, unit_cost numeric) loop
    insert into public.goods_receipt_lines (receipt_id, item_id, quantity) values (v_id, x.item_id, x.quantity) returning id into v_line;
    v_cost := case when v_can_cost then x.unit_cost else (v_old_costs->>(x.item_id::text))::numeric end;
    if v_cost is not null then
      insert into public.goods_receipt_costs (line_id, unit_cost) values (v_line, v_cost);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'receipt_no', v_no, 'errors', '[]'::jsonb);
end $$;

-- post_goods_receipt: same as before; if the receipt belongs to an order, the received quantities and the
-- order status are updated in the same transaction (and the order is re-checked, so two drafts cannot over-receive).
create or replace function public.post_goods_receipt(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.goods_receipts%rowtype;
  po public.purchase_orders%rowtype;
  v_lines int; v_bad text; v_done boolean;
begin
  if not public.has_permission('receipts.post') then
    raise exception 'missing permission: receipts.post' using errcode = '42501';
  end if;
  select * into r from public.goods_receipts where id = p_id for update;
  if not found then raise exception 'receipt not found'; end if;
  if not public.can_access_location(r.location_id) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if r.status <> 'DRAFT' then raise exception 'This receipt is already %', lower(r.status::text); end if;
  if not exists (select 1 from public.locations where id = r.location_id and is_active) then
    raise exception 'location archived';
  end if;
  select count(*) into v_lines from public.goods_receipt_lines where receipt_id = p_id;
  if v_lines = 0 then raise exception 'The receipt has no lines'; end if;

  select string_agg(i.internal_item_code, ', ') into v_bad
    from public.goods_receipt_lines l join public.items i on i.id = l.item_id where l.receipt_id = p_id and not i.is_active;
  if v_bad is not null then raise exception 'Archived item(s) on the receipt: %. Remove them first.', v_bad; end if;

  select string_agg(i.internal_item_code, ', ') into v_bad
    from public.goods_receipt_lines l join public.items i on i.id = l.item_id join public.units u on u.code = i.unit
    where l.receipt_id = p_id and l.quantity <> round(l.quantity, u.decimals);
  if v_bad is not null then raise exception 'Quantity has too many decimals for: %', v_bad; end if;

  if r.purchase_order_id is not null then
    select * into po from public.purchase_orders where id = r.purchase_order_id for update;
    if po.status not in ('SENT', 'PARTIAL') then
      raise exception 'The purchase order % is not open for receiving (it is %)', po.po_no, lower(po.status::text);
    end if;
    select string_agg(i.internal_item_code, ', ') into v_bad
      from public.goods_receipt_lines l
      join public.items i on i.id = l.item_id
      left join public.purchase_order_lines pl on pl.po_id = po.id and pl.item_id = l.item_id
      where l.receipt_id = p_id and (pl.id is null or l.quantity > pl.quantity - pl.received_qty);
    if v_bad is not null then raise exception 'More than still open on purchase order %: %', po.po_no, v_bad; end if;
    update public.purchase_order_lines pl set received_qty = pl.received_qty + l.quantity
      from public.goods_receipt_lines l where l.receipt_id = p_id and pl.po_id = po.id and pl.item_id = l.item_id;
    select not exists (select 1 from public.purchase_order_lines where po_id = po.id and received_qty < quantity) into v_done;
    if v_done then
      update public.purchase_orders set status = 'COMPLETED', closed_at = now(), updated_by = (select auth.uid()) where id = po.id;
    elsif po.status = 'SENT' then
      update public.purchase_orders set status = 'PARTIAL', updated_by = (select auth.uid()) where id = po.id;
    end if;
  end if;

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, null, r.location_id, l.quantity, 'RECEIPT', 'Goods receipt ' || r.receipt_no, r.receipt_no
    from public.goods_receipt_lines l where l.receipt_id = p_id order by l.id;

  update public.goods_receipts
     set status = 'POSTED', posted_at = now(), posted_by = (select auth.uid()), updated_by = (select auth.uid())
   where id = p_id;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'POST_RECEIPT', 'goods_receipts', p_id::text,
          jsonb_build_object('receipt_no', r.receipt_no, 'lines', v_lines, 'location_id', r.location_id, 'purchase_order_id', r.purchase_order_id));
  return jsonb_build_object('ok', true, 'receipt_no', r.receipt_no, 'lines', v_lines);
end $$;

-- ---------- grants ----------
revoke all on function public.save_purchase_order(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.send_purchase_order(uuid) from public, anon;
revoke all on function public.cancel_purchase_order(uuid) from public, anon;
revoke all on function public.close_purchase_order(uuid, text) from public, anon;
revoke all on function public.save_goods_receipt(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.post_goods_receipt(uuid) from public, anon;
grant execute on function public.save_purchase_order(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.send_purchase_order(uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;
grant execute on function public.close_purchase_order(uuid, text) to authenticated;
grant execute on function public.save_goods_receipt(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.post_goods_receipt(uuid) to authenticated;
