-- Stock Adjustment with manager approval (owner's choice). A stock entry (Stock In / Stock Out with a reason) is now
-- PENDING until a manager approves it; only then does stock change. A manager can also reject it (with a note), and then
-- nothing changes. A person who has the new permission stock.approve makes entries that are approved at once (they ARE the manager).
-- Entries made before this change were applied at once, so they are marked APPROVED.
-- Stock entries still can never be edited or deleted; only the one step PENDING -> APPROVED / REJECTED is allowed.
-- Also: the ledger screen may now filter on the movement type STOCK_IN (it was missing from the allowed list).

insert into public.permissions (key, module, description) values
  ('stock.approve', 'stock', 'Approve or reject stock adjustments (Stock In / Out entries) made by others; own entries are approved at once')
on conflict (key) do nothing;

alter table public.stock_entries
  add column status text not null default 'APPROVED' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  add column decided_by uuid references public.profiles (id),
  add column decided_at timestamptz,
  add column decision_note text check (decision_note is null or char_length(decision_note) <= 300);
update public.stock_entries set decided_by = created_by, decided_at = created_at where decided_at is null;

-- The header may change only in the one decision step; its lines never change.
create or replace function public.stock_entries_header_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Stock entries cannot be deleted. Make an opposite entry to correct a mistake.' using errcode = '42501';
  end if;
  if old.status = 'PENDING' and new.status in ('APPROVED', 'REJECTED')
     and (new.id, new.entry_no, new.location_id, new.direction, new.reason, new.reference, new.remarks, new.created_at, new.created_by)
         is not distinct from (old.id, old.entry_no, old.location_id, old.direction, old.reason, old.reference, old.remarks, old.created_at, old.created_by) then
    return new;
  end if;
  raise exception 'Stock entries cannot be changed. Make an opposite entry to correct a mistake.' using errcode = '42501';
end $$;
revoke all on function public.stock_entries_header_guard() from public, anon, authenticated;
drop trigger stock_entries_no_change on public.stock_entries;
create trigger stock_entries_no_change before update or delete on public.stock_entries
  for each row execute function public.stock_entries_header_guard();

create or replace function public.stock_entry_reason_label(p_reason text)
returns text language sql immutable set search_path = '' as $$
  select case p_reason
    when 'SOLD_OUTSIDE' then 'Sold outside this system (for example Zoho)'
    when 'SAMPLE' then 'Sample' when 'DAMAGED' then 'Damaged' when 'OWN_USE' then 'Own use'
    when 'LOST' then 'Lost' when 'RETURN_TO_SUPPLIER' then 'Returned to supplier' when 'OTHER_OUT' then 'Other stock out'
    when 'FOUND' then 'Found' when 'CUSTOMER_RETURN' then 'Customer return' when 'OTHER_IN' then 'Other stock in'
    else null end;
$$;

-- Writes the stock movements of an entry (internal: called only after the entry is approved).
create or replace function public.stock_entry_post(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.stock_entries%rowtype;
begin
  select * into e from public.stock_entries where id = p_id;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id,
         case when e.direction = 'OUT' then e.location_id end,
         case when e.direction = 'IN' then e.location_id end,
         l.quantity,
         (case when e.direction = 'OUT' then 'STOCK_OUT' else 'STOCK_IN' end)::public.stock_movement_type,
         public.stock_entry_reason_label(e.reason) || coalesce(': ' || e.remarks, ''),
         e.entry_no
    from public.stock_entry_lines l where l.entry_id = p_id;
end $$;
revoke all on function public.stock_entry_post(uuid) from public, anon, authenticated;

-- p_header: {location_id, direction IN|OUT, reason, reference, remarks}; p_lines: [{item_id, quantity}]
-- Same checks as before. A person with stock.approve gets the entry approved and applied at once; everybody else leaves it PENDING.
create or replace function public.create_stock_entry(p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_dir text := upper(coalesce(p_header->>'direction', ''));
  v_reason text := upper(coalesce(p_header->>'reason', ''));
  v_ref text := nullif(btrim(coalesce(p_header->>'reference', '')), '');
  v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
  v_errors jsonb := '[]'::jsonb;
  v_id uuid; v_no text; v_n int; v_status text;
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
  if public.stock_entry_reason_label(v_reason) is null
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
      v_have := 0;
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

  v_status := case when public.has_permission('stock.approve') then 'APPROVED' else 'PENDING' end;
  insert into public.stock_entries (location_id, direction, reason, reference, remarks, status, decided_by, decided_at)
  values (v_loc, v_dir, v_reason, v_ref, v_rem, v_status, case when v_status = 'APPROVED' then (select auth.uid()) end, case when v_status = 'APPROVED' then now() end)
  returning id, entry_no into v_id, v_no;
  insert into public.stock_entry_lines (entry_id, item_id, quantity)
  select v_id, t.item_id, t.quantity from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric);
  if v_status = 'APPROVED' then perform public.stock_entry_post(v_id); end if;

  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), case when v_status = 'APPROVED' then 'STOCK_ENTRY' else 'STOCK_ENTRY_REQUEST' end, 'stock_entries', v_id::text,
          jsonb_build_object('entry_no', v_no, 'direction', v_dir, 'reason', v_reason, 'lines', v_n, 'location_id', v_loc, 'status', v_status));
  return jsonb_build_object('ok', true, 'id', v_id, 'entry_no', v_no, 'status', v_status, 'errors', '[]'::jsonb);
end $$;
revoke all on function public.create_stock_entry(jsonb, jsonb) from public, anon;
grant execute on function public.create_stock_entry(jsonb, jsonb) to authenticated;

-- A manager approves: the stock is checked again (it may have changed since the request), then it moves.
create or replace function public.approve_stock_entry(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.stock_entries%rowtype; l record; v_have numeric;
begin
  if not public.has_permission('stock.approve') then
    raise exception 'missing permission: stock.approve' using errcode = '42501';
  end if;
  select * into e from public.stock_entries where id = p_id for update;
  if not found then raise exception 'Entry not found'; end if;
  if not public.can_access_location(e.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if e.status <> 'PENDING' then raise exception 'This entry was already %', lower(e.status); end if;
  if e.direction = 'OUT' then
    for l in select sl.item_id, sl.quantity, i.internal_item_code as code from public.stock_entry_lines sl join public.items i on i.id = sl.item_id where sl.entry_id = p_id loop
      v_have := 0;
      select coalesce(quantity, 0) into v_have from public.stock_balances where item_id = l.item_id and location_id = e.location_id for update;
      if coalesce(v_have, 0) < l.quantity then
        raise exception 'Not enough stock of %: only % here now', l.code, coalesce(v_have, 0);
      end if;
    end loop;
  end if;
  update public.stock_entries set status = 'APPROVED', decided_by = (select auth.uid()), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  perform public.stock_entry_post(p_id);
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'STOCK_ENTRY_APPROVED', 'stock_entries', p_id::text, jsonb_build_object('entry_no', e.entry_no, 'direction', e.direction, 'location_id', e.location_id));
end $$;
revoke execute on function public.approve_stock_entry(uuid, text) from public, anon;
grant execute on function public.approve_stock_entry(uuid, text) to authenticated;

create or replace function public.reject_stock_entry(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.stock_entries%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_permission('stock.approve') then
    raise exception 'missing permission: stock.approve' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'Write a reason for rejecting (at least 3 characters)'; end if;
  if char_length(v_note) > 300 then raise exception 'The reason is too long (max 300)'; end if;
  select * into e from public.stock_entries where id = p_id for update;
  if not found then raise exception 'Entry not found'; end if;
  if not public.can_access_location(e.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if e.status <> 'PENDING' then raise exception 'This entry was already %', lower(e.status); end if;
  update public.stock_entries set status = 'REJECTED', decided_by = (select auth.uid()), decided_at = now(), decision_note = v_note where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'STOCK_ENTRY_REJECTED', 'stock_entries', p_id::text, jsonb_build_object('entry_no', e.entry_no, 'note', v_note));
end $$;
revoke execute on function public.reject_stock_entry(uuid, text) from public, anon;
grant execute on function public.reject_stock_entry(uuid, text) to authenticated;

-- ---------- the screen ----------
-- One call: a page of entries with place, direction, items, quantity, reason, status and who asked, plus the top numbers,
-- the reasons of approved entries this month and the 30-day trend of approved quantities. Runs as the caller (row rules apply).
-- p_type: all | IN | OUT ; p_status: all | PENDING | APPROVED | REJECTED
create or replace function public.stock_adjustments_page(
  p_q text default null, p_location uuid default null, p_type text default null, p_status text default null,
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
  if not (public.has_permission('stock.entry') or public.has_permission('stock.view') or public.has_permission('stock.approve')) then
    raise exception 'You do not have permission to see stock adjustments' using errcode = '42501';
  end if;
  if p_type is not null and p_type not in ('', 'all', 'IN', 'OUT') then raise exception 'Unknown type filter' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'PENDING', 'APPROVED', 'REJECTED') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select e.id, e.entry_no, e.created_at, e.created_by, e.direction, e.reason, e.reference, e.remarks, e.status, e.decided_at,
           l.id as location_id, l.name as place_name,
           coalesce(t.items, 0) as items, coalesce(t.qty, 0) as qty, t.first_code, t.first_name
      from public.stock_entries e
      join public.locations l on l.id = e.location_id
      left join lateral (select count(*) as items, sum(sl.quantity) as qty,
                                (array_agg(i.internal_item_code order by sl.id))[1] as first_code, (array_agg(i.item_name order by sl.id))[1] as first_name
                           from public.stock_entry_lines sl join public.items i on i.id = sl.item_id where sl.entry_id = e.id) t on true
  ),
  filtered as (
    select b.* from base b
     where (p_location is null or b.location_id = p_location)
       and (coalesce(p_type, '') in ('', 'all') or b.direction = p_type)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (p_from is null or (b.created_at at time zone 'Asia/Kolkata')::date >= p_from)
       and (p_to is null or (b.created_at at time zone 'Asia/Kolkata')::date <= p_to)
       and (coalesce(p_q, '') = '' or b.entry_no ilike v_like or b.reference ilike v_like or b.remarks ilike v_like or b.place_name ilike v_like
            or exists (select 1 from public.stock_entry_lines sl join public.items i on i.id = sl.item_id
                        where sl.entry_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.entry_no desc), '[]'::jsonb)
               from (select f.*, public.person_name(f.created_by) as requested_by
                       from (select * from filtered order by created_at desc, entry_no desc limit v_limit offset v_offset) f) t),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'increase', (select coalesce(sum(qty), 0) from base where status = 'APPROVED' and direction = 'IN'),
      'decrease', (select coalesce(sum(qty), 0) from base where status = 'APPROVED' and direction = 'OUT'),
      'pending', (select count(*) from base where status = 'PENDING'),
      'approved', (select count(*) from base where status = 'APPROVED'),
      'rejected', (select count(*) from base where status = 'REJECTED'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'qty', q) order by q desc), '[]'::jsonb)
                  from (select reason, sum(qty) as q from base where status = 'APPROVED' and (decided_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date group by reason) r),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', s.d::text, 'inc', coalesce(x.incq, 0), 'dec', coalesce(x.decq, 0)) order by s.d), '[]'::jsonb)
                from (select (v_today - g)::date as d from generate_series(0, 29) g) s
                left join (select (decided_at at time zone 'Asia/Kolkata')::date as d,
                                  sum(qty) filter (where direction = 'IN') as incq, sum(qty) filter (where direction = 'OUT') as decq
                             from base where status = 'APPROVED' group by 1) x on x.d = s.d))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.stock_adjustments_page(text, uuid, text, text, date, date, int, int) from public, anon;
grant execute on function public.stock_adjustments_page(text, uuid, text, text, date, date, int, int) to authenticated;

-- The ledger may filter on STOCK_IN too: add it to the allowed list of the existing function (one word changes).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.stock_ledger_page(text, uuid, uuid, text, date, date, integer, integer)'::regprocedure);
  d := replace(d, '''ADJUSTMENT'', ''STOCK_OUT'')', '''ADJUSTMENT'', ''STOCK_OUT'', ''STOCK_IN'')');
  execute d;
end $$;
