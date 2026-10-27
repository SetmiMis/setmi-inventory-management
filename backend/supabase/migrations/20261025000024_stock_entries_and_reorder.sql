-- G1: quick Stock In / Stock Out with a reason (replaces the Google Form / AppSheet In-Out entries).
-- G2: automatic reorder suggestions (the "science" of the shop sheet: average daily consumption x lead time
--     x safety factor = maximum level; reorder quantity = what is missing, counting goods already on the way).

-- ---------- G1 ----------
insert into public.permissions (key, module, description) values
  ('stock.entry', 'stock', 'Quick Stock In / Stock Out with a reason (for example sold in Zoho, sample, damaged)');

create sequence public.stock_entry_seq;
revoke all on sequence public.stock_entry_seq from public, anon, authenticated;

create table public.stock_entries (
  id          uuid primary key default gen_random_uuid(),
  entry_no    text not null unique default ('SE-' || lpad(nextval('public.stock_entry_seq')::text, 6, '0')),
  location_id uuid not null references public.locations (id) on delete restrict,
  direction   text not null check (direction in ('IN', 'OUT')),
  reason      text not null,
  reference   text check (reference is null or char_length(reference) <= 60),
  remarks     text check (remarks is null or char_length(remarks) <= 500),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) default auth.uid(),
  constraint stock_entries_reason check (
    (direction = 'OUT' and reason in ('SOLD_OUTSIDE', 'SAMPLE', 'DAMAGED', 'OWN_USE', 'LOST', 'RETURN_TO_SUPPLIER', 'OTHER_OUT'))
    or (direction = 'IN' and reason in ('FOUND', 'CUSTOMER_RETURN', 'OTHER_IN')))
);
create index stock_entries_location_idx on public.stock_entries (location_id, created_at desc);
alter table public.stock_entries enable row level security;
create trigger stock_entries_audit after insert or update or delete on public.stock_entries
  for each row execute function public.log_audit();

create table public.stock_entry_lines (
  id       bigint generated always as identity primary key,
  entry_id uuid not null references public.stock_entries (id) on delete restrict,
  item_id  uuid not null references public.items (id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  constraint stock_entry_lines_one_per_item unique (entry_id, item_id)
);
alter table public.stock_entry_lines enable row level security;

-- An entry is final the moment it is saved: no edit, no delete. A mistake is fixed with an opposite entry.
create or replace function public.stock_entries_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Stock entries cannot be changed or deleted. Make an opposite entry to correct a mistake.' using errcode = '42501';
end $$;
revoke all on function public.stock_entries_immutable() from public, anon, authenticated;
create trigger stock_entries_no_change before update or delete on public.stock_entries
  for each row execute function public.stock_entries_immutable();
create trigger stock_entry_lines_no_change before update or delete on public.stock_entry_lines
  for each row execute function public.stock_entries_immutable();

create policy stock_entries_select on public.stock_entries for select to authenticated
  using (((select public.has_permission('stock.entry')) or (select public.has_permission('stock.view')))
         and (select public.can_access_location(location_id)));
create policy stock_entry_lines_select on public.stock_entry_lines for select to authenticated
  using (exists (select 1 from public.stock_entries e where e.id = stock_entry_lines.entry_id));

-- p_header: {location_id, direction IN|OUT, reason, reference, remarks}
-- p_lines : [{item_id, quantity}]
-- One call, all or nothing. Line problems come back as a list (nothing is written).
create or replace function public.create_stock_entry(p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_dir text := upper(coalesce(p_header->>'direction', ''));
  v_reason text := upper(coalesce(p_header->>'reason', ''));
  v_ref text := nullif(btrim(coalesce(p_header->>'reference', '')), '');
  v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
  v_errors jsonb := '[]'::jsonb;
  v_id uuid; v_no text; v_n int; v_label text;
  x record; v_dec smallint; v_code text; v_have numeric;
begin
  if not public.has_permission('stock.entry') then
    raise exception 'missing permission: stock.entry' using errcode = '42501';
  end if;
  if not public.can_access_location(v_loc) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locations where id = v_loc and is_active and type <> 'TRANSIT') then
    raise exception 'location not found or archived';
  end if;
  if v_dir not in ('IN', 'OUT') then raise exception 'Choose Stock In or Stock Out'; end if;
  v_label := case v_reason
    when 'SOLD_OUTSIDE' then 'Sold outside this system (for example Zoho)'
    when 'SAMPLE' then 'Sample' when 'DAMAGED' then 'Damaged' when 'OWN_USE' then 'Own use'
    when 'LOST' then 'Lost' when 'RETURN_TO_SUPPLIER' then 'Returned to supplier' when 'OTHER_OUT' then 'Other stock out'
    when 'FOUND' then 'Found' when 'CUSTOMER_RETURN' then 'Customer return' when 'OTHER_IN' then 'Other stock in'
    else null end;
  if v_label is null
     or (v_dir = 'OUT' and v_reason not in ('SOLD_OUTSIDE', 'SAMPLE', 'DAMAGED', 'OWN_USE', 'LOST', 'RETURN_TO_SUPPLIER', 'OTHER_OUT'))
     or (v_dir = 'IN' and v_reason not in ('FOUND', 'CUSTOMER_RETURN', 'OTHER_IN')) then
    raise exception 'Choose a reason that fits Stock %', initcap(v_dir);
  end if;
  if v_reason in ('OTHER_OUT', 'OTHER_IN') and v_rem is null then
    raise exception 'Write a remark for "other"';
  end if;
  if v_ref is not null and char_length(v_ref) > 60 then raise exception 'Reference is too long (max 60)'; end if;
  if v_rem is not null and char_length(v_rem) > 500 then raise exception 'Remarks are too long (max 500)'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 200 then raise exception 'at most 200 lines per entry'; end if;

  for x in select * from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric) loop
    select i.internal_item_code, u.decimals into v_code, v_dec
      from public.items i join public.units u on u.code = i.unit
     where i.id = x.item_id and i.is_active;
    if not found then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'Item not found or archived');
    elsif x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, v_dec) then
      v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code,
        'message', case when v_dec = 0 then 'This item is counted in whole numbers' else 'At most ' || v_dec || ' decimals for this unit' end);
    elsif v_dir = 'OUT' then
      v_have := 0; -- no balance row means nothing in stock (SELECT INTO keeps the old value when no row)
      select coalesce(quantity, 0) into v_have from public.stock_balances where item_id = x.item_id and location_id = v_loc for update;
      if coalesce(v_have, 0) < x.quantity then
        v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', v_code, 'message', 'Only ' || coalesce(v_have, 0) || ' in stock here');
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

  insert into public.stock_entries (location_id, direction, reason, reference, remarks)
  values (v_loc, v_dir, v_reason, v_ref, v_rem) returning id, entry_no into v_id, v_no;
  insert into public.stock_entry_lines (entry_id, item_id, quantity)
  select v_id, t.item_id, t.quantity from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric);

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select t.item_id,
         case when v_dir = 'OUT' then v_loc end,
         case when v_dir = 'IN' then v_loc end,
         t.quantity,
         (case when v_dir = 'OUT' then 'STOCK_OUT' else 'STOCK_IN' end)::public.stock_movement_type,
         v_label || coalesce(': ' || v_rem, ''),
         v_no
    from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric);

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'STOCK_ENTRY', 'stock_entries', v_id::text,
          jsonb_build_object('entry_no', v_no, 'direction', v_dir, 'reason', v_reason, 'lines', v_n, 'location_id', v_loc));
  return jsonb_build_object('ok', true, 'id', v_id, 'entry_no', v_no, 'errors', '[]'::jsonb);
end $$;

revoke all on function public.create_stock_entry(jsonb, jsonb) from public, anon;
grant execute on function public.create_stock_entry(jsonb, jsonb) to authenticated;

-- ---------- G2 ----------
-- Planning numbers on the item (same meaning as the shop sheet's Item List).
alter table public.items
  add column lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 3650),
  add column safety_factor numeric(5,2) check (safety_factor is null or (safety_factor >= 1 and safety_factor <= 10)),
  add column moq numeric(14,3) check (moq is null or moq > 0);

-- Suggestions per item and place, for the places the caller can see (security invoker: row rules apply).
-- consumption = what left the place in the last p_days days: sales, stock outs and transfers sent away,
--               minus sale returns. Counts (ADJUSTMENT) are corrections, not consumption.
-- target      = average daily consumption x lead time x safety factor (default 1.5) when the item has a lead
--               time; otherwise the manual maximum level of that place, if one is set.
-- suggested   = target - (in stock + still due on open purchase orders + transfers on the way here),
--               rounded up to the unit's decimals and to a multiple of the MOQ; never below 0.
create or replace function public.reorder_suggestions(p_location uuid default null, p_days integer default 30)
returns table (
  item_id uuid, internal_item_code text, item_name text, unit text,
  location_id uuid, location_code text,
  on_hand numeric, incoming_po numeric, incoming_transfer numeric,
  consumed numeric, avg_daily numeric, days_of_cover numeric,
  lead_time_days integer, safety_factor numeric, moq numeric, min_qty numeric, max_qty numeric,
  target numeric, target_source text, suggested numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not (public.has_permission('stock.view') and public.has_permission('items.view')) then
    raise exception 'Reorder suggestions need the stock.view and items.view permissions' using errcode = 'P0001';
  end if;
  if p_days is null or p_days < 7 or p_days > 365 then
    raise exception 'Days must be between 7 and 365' using errcode = 'P0001';
  end if;
  return query
  with flow as (
    select m.item_id as fi, m.from_location_id as fl, sum(m.quantity) as q
      from public.stock_movements m
     where m.from_location_id is not null
       and m.movement_type in ('SALE', 'STOCK_OUT', 'TRANSFER')
       and m.created_at >= now() - make_interval(days => p_days)
     group by 1, 2
  ), back as (
    select m.item_id as bi, m.to_location_id as bl, sum(m.quantity) as q
      from public.stock_movements m
     where m.to_location_id is not null and m.movement_type = 'SALE_RETURN'
       and m.created_at >= now() - make_interval(days => p_days)
     group by 1, 2
  ), po as (
    select pl.item_id as pi, o.location_id as plo, sum(pl.quantity - pl.received_qty) as q
      from public.purchase_order_lines pl join public.purchase_orders o on o.id = pl.po_id
     where o.status in ('SENT', 'PARTIAL')
     group by 1, 2
  ), tr as (
    select tl.item_id as ti, t.to_location_id as tlo, sum(tl.quantity_sent) as q
      from public.stock_transfer_lines tl join public.stock_transfers t on t.id = tl.transfer_id
     where t.status = 'SENT'
     group by 1, 2
  ), base as (
    select so.item_id as b_item, so.internal_item_code as b_code, so.item_name as b_name, so.unit as b_unit,
           so.location_id as b_loc, l.code as b_loc_code, so.quantity as b_on_hand, so.min_qty as b_min, so.max_qty as b_max,
           i.lead_time_days as b_lead, i.safety_factor as b_safety, i.moq as b_moq, u.decimals as b_dec,
           coalesce(po.q, 0) as b_po, coalesce(tr.q, 0) as b_tr,
           greatest(coalesce(flow.q, 0) - coalesce(back.q, 0), 0) as b_consumed
      from public.stock_overview so
      join public.locations l on l.id = so.location_id
      join public.items i on i.id = so.item_id
      join public.units u on u.code = i.unit
      left join flow on flow.fi = so.item_id and flow.fl = so.location_id
      left join back on back.bi = so.item_id and back.bl = so.location_id
      left join po on po.pi = so.item_id and po.plo = so.location_id
      left join tr on tr.ti = so.item_id and tr.tlo = so.location_id
     where (p_location is null or so.location_id = p_location)
  ), calc as (
    select b.*, b.b_consumed / p_days as b_avg,
           case when b.b_lead is not null and b.b_consumed > 0 then (b.b_consumed / p_days) * b.b_lead * coalesce(b.b_safety, 1.5)
                when b.b_max is not null then b.b_max end as b_target,
           case when b.b_lead is not null and b.b_consumed > 0 then 'formula'
                when b.b_max is not null then 'max level' end as b_source
      from base b
  ), need as (
    select c.*, greatest(coalesce(c.b_target, 0) - (c.b_on_hand + c.b_po + c.b_tr), 0) as b_need
      from calc c
  )
  select n.b_item, n.b_code, n.b_name, n.b_unit, n.b_loc, n.b_loc_code,
         n.b_on_hand, n.b_po, n.b_tr,
         n.b_consumed, round(n.b_avg, 3),
         case when n.b_avg > 0 then round(n.b_on_hand / n.b_avg, 1) end,
         n.b_lead, n.b_safety, n.b_moq, n.b_min, n.b_max,
         round(n.b_target, 3), n.b_source,
         case when n.b_need <= 0 then 0
              when n.b_moq is not null then ceil(n.b_need / n.b_moq) * n.b_moq
              else ceil(n.b_need * power(10, n.b_dec)) / power(10, n.b_dec) end
    from need n
   where n.b_target is not null or n.b_consumed > 0
   order by 20 desc, n.b_loc_code, n.b_code
   limit 5000;
end $$;

revoke all on function public.reorder_suggestions(uuid, integer) from public, anon;
grant execute on function public.reorder_suggestions(uuid, integer) to authenticated;
