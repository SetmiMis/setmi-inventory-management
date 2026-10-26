-- Physical Count (owner's mock): a COUNT is a sheet for one place. When it is made, the system quantity of every product in scope is
-- frozen on the sheet ("expected"). People enter what they really counted (progress is saved). When all items are counted the sheet is
-- sent for approval; a manager (stock.approve) approves it and ONLY THEN the stock changes, by the difference (counted - expected) of
-- each product, as an ADJUSTMENT movement. Moves made between the freeze and the approval are kept. A manager's own count is applied
-- at once when submitted. A manager can send a count back (reject) with a note: it goes back to In Progress for a recount.
-- Status: PENDING (nothing counted), IN_PROGRESS, WAITING_APPROVAL, COMPLETED (stock changed), CANCELLED.
-- Scope: FULL (every product that has stock or a min/max level in the place), CYCLE (one category), LOCATION (one rack of the place).
-- Nothing is deleted; all writes go through the functions below (no direct table writes).

create sequence public.physical_count_seq;
revoke all on sequence public.physical_count_seq from public, anon, authenticated;

create table public.physical_counts (
  id            uuid primary key default gen_random_uuid(),
  count_no      text not null unique default ('PC-' || to_char((now() at time zone 'Asia/Kolkata'), 'YYYY') || '-' || lpad(nextval('public.physical_count_seq')::text, 3, '0')),
  location_id   uuid not null references public.locations (id) on delete restrict,
  count_type    text not null check (count_type in ('FULL', 'CYCLE', 'LOCATION')),
  category_id   uuid references public.categories (id) on delete restrict,
  rack          text check (rack is null or rack ~ '^[A-Z0-9]{1,6}$'),
  notes         text check (notes is null or char_length(notes) <= 500),
  status        text not null default 'PENDING' check (status in ('PENDING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'CANCELLED')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) default auth.uid(),
  updated_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decided_by    uuid references public.profiles (id),
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  constraint physical_counts_scope check (
    (count_type = 'FULL' and category_id is null and rack is null) or (count_type = 'CYCLE' and category_id is not null and rack is null) or (count_type = 'LOCATION' and rack is not null and category_id is null))
);
create index physical_counts_location_idx on public.physical_counts (location_id, created_at desc);
alter table public.physical_counts enable row level security;
create trigger physical_counts_updated_at before update on public.physical_counts for each row execute function public.set_updated_at();
create trigger physical_counts_audit after insert or update or delete on public.physical_counts for each row execute function public.log_audit();

create table public.physical_count_lines (
  id        bigint generated always as identity primary key,
  count_id  uuid not null references public.physical_counts (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete restrict,
  expected  numeric(14,3) not null,
  counted   numeric(14,3) check (counted is null or counted >= 0),
  reason    text check (reason is null or reason in ('MISSING', 'EXTRA', 'WRONG_LOCATION', 'DAMAGE_EXPIRY', 'OTHER')),
  constraint physical_count_lines_one_per_item unique (count_id, item_id)
);
alter table public.physical_count_lines enable row level security;

create policy physical_counts_select on public.physical_counts for select to authenticated
  using (((select public.has_permission('stock.view')) or (select public.has_permission('stock.adjust')) or (select public.has_permission('stock.approve')))
         and (select public.can_access_location(location_id)));
create policy physical_count_lines_select on public.physical_count_lines for select to authenticated
  using (exists (select 1 from public.physical_counts c where c.id = physical_count_lines.count_id));
revoke all on public.physical_counts, public.physical_count_lines from anon, authenticated;
grant select on public.physical_counts, public.physical_count_lines to authenticated;

-- ---------- make a count ----------
-- p_header: {location_id, count_type, category_id, rack, notes}
create or replace function public.create_physical_count(p_header jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_loc uuid := (p_header->>'location_id')::uuid;
  v_type text := upper(coalesce(p_header->>'count_type', ''));
  v_cat uuid := nullif(p_header->>'category_id', '')::uuid;
  v_rack text := upper(nullif(btrim(coalesce(p_header->>'rack', '')), ''));
  v_notes text := nullif(btrim(coalesce(p_header->>'notes', '')), '');
  v_id uuid; v_no text; v_n int;
begin
  if not public.has_permission('stock.adjust') then
    raise exception 'missing permission: stock.adjust' using errcode = '42501';
  end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if not exists (select 1 from public.locations where id = v_loc and is_active and type <> 'TRANSIT') then raise exception 'location not found or archived'; end if;
  if v_type not in ('FULL', 'CYCLE', 'LOCATION') then raise exception 'Choose the type of count'; end if;
  if v_type = 'CYCLE' and (v_cat is null or not exists (select 1 from public.categories where id = v_cat)) then raise exception 'Choose a category'; end if;
  if v_type = 'LOCATION' and (v_rack is null or v_rack !~ '^[A-Z0-9]{1,6}$') then raise exception 'Choose a rack'; end if;
  if v_notes is not null and char_length(v_notes) > 500 then raise exception 'Notes are too long (max 500)'; end if;

  insert into public.physical_counts (location_id, count_type, category_id, rack, notes)
  values (v_loc, v_type, case when v_type = 'CYCLE' then v_cat end, case when v_type = 'LOCATION' then v_rack end, v_notes)
  returning id, count_no into v_id, v_no;

  insert into public.physical_count_lines (count_id, item_id, expected)
  select v_id, i.id, coalesce(b.quantity, 0)
    from public.items i
    left join public.stock_balances b on b.item_id = i.id and b.location_id = v_loc
    left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = v_loc
   where i.is_active and (b.item_id is not null or rl.item_id is not null)
     and (v_type = 'FULL'
          or (v_type = 'CYCLE' and i.category_id = v_cat)
          or (v_type = 'LOCATION' and exists (select 1 from public.item_bins ib join public.storage_bins sb on sb.id = ib.bin_id
                                               where ib.item_id = i.id and ib.location_id = v_loc and sb.rack = v_rack)));
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'There is nothing to count in this scope'; end if;
  if v_n > 5000 then raise exception 'Too many items for one count (max 5000): count a category or a rack'; end if;
  return jsonb_build_object('id', v_id, 'count_no', v_no, 'items', v_n);
end $$;
revoke execute on function public.create_physical_count(jsonb) from public, anon;
grant execute on function public.create_physical_count(jsonb) to authenticated;

-- ---------- save what has been counted so far ----------
-- p_rows: [{item_id, counted (null clears it), reason}]
create or replace function public.save_physical_count_progress(p_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.physical_counts%rowtype; x record; v_dec smallint; v_code text; v_n int; v_done int; v_total int;
begin
  if not public.has_permission('stock.adjust') then raise exception 'missing permission: stock.adjust' using errcode = '42501'; end if;
  select * into c from public.physical_counts where id = p_id for update;
  if not found then raise exception 'Count not found'; end if;
  if not public.can_access_location(c.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if c.status not in ('PENDING', 'IN_PROGRESS') then raise exception 'This count can no longer be changed (it is %)', lower(replace(c.status, '_', ' ')); end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be a JSON array'; end if;
  v_n := jsonb_array_length(p_rows);
  if v_n > 5000 then raise exception 'at most 5000 rows at a time'; end if;

  for x in select t.item_id, t.counted, nullif(btrim(coalesce(t.reason, '')), '') as reason from jsonb_to_recordset(p_rows) as t(item_id uuid, counted numeric, reason text) loop
    select i.internal_item_code, u.decimals into v_code, v_dec
      from public.physical_count_lines l join public.items i on i.id = l.item_id join public.units u on u.code = i.unit
     where l.count_id = p_id and l.item_id = x.item_id;
    if not found then raise exception 'An item is not on this count'; end if;
    if x.counted is not null and (x.counted < 0 or x.counted > 99999999) then raise exception '% : counted quantity must be between 0 and 99,999,999', v_code; end if;
    if x.counted is not null and x.counted <> round(x.counted, v_dec) then raise exception '%: too many decimals for this unit', v_code; end if;
    if x.reason is not null and x.reason not in ('MISSING', 'EXTRA', 'WRONG_LOCATION', 'DAMAGE_EXPIRY', 'OTHER') then raise exception 'Unknown reason'; end if;
    update public.physical_count_lines set counted = x.counted, reason = x.reason where count_id = p_id and item_id = x.item_id;
  end loop;
  select count(*) filter (where counted is not null), count(*) into v_done, v_total from public.physical_count_lines where count_id = p_id;
  update public.physical_counts set status = case when v_done > 0 then 'IN_PROGRESS' else 'PENDING' end where id = p_id;
  return jsonb_build_object('counted', v_done, 'total', v_total);
end $$;
revoke execute on function public.save_physical_count_progress(uuid, jsonb) from public, anon;
grant execute on function public.save_physical_count_progress(uuid, jsonb) to authenticated;

-- ---------- apply the differences (internal, after approval) ----------
create or replace function public.physical_count_apply(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.physical_counts%rowtype; l record; v_now numeric; v_delta numeric;
begin
  select * into c from public.physical_counts where id = p_id;
  for l in select pl.item_id, pl.expected, pl.counted, i.internal_item_code as code from public.physical_count_lines pl join public.items i on i.id = pl.item_id
            where pl.count_id = p_id and pl.counted is not null and pl.counted <> pl.expected order by pl.id loop
    v_delta := l.counted - l.expected;
    v_now := 0;
    select coalesce(quantity, 0) into v_now from public.stock_balances where item_id = l.item_id and location_id = c.location_id for update;
    if coalesce(v_now, 0) + v_delta < 0 then
      raise exception 'Cannot apply: % would go below zero (stock now %, change %). Count it again.', l.code, coalesce(v_now, 0), v_delta;
    end if;
    insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
    values (l.item_id, case when v_delta < 0 then c.location_id end, case when v_delta > 0 then c.location_id end, abs(v_delta), 'ADJUSTMENT',
            'Physical count ' || c.count_no, c.count_no);
  end loop;
  update public.physical_counts set status = 'COMPLETED', decided_by = (select auth.uid()), decided_at = now() where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'PHYSICAL_COUNT_APPLIED', 'physical_counts', p_id::text, jsonb_build_object('count_no', c.count_no, 'location_id', c.location_id));
end $$;
revoke all on function public.physical_count_apply(uuid) from public, anon, authenticated;

-- ---------- send for approval (a manager's own count is applied at once) ----------
create or replace function public.submit_physical_count(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.physical_counts%rowtype; v_open int; v_noreason int;
begin
  if not public.has_permission('stock.adjust') then raise exception 'missing permission: stock.adjust' using errcode = '42501'; end if;
  select * into c from public.physical_counts where id = p_id for update;
  if not found then raise exception 'Count not found'; end if;
  if not public.can_access_location(c.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if c.status not in ('PENDING', 'IN_PROGRESS') then raise exception 'This count was already sent or finished'; end if;
  select count(*) filter (where counted is null), count(*) filter (where counted is not null and counted <> expected and reason is null)
    into v_open, v_noreason from public.physical_count_lines where count_id = p_id;
  if v_open > 0 then raise exception '% item(s) are not counted yet', v_open; end if;
  if v_noreason > 0 then raise exception 'Choose a reason for the % item(s) whose count differs from the system', v_noreason; end if;
  update public.physical_counts set submitted_at = now(), status = 'WAITING_APPROVAL' where id = p_id;
  if public.has_permission('stock.approve') then
    perform public.physical_count_apply(p_id);
    return jsonb_build_object('status', 'COMPLETED');
  end if;
  return jsonb_build_object('status', 'WAITING_APPROVAL');
end $$;
revoke execute on function public.submit_physical_count(uuid) from public, anon;
grant execute on function public.submit_physical_count(uuid) to authenticated;

create or replace function public.approve_physical_count(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.physical_counts%rowtype;
begin
  if not public.has_permission('stock.approve') then raise exception 'missing permission: stock.approve' using errcode = '42501'; end if;
  select * into c from public.physical_counts where id = p_id for update;
  if not found then raise exception 'Count not found'; end if;
  if not public.can_access_location(c.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if c.status <> 'WAITING_APPROVAL' then raise exception 'Only a count that waits for approval can be approved'; end if;
  update public.physical_counts set decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  perform public.physical_count_apply(p_id);
end $$;
revoke execute on function public.approve_physical_count(uuid, text) from public, anon;
grant execute on function public.approve_physical_count(uuid, text) to authenticated;

create or replace function public.reject_physical_count(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.physical_counts%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_permission('stock.approve') then raise exception 'missing permission: stock.approve' using errcode = '42501'; end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'Write why the count is sent back (at least 3 characters)'; end if;
  if char_length(v_note) > 300 then raise exception 'The note is too long (max 300)'; end if;
  select * into c from public.physical_counts where id = p_id for update;
  if not found then raise exception 'Count not found'; end if;
  if not public.can_access_location(c.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if c.status <> 'WAITING_APPROVAL' then raise exception 'Only a count that waits for approval can be sent back'; end if;
  update public.physical_counts set status = 'IN_PROGRESS', decision_note = v_note, decided_by = (select auth.uid()), decided_at = now() where id = p_id;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'PHYSICAL_COUNT_SENT_BACK', 'physical_counts', p_id::text, jsonb_build_object('count_no', c.count_no, 'note', v_note));
end $$;
revoke execute on function public.reject_physical_count(uuid, text) from public, anon;
grant execute on function public.reject_physical_count(uuid, text) to authenticated;

create or replace function public.cancel_physical_count(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.physical_counts%rowtype;
begin
  if not (public.has_permission('stock.adjust') or public.has_permission('stock.approve')) then raise exception 'missing permission: stock.adjust' using errcode = '42501'; end if;
  select * into c from public.physical_counts where id = p_id for update;
  if not found then raise exception 'Count not found'; end if;
  if not public.can_access_location(c.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if c.status in ('COMPLETED', 'CANCELLED') then raise exception 'This count is already %', lower(c.status); end if;
  update public.physical_counts set status = 'CANCELLED', decided_by = (select auth.uid()), decided_at = now() where id = p_id;
end $$;
revoke execute on function public.cancel_physical_count(uuid) from public, anon;
grant execute on function public.cancel_physical_count(uuid) to authenticated;

-- ---------- the screen ----------
-- p_type: all | FULL | CYCLE | LOCATION ; p_status: all | PENDING | IN_PROGRESS | WAITING_APPROVAL | COMPLETED | CANCELLED
-- Variance = counted - expected. Value = variance x average cost (receipts.cost needed, else null), as on Current Stock.
create or replace function public.physical_counts_page(
  p_q text default null, p_location uuid default null, p_type text default null, p_status text default null,
  p_from date default null, p_to date default null, p_limit int default 10, p_offset int default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_cost boolean := public.has_permission('receipts.cost');
  v_result jsonb;
begin
  if not (public.has_permission('stock.view') or public.has_permission('stock.adjust') or public.has_permission('stock.approve')) then
    raise exception 'You do not have permission to see physical counts' using errcode = '42501';
  end if;
  if p_type is not null and p_type not in ('', 'all', 'FULL', 'CYCLE', 'LOCATION') then raise exception 'Unknown type filter' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'PENDING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'CANCELLED') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with avgc as (
    select gl.item_id, sum(gl.quantity * gc.unit_cost) / nullif(sum(gl.quantity), 0) as avg_cost
      from public.goods_receipt_lines gl
      join public.goods_receipts r on r.id = gl.receipt_id and r.status = 'POSTED'
      join public.goods_receipt_costs gc on gc.line_id = gl.id
     where v_cost group by gl.item_id
  ),
  agg as (
    select pl.count_id, count(*) as items, count(pl.counted) as counted,
           coalesce(sum(pl.counted - pl.expected), 0) as var_qty,
           coalesce(sum(abs(pl.counted - pl.expected)), 0) as var_abs,
           case when v_cost then coalesce(sum((pl.counted - pl.expected) * a.avg_cost), 0) end as var_value,
           case when v_cost then coalesce(sum(abs(pl.counted - pl.expected) * a.avg_cost), 0) end as var_value_abs
      from public.physical_count_lines pl left join avgc a on a.item_id = pl.item_id
     group by pl.count_id
  ),
  base as (
    select c.id, c.count_no, c.created_at, c.created_by, c.count_type, c.status, c.decided_at, l.id as location_id, l.name as place_name,
           coalesce(g.items, 0) as items, coalesce(g.counted, 0) as counted, coalesce(g.var_qty, 0) as var_qty, coalesce(g.var_abs, 0) as var_abs, g.var_value, g.var_value_abs
      from public.physical_counts c join public.locations l on l.id = c.location_id left join agg g on g.count_id = c.id
  ),
  filtered as (
    select b.* from base b
     where (p_location is null or b.location_id = p_location)
       and (coalesce(p_type, '') in ('', 'all') or b.count_type = p_type)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (p_from is null or (b.created_at at time zone 'Asia/Kolkata')::date >= p_from)
       and (p_to is null or (b.created_at at time zone 'Asia/Kolkata')::date <= p_to)
       and (coalesce(p_q, '') = '' or b.count_no ilike v_like or b.place_name ilike v_like
            or exists (select 1 from public.physical_count_lines pl join public.items i on i.id = pl.item_id
                        where pl.count_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.count_no desc), '[]'::jsonb)
               from (select f.*, public.person_name(f.created_by) as created_by_name
                       from (select * from filtered order by created_at desc, count_no desc limit v_limit offset v_offset) f) t),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'completed', (select count(*) from base where status = 'COMPLETED'),
      'in_progress', (select count(*) from base where status = 'IN_PROGRESS'),
      'pending', (select count(*) from base where status = 'PENDING'),
      'waiting', (select count(*) from base where status = 'WAITING_APPROVAL'),
      'variance_qty', (select coalesce(sum(var_abs), 0) from base where status = 'COMPLETED'),
      'variance_value', (select case when v_cost then coalesce(sum(var_value_abs), 0) end from base where status = 'COMPLETED'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)),
    'reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'qty', q) order by q desc), '[]'::jsonb)
                  from (select coalesce(pl.reason, 'OTHER') as reason, sum(abs(pl.counted - pl.expected)) as q
                          from public.physical_count_lines pl join base b on b.id = pl.count_id
                         where b.status = 'COMPLETED' and pl.counted <> pl.expected and (b.decided_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date
                         group by 1) r),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', s.d::text, 'pos', coalesce(x.posq, 0), 'neg', coalesce(x.negq, 0)) order by s.d), '[]'::jsonb)
                from (select (v_today - g)::date as d from generate_series(0, 29) g) s
                left join (select (b.decided_at at time zone 'Asia/Kolkata')::date as d,
                                  sum(pl.counted - pl.expected) filter (where pl.counted > pl.expected) as posq,
                                  sum(pl.expected - pl.counted) filter (where pl.counted < pl.expected) as negq
                             from public.physical_count_lines pl join base b on b.id = pl.count_id
                            where b.status = 'COMPLETED' group by 1) x on x.d = s.d))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.physical_counts_page(text, uuid, text, text, date, date, int, int) from public, anon;
grant execute on function public.physical_counts_page(text, uuid, text, text, date, date, int, int) to authenticated;
