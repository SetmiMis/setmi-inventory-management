-- Stock: units of measure, append-only movement ledger, balances kept by a trigger,
-- reorder levels, and the one function that lets users count / correct stock.
-- Design: docs/features/FEATURE-005-STOCK.md

-- ---------- permissions ----------
insert into public.permissions (key, module, description) values
  ('stock.view',       'stock', 'See stock quantities and movement history of your locations'),
  ('stock.adjust',     'stock', 'Enter stock counts / opening stock / corrections in your locations'),
  ('stock.min_levels', 'stock', 'Set minimum and maximum stock levels'),
  ('units.manage',     'stock', 'Create and edit units of measure');

-- ---------- units of measure ----------
create table public.units (
  code      text primary key check (code ~ '^[A-Z0-9]{1,10}$'),
  name      text not null check (btrim(name) <> '' and char_length(name) <= 50),
  decimals  smallint not null check (decimals between 0 and 3),
  is_active boolean not null default true
);
alter table public.units enable row level security;
insert into public.units (code, name, decimals) values
  ('PCS', 'Pieces', 0), ('MTR', 'Metres', 3), ('BOX', 'Boxes', 0), ('SET', 'Sets', 0), ('KG', 'Kilograms', 3);

alter table public.items
  add constraint items_unit_fk foreign key (unit) references public.units (code) on update cascade;

create policy units_select on public.units for select to authenticated using (true);
create policy units_insert on public.units for insert to authenticated
  with check ((select public.has_permission('units.manage')));
create policy units_update on public.units for update to authenticated
  using ((select public.has_permission('units.manage')))
  with check ((select public.has_permission('units.manage')));
create trigger units_audit after insert or update or delete on public.units
  for each row execute function public.log_audit();

-- The unit decides how many decimals a quantity may have, so it cannot change once stock exists.
-- security definer: it must see ALL movements, whoever the editing user is.
create or replace function public.items_unit_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.unit is distinct from old.unit
     and exists (select 1 from public.stock_movements m where m.item_id = old.id) then
    raise exception 'The unit cannot be changed after the item has stock history' using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------- movement ledger (append only) ----------
create type public.stock_movement_type as enum ('OPENING', 'ADJUSTMENT', 'RECEIPT', 'SALE', 'TRANSFER');

create table public.stock_movements (
  id               bigint generated always as identity primary key,
  item_id          uuid not null references public.items (id) on delete restrict,
  -- An empty end means "outside": a supplier, a customer, or a loss / found-stock correction.
  from_location_id uuid references public.locations (id) on delete restrict,
  to_location_id   uuid references public.locations (id) on delete restrict,
  quantity         numeric(14,3) not null check (quantity > 0),
  movement_type    public.stock_movement_type not null,
  reason           text check (reason is null or char_length(reason) <= 300),
  reference        text check (reference is null or char_length(reference) <= 100),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) default auth.uid(),
  constraint stock_movements_has_a_place check (from_location_id is not null or to_location_id is not null),
  constraint stock_movements_two_places check (from_location_id is distinct from to_location_id)
);
create index stock_movements_item_idx on public.stock_movements (item_id, created_at desc);
create index stock_movements_to_idx   on public.stock_movements (to_location_id, created_at desc);
create index stock_movements_from_idx on public.stock_movements (from_location_id, created_at desc);
alter table public.stock_movements enable row level security;

create or replace function public.stock_movements_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'stock_movements is append-only: history cannot be changed or deleted' using errcode = '42501';
end $$;
create trigger stock_movements_no_change before update or delete on public.stock_movements
  for each row execute function public.stock_movements_append_only();

create trigger items_unit_guard_trg before update of unit on public.items
  for each row execute function public.items_unit_guard();

-- ---------- balances (changed only by the trigger below) ----------
create table public.stock_balances (
  item_id     uuid not null references public.items (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  quantity    numeric(14,3) not null default 0 constraint stock_balances_not_negative check (quantity >= 0),
  updated_at  timestamptz not null default now(),
  primary key (item_id, location_id)
);
create index stock_balances_location_idx on public.stock_balances (location_id);
alter table public.stock_balances enable row level security;

create or replace function public.stock_apply_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.from_location_id is not null then
    update public.stock_balances
       set quantity = quantity - new.quantity, updated_at = now()
     where item_id = new.item_id and location_id = new.from_location_id;
    if not found then
      raise exception 'Not enough stock' using errcode = '23514', constraint = 'stock_balances_not_negative';
    end if;
  end if;
  if new.to_location_id is not null then
    insert into public.stock_balances (item_id, location_id, quantity)
    values (new.item_id, new.to_location_id, new.quantity)
    on conflict (item_id, location_id)
    do update set quantity = public.stock_balances.quantity + excluded.quantity, updated_at = now();
  end if;
  return new;
end $$;
revoke all on function public.stock_apply_movement() from public, anon, authenticated;
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function public.stock_apply_movement();

-- ---------- reorder levels ----------
create table public.reorder_levels (
  item_id     uuid not null references public.items (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  min_qty     numeric(14,3) not null check (min_qty >= 0),
  max_qty     numeric(14,3),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) default auth.uid(),
  primary key (item_id, location_id),
  constraint reorder_levels_max_ok check (max_qty is null or max_qty >= min_qty)
);
alter table public.reorder_levels enable row level security;
create trigger reorder_levels_updated_at before update on public.reorder_levels
  for each row execute function public.set_updated_at();
create trigger reorder_levels_audit after insert or update or delete on public.reorder_levels
  for each row execute function public.log_audit();

-- ---------- who can read / write ----------
-- Nobody can insert, update or delete stock_movements / stock_balances directly: no such policy exists.
create policy stock_balances_select on public.stock_balances for select to authenticated
  using ((select public.has_permission('stock.view')) and (select public.can_access_location(location_id)));

create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select public.has_permission('stock.view'))
         and (coalesce((select public.can_access_location(from_location_id)), false)
              or coalesce((select public.can_access_location(to_location_id)), false)));

create policy reorder_levels_select on public.reorder_levels for select to authenticated
  using ((select public.has_permission('stock.view')) and (select public.can_access_location(location_id)));
create policy reorder_levels_insert on public.reorder_levels for insert to authenticated
  with check ((select public.has_permission('stock.min_levels')) and (select public.can_access_location(location_id)));
create policy reorder_levels_update on public.reorder_levels for update to authenticated
  using ((select public.has_permission('stock.min_levels')) and (select public.can_access_location(location_id)))
  with check ((select public.has_permission('stock.min_levels')) and (select public.can_access_location(location_id)));
create policy reorder_levels_delete on public.reorder_levels for delete to authenticated
  using ((select public.has_permission('stock.min_levels')) and (select public.can_access_location(location_id)));

-- ---------- the count function ----------
-- p_rows: [{ "item_id": uuid, "counted": number }]  counted = what is physically there now.
-- The database computes the difference and writes one movement per changed item.
-- All or nothing: if any row is invalid, nothing is written and the problems are returned.
create or replace function public.apply_stock_count(
  p_location uuid, p_rows jsonb, p_reason text, p_kind text default 'ADJUSTMENT')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_type public.stock_movement_type;
  v_old numeric; v_diff numeric; v_dec smallint; v_code text;
  v_errors jsonb := '[]'::jsonb;
  v_changed int := 0; v_same int := 0; v_n int;
begin
  if not public.has_permission('stock.adjust') then
    raise exception 'missing permission: stock.adjust' using errcode = '42501';
  end if;
  if not public.can_access_location(p_location) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locations where id = p_location and is_active) then
    raise exception 'location not found or archived';
  end if;
  if p_kind not in ('ADJUSTMENT', 'OPENING') then raise exception 'kind must be ADJUSTMENT or OPENING'; end if;
  v_type := p_kind::public.stock_movement_type;
  if p_kind = 'OPENING' then v_reason := coalesce(v_reason, 'Opening stock'); end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'A reason of at least 3 characters is required';
  end if;
  if char_length(v_reason) > 300 then raise exception 'The reason is too long (max 300)'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 then raise exception 'no rows'; end if;
  if v_n > 500 then raise exception 'at most 500 rows per count'; end if;

  -- pass 1: check everything, write nothing
  for x in select * from jsonb_to_recordset(p_rows) as t(item_id uuid, counted numeric) loop
    select i.internal_item_code, u.decimals into v_code, v_dec
      from public.items i join public.units u on u.code = i.unit where i.id = x.item_id;
    if not found then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found');
    elsif x.counted is null or x.counted < 0 or x.counted > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Counted quantity must be between 0 and 99,999,999');
    elsif x.counted <> round(x.counted, v_dec) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code,
        'message', case when v_dec = 0 then 'This item is counted in whole numbers' else 'At most ' || v_dec || ' decimals for this unit' end);
    elsif p_kind = 'OPENING' and exists (
        select 1 from public.stock_movements m
        where m.item_id = x.item_id and (m.to_location_id = p_location or m.from_location_id = p_location)) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code,
        'message', 'Already has stock history here: use a normal count, not opening stock');
    end if;
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors, 'changed', 0);
  end if;

  -- pass 2: write. The balance row is locked while the difference is computed.
  for x in select * from jsonb_to_recordset(p_rows) as t(item_id uuid, counted numeric) loop
    select quantity into v_old from public.stock_balances
      where item_id = x.item_id and location_id = p_location for update;
    v_old := coalesce(v_old, 0);
    v_diff := x.counted - v_old;
    if v_diff = 0 then
      v_same := v_same + 1;
    elsif v_diff > 0 then
      insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason)
      values (x.item_id, null, p_location, v_diff, v_type, v_reason);
      v_changed := v_changed + 1;
    else
      insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason)
      values (x.item_id, p_location, null, -v_diff, v_type, v_reason);
      v_changed := v_changed + 1;
    end if;
  end loop;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'STOCK_COUNT', 'locations', p_location::text,
          jsonb_build_object('kind', p_kind, 'reason', v_reason, 'changed', v_changed, 'unchanged', v_same));

  return jsonb_build_object('ok', true, 'changed', v_changed, 'unchanged', v_same, 'errors', '[]'::jsonb);
end $$;

revoke all on function public.apply_stock_count(uuid, jsonb, text, text) from public, anon;
grant execute on function public.apply_stock_count(uuid, jsonb, text, text) to authenticated;
