-- Suppliers and goods receipts (P5). Design: docs/features/FEATURE-006-RECEIVING.md
-- A receipt is a DRAFT (no stock effect) until posted. Posting writes RECEIPT movements into the
-- stock ledger in one transaction. Posted and cancelled receipts can never be changed.
-- Buying prices live in their own table so the database itself can hide them.

insert into public.permissions (key, module, description) values
  ('suppliers.view',   'purchasing', 'See the supplier list'),
  ('suppliers.manage', 'purchasing', 'Create and edit suppliers'),
  ('receipts.view',    'purchasing', 'See goods receipts of your locations'),
  ('receipts.create',  'purchasing', 'Prepare (draft) and cancel goods receipts'),
  ('receipts.post',    'purchasing', 'Confirm (post) goods receipts: this adds stock'),
  ('receipts.cost',    'purchasing', 'See and enter buying prices on goods receipts');

-- ---------- suppliers ----------
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (btrim(name) <> '' and char_length(name) <= 150),
  supplier_type  public.purchase_source not null default 'LOCAL',
  contact_person text check (contact_person is null or char_length(contact_person) <= 100),
  phone          text check (phone is null or char_length(phone) <= 30),
  email          text check (email is null or char_length(email) <= 150),
  address        text check (address is null or char_length(address) <= 500),
  country        text check (country is null or char_length(country) <= 60),
  gstin          text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  notes          text check (notes is null or char_length(notes) <= 1000),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id)
);
create unique index suppliers_name_uq on public.suppliers (lower(btrim(name)));
alter table public.suppliers enable row level security;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger suppliers_audit after insert or update or delete on public.suppliers
  for each row execute function public.log_audit();

create or replace function public.suppliers_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  new.updated_by := (select auth.uid());
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;
create trigger suppliers_guard before update on public.suppliers
  for each row execute function public.suppliers_guard_update();

-- ---------- receipts ----------
create type public.receipt_status as enum ('DRAFT', 'POSTED', 'CANCELLED');
create sequence public.goods_receipt_seq;
revoke all on sequence public.goods_receipt_seq from public, anon, authenticated;

create table public.goods_receipts (
  id                  uuid primary key default gen_random_uuid(),
  receipt_no          text not null unique default ('GRN-' || lpad(nextval('public.goods_receipt_seq')::text, 6, '0')),
  supplier_id         uuid not null references public.suppliers (id) on delete restrict,
  location_id         uuid not null references public.locations (id) on delete restrict,
  receipt_date        date not null default current_date,
  supplier_invoice_no text check (supplier_invoice_no is null or char_length(supplier_invoice_no) <= 60),
  notes               text check (notes is null or char_length(notes) <= 1000),
  status              public.receipt_status not null default 'DRAFT',
  created_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id) default auth.uid(),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.profiles (id),
  posted_at           timestamptz,
  posted_by           uuid references public.profiles (id)
);
create index goods_receipts_location_idx on public.goods_receipts (location_id, created_at desc);
create index goods_receipts_supplier_idx on public.goods_receipts (supplier_id);
-- The same supplier invoice cannot be received twice (a cancelled one does not count).
create unique index goods_receipts_invoice_uq on public.goods_receipts (supplier_id, lower(btrim(supplier_invoice_no)))
  where supplier_invoice_no is not null and status <> 'CANCELLED';
alter table public.goods_receipts enable row level security;
create trigger goods_receipts_updated_at before update on public.goods_receipts
  for each row execute function public.set_updated_at();
create trigger goods_receipts_audit after insert or update or delete on public.goods_receipts
  for each row execute function public.log_audit();

create table public.goods_receipt_lines (
  id         bigint generated always as identity primary key,
  receipt_id uuid not null references public.goods_receipts (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete restrict,
  quantity   numeric(14,3) not null check (quantity > 0),
  constraint goods_receipt_lines_one_per_item unique (receipt_id, item_id)
);
alter table public.goods_receipt_lines enable row level security;

create table public.goods_receipt_costs (
  line_id   bigint primary key references public.goods_receipt_lines (id) on delete cascade,
  unit_cost numeric(14,4) not null check (unit_cost >= 0)
);
alter table public.goods_receipt_costs enable row level security;

-- Immutability: only a DRAFT may change; receipts are never deleted.
create or replace function public.goods_receipts_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Receipts cannot be deleted' using errcode = '42501';
  end if;
  if old.status <> 'DRAFT' then
    raise exception 'A posted or cancelled receipt cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger goods_receipts_no_change before update or delete on public.goods_receipts
  for each row execute function public.goods_receipts_immutable();

create or replace function public.goods_receipt_lines_only_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.receipt_status;
begin
  select status into v_status from public.goods_receipts where id = coalesce(new.receipt_id, old.receipt_id);
  if v_status is distinct from 'DRAFT' then
    raise exception 'The lines of a posted or cancelled receipt cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.goods_receipt_lines_only_draft() from public, anon, authenticated;
create trigger goods_receipt_lines_guard before insert or update or delete on public.goods_receipt_lines
  for each row execute function public.goods_receipt_lines_only_draft();

create or replace function public.goods_receipt_costs_only_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.receipt_status;
begin
  select r.status into v_status from public.goods_receipt_lines l
    join public.goods_receipts r on r.id = l.receipt_id where l.id = coalesce(new.line_id, old.line_id);
  -- No parent found = the line itself was just deleted (cascade while a DRAFT is re-saved). Lines of a
  -- posted receipt can never be deleted, so this cannot be used to touch posted prices.
  if v_status is not null and v_status <> 'DRAFT' then
    raise exception 'The prices of a posted or cancelled receipt cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.goods_receipt_costs_only_draft() from public, anon, authenticated;
create trigger goods_receipt_costs_guard before insert or update or delete on public.goods_receipt_costs
  for each row execute function public.goods_receipt_costs_only_draft();

-- ---------- who can read ----------
-- Nobody writes receipts, lines or prices directly: only the functions below do.
create policy suppliers_select on public.suppliers for select to authenticated
  using ((select public.has_permission('suppliers.view')) or (select public.has_permission('receipts.view'))
         or (select public.has_permission('receipts.create')) or (select public.has_permission('receipts.post')));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check ((select public.has_permission('suppliers.manage')));
create policy suppliers_update on public.suppliers for update to authenticated
  using ((select public.has_permission('suppliers.manage')))
  with check ((select public.has_permission('suppliers.manage')));

create policy goods_receipts_select on public.goods_receipts for select to authenticated
  using (((select public.has_permission('receipts.view')) or (select public.has_permission('receipts.create'))
          or (select public.has_permission('receipts.post')))
         and (select public.can_access_location(location_id)));

create policy goods_receipt_lines_select on public.goods_receipt_lines for select to authenticated
  using (exists (select 1 from public.goods_receipts r where r.id = goods_receipt_lines.receipt_id));

create policy goods_receipt_costs_select on public.goods_receipt_costs for select to authenticated
  using ((select public.has_permission('receipts.cost'))
         and exists (select 1 from public.goods_receipt_lines l where l.id = goods_receipt_costs.line_id));

-- ---------- save a draft ----------
-- p_header: {supplier_id, location_id, receipt_date, supplier_invoice_no, notes}
-- p_lines : [{item_id, quantity, unit_cost}]   (unit_cost only used by people with receipts.cost)
-- p_id null = new receipt. Replaces all lines of the draft. All or nothing.
create or replace function public.save_goods_receipt(p_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_supplier uuid := (p_header->>'supplier_id')::uuid;
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_date date := coalesce(nullif(p_header->>'receipt_date', '')::date, current_date);
  v_inv text := nullif(btrim(coalesce(p_header->>'supplier_invoice_no', '')), '');
  v_notes text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_can_cost boolean := public.has_permission('receipts.cost');
  v_id uuid; v_no text; v_status public.receipt_status; v_old_loc uuid;
  v_old_costs jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  x record; v_dec smallint; v_code text; v_line bigint; v_cost numeric; v_n int;
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
    insert into public.goods_receipts (supplier_id, location_id, receipt_date, supplier_invoice_no, notes)
    values (v_supplier, v_loc, v_date, v_inv, v_notes) returning id, receipt_no into v_id, v_no;
  else
    -- people without receipts.cost keep the prices already on the draft
    select coalesce(jsonb_object_agg(l.item_id::text, c.unit_cost), '{}'::jsonb) into v_old_costs
      from public.goods_receipt_lines l join public.goods_receipt_costs c on c.line_id = l.id where l.receipt_id = p_id;
    update public.goods_receipts
       set supplier_id = v_supplier, location_id = v_loc, receipt_date = v_date,
           supplier_invoice_no = v_inv, notes = v_notes, updated_by = (select auth.uid())
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

-- ---------- post: this is the moment stock goes up ----------
create or replace function public.post_goods_receipt(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.goods_receipts%rowtype;
  v_lines int; v_bad text;
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

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, null, r.location_id, l.quantity, 'RECEIPT', 'Goods receipt ' || r.receipt_no, r.receipt_no
    from public.goods_receipt_lines l where l.receipt_id = p_id order by l.id;

  update public.goods_receipts
     set status = 'POSTED', posted_at = now(), posted_by = (select auth.uid()), updated_by = (select auth.uid())
   where id = p_id;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'POST_RECEIPT', 'goods_receipts', p_id::text,
          jsonb_build_object('receipt_no', r.receipt_no, 'lines', v_lines, 'location_id', r.location_id));
  return jsonb_build_object('ok', true, 'receipt_no', r.receipt_no, 'lines', v_lines);
end $$;

-- ---------- cancel a draft ----------
create or replace function public.cancel_goods_receipt(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.goods_receipts%rowtype;
begin
  if not (public.has_permission('receipts.create') or public.has_permission('receipts.post')) then
    raise exception 'missing permission: receipts.create' using errcode = '42501';
  end if;
  select * into r from public.goods_receipts where id = p_id for update;
  if not found then raise exception 'receipt not found'; end if;
  if not public.can_access_location(r.location_id) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if r.status <> 'DRAFT' then raise exception 'Only a draft can be cancelled'; end if;
  update public.goods_receipts set status = 'CANCELLED', updated_by = (select auth.uid()) where id = p_id;
  return jsonb_build_object('ok', true, 'receipt_no', r.receipt_no);
end $$;

revoke all on function public.save_goods_receipt(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.post_goods_receipt(uuid) from public, anon;
revoke all on function public.cancel_goods_receipt(uuid) from public, anon;
revoke all on function public.suppliers_guard_update() from public, anon, authenticated;
revoke all on function public.goods_receipts_immutable() from public, anon, authenticated;
grant execute on function public.save_goods_receipt(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.post_goods_receipt(uuid) to authenticated;
grant execute on function public.cancel_goods_receipt(uuid) to authenticated;
