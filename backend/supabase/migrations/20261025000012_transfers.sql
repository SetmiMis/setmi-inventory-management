-- Stock transfers between places (P6). Design: docs/features/FEATURE-007-TRANSFERS.md
-- Goods on the way sit in a hidden system place "IN TRANSIT", so the existing ledger, balances and
-- "never negative" rule are reused. Sending: source -> IN TRANSIT. Receiving: IN TRANSIT -> destination.

insert into public.permissions (key, module, description) values
  ('transfers.view',    'transfers', 'See transfers that start or end at your locations'),
  ('transfers.create',  'transfers', 'Prepare (draft) and cancel transfers from your location'),
  ('transfers.send',    'transfers', 'Send a transfer from your location (stock leaves) or recall a sent one'),
  ('transfers.receive', 'transfers', 'Receive a transfer arriving at your location (stock arrives)');

-- ---------- the hidden system place ----------
insert into public.locations (code, name, type) values ('IN-TRANSIT', 'In transit (system place)', 'TRANSIT');
create unique index locations_one_transit on public.locations ((true)) where type = 'TRANSIT';

create or replace function public.locations_protect_transit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.type = 'TRANSIT' then raise exception 'The in-transit system place cannot be deleted' using errcode = '42501'; end if;
    return old;
  end if;
  if (select auth.uid()) is not null and (new.type = 'TRANSIT' or (tg_op = 'UPDATE' and old.type = 'TRANSIT')) then
    raise exception 'The in-transit system place cannot be created or changed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger locations_protect_transit before insert or update or delete on public.locations
  for each row execute function public.locations_protect_transit();

create or replace function public.user_locations_no_transit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.locations l where l.id = new.location_id and l.type = 'TRANSIT') then
    raise exception 'The in-transit system place cannot be given to a user' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.user_locations_no_transit() from public, anon, authenticated;
create trigger user_locations_no_transit before insert or update on public.user_locations
  for each row execute function public.user_locations_no_transit();

-- Only transfers may touch the in-transit place; a shortage may only leave it.
create or replace function public.stock_movements_transit_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_transit uuid;
begin
  select id into v_transit from public.locations where type = 'TRANSIT';
  if v_transit is not null and (new.from_location_id = v_transit or new.to_location_id = v_transit)
     and new.movement_type not in ('TRANSFER', 'TRANSFER_SHORTAGE') then
    raise exception 'Only transfers may use the in-transit place' using errcode = '42501';
  end if;
  if new.movement_type = 'TRANSFER_SHORTAGE' and not (new.from_location_id = v_transit and new.to_location_id is null) then
    raise exception 'A transfer shortage must leave the in-transit place' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.stock_movements_transit_guard() from public, anon, authenticated;
create trigger stock_movements_transit_guard_trg before insert on public.stock_movements
  for each row execute function public.stock_movements_transit_guard();

-- The stock list never shows the system place.
create or replace view public.stock_overview with (security_invoker = true) as
select i.id as item_id, i.internal_item_code, i.item_name, i.selling_item_name, i.unit,
       l.id as location_id, coalesce(b.quantity, 0) as quantity, rl.min_qty, rl.max_qty,
       (rl.min_qty is not null and rl.min_qty > 0 and coalesce(b.quantity, 0) < rl.min_qty) as is_low
from public.items i
cross join public.locations l
left join public.stock_balances b on b.item_id = i.id and b.location_id = l.id
left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = l.id
where i.is_active and l.is_active and l.type <> 'TRANSIT' and (select public.has_permission('stock.view'));

-- ---------- documents ----------
create type public.transfer_status as enum ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');
create sequence public.stock_transfer_seq;
revoke all on sequence public.stock_transfer_seq from public, anon, authenticated;

create table public.stock_transfers (
  id               uuid primary key default gen_random_uuid(),
  transfer_no      text not null unique default ('TRF-' || lpad(nextval('public.stock_transfer_seq')::text, 6, '0')),
  from_location_id uuid not null references public.locations (id) on delete restrict,
  to_location_id   uuid not null references public.locations (id) on delete restrict,
  -- names are copied at save time so every user sees both ends, even places they do not work in
  from_code text not null, from_name text not null, to_code text not null, to_name text not null,
  status           public.transfer_status not null default 'DRAFT',
  notes            text check (notes is null or char_length(notes) <= 1000),
  has_shortage     boolean not null default false,
  receive_note     text check (receive_note is null or char_length(receive_note) <= 1000),
  created_at timestamptz not null default now(), created_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles (id),
  sent_at timestamptz, sent_by uuid references public.profiles (id),
  received_at timestamptz, received_by uuid references public.profiles (id),
  constraint stock_transfers_two_places check (from_location_id <> to_location_id)
);
create index stock_transfers_from_idx on public.stock_transfers (from_location_id, created_at desc);
create index stock_transfers_to_idx on public.stock_transfers (to_location_id, created_at desc);
alter table public.stock_transfers enable row level security;
create trigger stock_transfers_updated_at before update on public.stock_transfers
  for each row execute function public.set_updated_at();
create trigger stock_transfers_audit after insert or update or delete on public.stock_transfers
  for each row execute function public.log_audit();

create table public.stock_transfer_lines (
  id                bigint generated always as identity primary key,
  transfer_id       uuid not null references public.stock_transfers (id) on delete cascade,
  item_id           uuid not null references public.items (id) on delete restrict,
  quantity_sent     numeric(14,3) not null check (quantity_sent > 0),
  quantity_received numeric(14,3) check (quantity_received is null or quantity_received >= 0),
  constraint stock_transfer_lines_one_per_item unique (transfer_id, item_id)
);
alter table public.stock_transfer_lines enable row level security;

-- Status can only move forward; finished documents never change; nothing is deleted.
create or replace function public.stock_transfers_flow()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Transfers cannot be deleted' using errcode = '42501'; end if;
  if old.status in ('RECEIVED', 'CANCELLED') then
    raise exception 'A finished transfer cannot be changed' using errcode = '42501';
  end if;
  if old.status = 'SENT' and (new.status not in ('SENT', 'RECEIVED', 'CANCELLED')
       or new.from_location_id <> old.from_location_id or new.to_location_id <> old.to_location_id) then
    raise exception 'A sent transfer can only be received or recalled' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger stock_transfers_flow_trg before update or delete on public.stock_transfers
  for each row execute function public.stock_transfers_flow();

create or replace function public.stock_transfer_lines_flow()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.transfer_status;
begin
  select status into v_status from public.stock_transfers where id = coalesce(new.transfer_id, old.transfer_id);
  if v_status is null then return coalesce(new, old); end if;   -- parent already gone (cascade)
  if v_status = 'DRAFT' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and v_status = 'SENT'
     and new.quantity_sent = old.quantity_sent and new.item_id = old.item_id and new.transfer_id = old.transfer_id then
    return new;                                                  -- only quantity_received may be filled in
  end if;
  raise exception 'The lines of a sent or finished transfer cannot be changed' using errcode = '42501';
end $$;
revoke all on function public.stock_transfer_lines_flow() from public, anon, authenticated;
create trigger stock_transfer_lines_flow_trg before insert or update or delete on public.stock_transfer_lines
  for each row execute function public.stock_transfer_lines_flow();

-- ---------- who can read (writes only through the functions) ----------
create policy stock_transfers_select on public.stock_transfers for select to authenticated
  using (((select public.has_permission('transfers.view')) or (select public.has_permission('transfers.create'))
          or (select public.has_permission('transfers.send')) or (select public.has_permission('transfers.receive')))
         and ((select public.can_access_location(from_location_id)) or (select public.can_access_location(to_location_id))));
create policy stock_transfer_lines_select on public.stock_transfer_lines for select to authenticated
  using (exists (select 1 from public.stock_transfers t where t.id = stock_transfer_lines.transfer_id));

-- ---------- helpers for the screens ----------
-- A sender may not work in the destination, so a plain query on locations would hide it.
create or replace function public.transfer_destinations()
returns table (id uuid, code text, name text, type public.location_type)
language sql stable security definer set search_path = '' as $$
  select l.id, l.code, l.name, l.type from public.locations l
  where l.is_active and l.type <> 'TRANSIT' and public.has_permission('transfers.create')
  order by l.name;
$$;

-- Items below their minimum at the destination, how many to send (up to the maximum, or twice the
-- minimum), never more than the source has. Returns nothing unless the caller may send from p_from.
create or replace function public.suggest_transfer_lines(p_from uuid, p_to uuid)
returns table (item_id uuid, code text, name text, unit text, decimals smallint, suggested numeric, available numeric)
language sql stable security definer set search_path = '' as $$
  with need as (
    select rl.item_id, i.internal_item_code as code, i.item_name as name, i.unit, u.decimals,
           coalesce(rl.max_qty, rl.min_qty * 2) - coalesce(bt.quantity, 0) as want,
           coalesce(bf.quantity, 0) as avail
    from public.reorder_levels rl
    join public.items i on i.id = rl.item_id and i.is_active
    join public.units u on u.code = i.unit
    left join public.stock_balances bt on bt.item_id = rl.item_id and bt.location_id = p_to
    left join public.stock_balances bf on bf.item_id = rl.item_id and bf.location_id = p_from
    where rl.location_id = p_to and rl.min_qty > 0 and coalesce(bt.quantity, 0) < rl.min_qty
      and public.has_permission('transfers.create') and public.can_access_location(p_from)
  )
  select item_id, code, name, unit, decimals, trunc(least(want, avail), decimals::int) as suggested, avail as available
  from need where trunc(least(want, avail), decimals::int) > 0 order by code limit 200;
$$;

-- ---------- save a draft ----------
create or replace function public.save_stock_transfer(p_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_from uuid := (p_header->>'from_location_id')::uuid;
  v_to uuid := (p_header->>'to_location_id')::uuid;
  v_notes text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_fc text; v_fn text; v_tc text; v_tn text;
  v_id uuid; v_no text; v_status public.transfer_status; v_old_from uuid;
  v_errors jsonb := '[]'::jsonb; x record; v_dec smallint; v_code text; v_n int;
begin
  if not public.has_permission('transfers.create') then
    raise exception 'missing permission: transfers.create' using errcode = '42501';
  end if;
  if not public.can_access_location(v_from) then
    raise exception 'you do not work in the sending location' using errcode = '42501';
  end if;
  select code, name into v_fc, v_fn from public.locations where id = v_from and is_active and type <> 'TRANSIT';
  if not found then raise exception 'Sending place not found or archived'; end if;
  select code, name into v_tc, v_tn from public.locations where id = v_to and is_active and type <> 'TRANSIT';
  if not found then raise exception 'Receiving place not found or archived'; end if;
  if v_from = v_to then raise exception 'The sending and receiving place must be different'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 500 then raise exception 'at most 500 lines per transfer'; end if;

  if p_id is not null then
    select status, from_location_id into v_status, v_old_from from public.stock_transfers where id = p_id for update;
    if not found then raise exception 'transfer not found'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft transfer can be edited' using errcode = '42501'; end if;
    if not public.can_access_location(v_old_from) then
      raise exception 'you do not work in the sending location' using errcode = '42501';
    end if;
  end if;

  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric) loop
    select i.internal_item_code, u.decimals into v_code, v_dec
      from public.items i join public.units u on u.code = i.unit where i.id = x.item_id and i.is_active;
    if not found then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found or archived');
    elsif x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, v_dec) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code,
        'message', case when v_dec = 0 then 'This item is moved in whole numbers' else 'At most ' || v_dec || ' decimals for this unit' end);
    end if;
  end loop;
  for x in select (e->>'item_id')::uuid as item_id from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop
    v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'The same item is listed twice');
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  if p_id is null then
    insert into public.stock_transfers (from_location_id, to_location_id, from_code, from_name, to_code, to_name, notes)
    values (v_from, v_to, v_fc, v_fn, v_tc, v_tn, v_notes) returning id, transfer_no into v_id, v_no;
  else
    update public.stock_transfers
       set from_location_id = v_from, to_location_id = v_to, from_code = v_fc, from_name = v_fn,
           to_code = v_tc, to_name = v_tn, notes = v_notes, updated_by = (select auth.uid())
     where id = p_id returning id, transfer_no into v_id, v_no;
    delete from public.stock_transfer_lines where transfer_id = v_id;
  end if;
  insert into public.stock_transfer_lines (transfer_id, item_id, quantity_sent)
  select v_id, t.item_id, t.quantity from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric);
  return jsonb_build_object('ok', true, 'id', v_id, 'transfer_no', v_no, 'errors', '[]'::jsonb);
end $$;

-- ---------- send: the goods leave, stock is "on the way" ----------
create or replace function public.send_stock_transfer(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.stock_transfers%rowtype; v_transit uuid; v_lines int; v_bad text;
begin
  if not public.has_permission('transfers.send') then
    raise exception 'missing permission: transfers.send' using errcode = '42501';
  end if;
  select * into t from public.stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if not public.can_access_location(t.from_location_id) then
    raise exception 'you do not work in the sending location' using errcode = '42501';
  end if;
  if t.status <> 'DRAFT' then raise exception 'This transfer is already %', lower(t.status::text); end if;
  if exists (select 1 from public.locations where id in (t.from_location_id, t.to_location_id) and not is_active) then
    raise exception 'One of the places is archived';
  end if;
  select id into v_transit from public.locations where type = 'TRANSIT';
  select count(*) into v_lines from public.stock_transfer_lines where transfer_id = p_id;
  if v_lines = 0 then raise exception 'The transfer has no lines'; end if;

  select string_agg(i.internal_item_code, ', ') into v_bad
    from public.stock_transfer_lines l join public.items i on i.id = l.item_id where l.transfer_id = p_id and not i.is_active;
  if v_bad is not null then raise exception 'Archived item(s) on the transfer: %. Remove them first.', v_bad; end if;

  select string_agg(i.internal_item_code || ' (has ' || coalesce(b.quantity, 0)::text || ', needs ' || l.quantity_sent::text || ')', ', ') into v_bad
    from public.stock_transfer_lines l join public.items i on i.id = l.item_id
    left join public.stock_balances b on b.item_id = l.item_id and b.location_id = t.from_location_id
    where l.transfer_id = p_id and coalesce(b.quantity, 0) < l.quantity_sent;
  if v_bad is not null then raise exception 'Not enough stock to send: %', v_bad; end if;

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, t.from_location_id, v_transit, l.quantity_sent, 'TRANSFER', 'Sent to ' || t.to_code, t.transfer_no
    from public.stock_transfer_lines l where l.transfer_id = p_id order by l.id;

  update public.stock_transfers set status = 'SENT', sent_at = now(), sent_by = (select auth.uid()), updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SEND_TRANSFER', 'stock_transfers', p_id::text, jsonb_build_object('transfer_no', t.transfer_no, 'lines', v_lines));
  return jsonb_build_object('ok', true, 'transfer_no', t.transfer_no, 'lines', v_lines);
end $$;

-- ---------- receive: the goods arrive; a difference is booked as a visible shortage ----------
-- p_received: [{ "item_id": uuid, "received": number }]  one entry per line.
create or replace function public.receive_stock_transfer(p_id uuid, p_received jsonb, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.stock_transfers%rowtype; v_transit uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
  l record; v_got numeric; v_dec smallint; v_short boolean := false; v_errors jsonb := '[]'::jsonb; v_nrows int;
begin
  if not public.has_permission('transfers.receive') then
    raise exception 'missing permission: transfers.receive' using errcode = '42501';
  end if;
  select * into t from public.stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if not public.can_access_location(t.to_location_id) then
    raise exception 'you do not work in the receiving location' using errcode = '42501';
  end if;
  if t.status <> 'SENT' then raise exception 'Only a sent transfer can be received (this one is %)', lower(t.status::text); end if;
  if p_received is null or jsonb_typeof(p_received) <> 'array' then raise exception 'received must be a JSON array'; end if;
  select id into v_transit from public.locations where type = 'TRANSIT';

  for l in select tl.id, tl.item_id, tl.quantity_sent, i.internal_item_code as code, u.decimals
           from public.stock_transfer_lines tl join public.items i on i.id = tl.item_id join public.units u on u.code = i.unit
           where tl.transfer_id = p_id loop
    select (e->>'received')::numeric into v_got from jsonb_array_elements(p_received) e where (e->>'item_id')::uuid = l.item_id limit 1;
    if v_got is null then
      v_errors := v_errors || jsonb_build_object('item_id', l.item_id, 'code', l.code, 'message', 'Enter how many arrived');
    elsif v_got < 0 or v_got > l.quantity_sent then
      v_errors := v_errors || jsonb_build_object('item_id', l.item_id, 'code', l.code, 'message', 'Received must be between 0 and ' || l.quantity_sent::text || ' (what was sent)');
    elsif v_got <> round(v_got, l.decimals) then
      v_errors := v_errors || jsonb_build_object('item_id', l.item_id, 'code', l.code, 'message', 'Too many decimals for this unit');
    elsif v_got < l.quantity_sent then
      v_short := true;
    end if;
  end loop;
  select count(*) into v_nrows from jsonb_array_elements(p_received) e
    where not exists (select 1 from public.stock_transfer_lines tl where tl.transfer_id = p_id and tl.item_id = (e->>'item_id')::uuid);
  if v_nrows > 0 then v_errors := v_errors || jsonb_build_object('message', 'The list contains an item that is not on this transfer'); end if;
  if v_short and v_note is null then
    v_errors := v_errors || jsonb_build_object('message', 'Some items arrived short: please write a note about the shortage');
  end if;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end if;

  for l in select tl.id, tl.item_id, tl.quantity_sent from public.stock_transfer_lines tl where tl.transfer_id = p_id order by tl.id loop
    select (e->>'received')::numeric into v_got from jsonb_array_elements(p_received) e where (e->>'item_id')::uuid = l.item_id limit 1;
    if v_got > 0 then
      insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
      values (l.item_id, v_transit, t.to_location_id, v_got, 'TRANSFER', 'Received from ' || t.from_code, t.transfer_no);
    end if;
    if v_got < l.quantity_sent then
      insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
      values (l.item_id, v_transit, null, l.quantity_sent - v_got, 'TRANSFER_SHORTAGE', 'Transfer shortage: ' || left(v_note, 200), t.transfer_no);
    end if;
    update public.stock_transfer_lines set quantity_received = v_got where id = l.id;
  end loop;

  update public.stock_transfers
     set status = 'RECEIVED', has_shortage = v_short, receive_note = v_note,
         received_at = now(), received_by = (select auth.uid()), updated_by = (select auth.uid())
   where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'RECEIVE_TRANSFER', 'stock_transfers', p_id::text, jsonb_build_object('transfer_no', t.transfer_no, 'shortage', v_short));
  return jsonb_build_object('ok', true, 'transfer_no', t.transfer_no, 'shortage', v_short, 'errors', '[]'::jsonb);
end $$;

-- ---------- recall a sent transfer (goods go back) / cancel a draft ----------
create or replace function public.recall_stock_transfer(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.stock_transfers%rowtype; v_transit uuid;
begin
  if not public.has_permission('transfers.send') then
    raise exception 'missing permission: transfers.send' using errcode = '42501';
  end if;
  select * into t from public.stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if not public.can_access_location(t.from_location_id) then
    raise exception 'you do not work in the sending location' using errcode = '42501';
  end if;
  if t.status <> 'SENT' then raise exception 'Only a sent transfer can be recalled'; end if;
  select id into v_transit from public.locations where type = 'TRANSIT';
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, v_transit, t.from_location_id, l.quantity_sent, 'TRANSFER', 'Recalled', t.transfer_no
    from public.stock_transfer_lines l where l.transfer_id = p_id order by l.id;
  update public.stock_transfers set status = 'CANCELLED', updated_by = (select auth.uid()) where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'RECALL_TRANSFER', 'stock_transfers', p_id::text, jsonb_build_object('transfer_no', t.transfer_no));
  return jsonb_build_object('ok', true, 'transfer_no', t.transfer_no);
end $$;

create or replace function public.cancel_stock_transfer(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.stock_transfers%rowtype;
begin
  if not (public.has_permission('transfers.create') or public.has_permission('transfers.send')) then
    raise exception 'missing permission: transfers.create' using errcode = '42501';
  end if;
  select * into t from public.stock_transfers where id = p_id for update;
  if not found then raise exception 'transfer not found'; end if;
  if not public.can_access_location(t.from_location_id) then
    raise exception 'you do not work in the sending location' using errcode = '42501';
  end if;
  if t.status <> 'DRAFT' then raise exception 'Only a draft can be cancelled (use recall for a sent transfer)'; end if;
  update public.stock_transfers set status = 'CANCELLED', updated_by = (select auth.uid()) where id = p_id;
  return jsonb_build_object('ok', true, 'transfer_no', t.transfer_no);
end $$;

revoke all on function public.transfer_destinations() from public, anon;
revoke all on function public.suggest_transfer_lines(uuid, uuid) from public, anon;
revoke all on function public.save_stock_transfer(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.send_stock_transfer(uuid) from public, anon;
revoke all on function public.receive_stock_transfer(uuid, jsonb, text) from public, anon;
revoke all on function public.recall_stock_transfer(uuid) from public, anon;
revoke all on function public.cancel_stock_transfer(uuid) from public, anon;
revoke all on function public.locations_protect_transit() from public, anon, authenticated;
revoke all on function public.stock_transfers_flow() from public, anon, authenticated;
grant execute on function public.transfer_destinations() to authenticated;
grant execute on function public.suggest_transfer_lines(uuid, uuid) to authenticated;
grant execute on function public.save_stock_transfer(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.send_stock_transfer(uuid) to authenticated;
grant execute on function public.receive_stock_transfer(uuid, jsonb, text) to authenticated;
grant execute on function public.recall_stock_transfer(uuid) to authenticated;
grant execute on function public.cancel_stock_transfer(uuid) to authenticated;
