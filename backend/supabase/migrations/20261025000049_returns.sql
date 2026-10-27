-- Returns (owner's mock): a customer sends back goods of a DISPATCHED sales order.
-- Steps: PICKUP_PENDING -> IN_TRANSIT -> UNDER_INSPECTION (moved forward by hand, no courier connection) -> APPROVED or REJECTED.
-- The person who inspects writes the condition of each item (GOOD / DAMAGED / USED) and chooses REFUND or REPLACEMENT (a record only: no money, no new order).
-- APPROVE (needs returns.approve) puts only the GOOD items back into the stock of the place the order shipped from (SALE_RETURN movement).
-- DAMAGED and USED items do not come back into stock (owner's choice); they stay as a record. REJECT does not touch stock.
-- A return is for items of one dispatched order; the total returned per item (not rejected) cannot be more than the quantity ordered.
-- All writes go through the functions below (no direct table writes).

insert into public.permissions (key, module, description) values
  ('returns.view',    'sales', 'See customer returns of your locations'),
  ('returns.manage',  'sales', 'Make returns, move them forward, write the inspection, reject'),
  ('returns.approve', 'sales', 'Approve returns (good items go back into stock)')
on conflict (key) do nothing;

create sequence public.sales_return_seq;
revoke all on sequence public.sales_return_seq from public, anon, authenticated;

create table public.sales_returns (
  id              uuid primary key default gen_random_uuid(),
  return_no       text not null unique default ('RT-' || to_char((now() at time zone 'Asia/Kolkata'), 'YYYY') || '-' || lpad(nextval('public.sales_return_seq')::text, 4, '0')),
  order_id        uuid not null references public.sales_orders (id) on delete restrict,
  location_id     uuid not null references public.locations (id) on delete restrict,
  return_date     date not null,
  reason          text not null check (reason in ('DAMAGED', 'WRONG_ITEM', 'NOT_WORKING', 'CHANGED_MIND', 'MISSING_ITEM', 'OTHER')),
  status          text not null default 'PICKUP_PENDING' check (status in ('PICKUP_PENDING', 'IN_TRANSIT', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED')),
  resolution      text check (resolution is null or resolution in ('REFUND', 'REPLACEMENT')),
  pickup_awb      text check (pickup_awb is null or char_length(pickup_awb) <= 60),
  remarks         text check (remarks is null or char_length(remarks) <= 300),
  inspection_note text check (inspection_note is null or char_length(inspection_note) <= 300),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);
create index sales_returns_order_idx on public.sales_returns (order_id);
create index sales_returns_loc_idx on public.sales_returns (location_id, return_date desc);
alter table public.sales_returns enable row level security;
create trigger sales_returns_updated_at before update on public.sales_returns for each row execute function public.set_updated_at();
create trigger sales_returns_audit after insert or update or delete on public.sales_returns for each row execute function public.log_audit();

create table public.sales_return_lines (
  id        bigint generated always as identity primary key,
  return_id uuid not null references public.sales_returns (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete restrict,
  quantity  numeric(14,3) not null check (quantity > 0),
  condition text not null default 'GOOD' check (condition in ('GOOD', 'DAMAGED', 'USED')),
  constraint sales_return_lines_one_per_item unique (return_id, item_id)
);
alter table public.sales_return_lines enable row level security;

create table public.sales_return_events (
  id        bigint generated always as identity primary key,
  return_id uuid not null references public.sales_returns (id) on delete cascade,
  status    text not null,
  at        timestamptz not null default now(),
  by_user   uuid references public.profiles (id) default auth.uid()
);
create index sales_return_events_idx on public.sales_return_events (at desc);
alter table public.sales_return_events enable row level security;

create policy sales_returns_select on public.sales_returns for select to authenticated
  using (((select public.has_permission('returns.view')) or (select public.has_permission('returns.manage')) or (select public.has_permission('returns.approve')))
         and exists (select 1 from public.sales_orders o where o.id = sales_returns.order_id));
create policy sales_return_lines_select on public.sales_return_lines for select to authenticated
  using (exists (select 1 from public.sales_returns r where r.id = sales_return_lines.return_id));
create policy sales_return_events_select on public.sales_return_events for select to authenticated
  using (exists (select 1 from public.sales_returns r where r.id = sales_return_events.return_id));
revoke all on public.sales_returns, public.sales_return_lines, public.sales_return_events from anon, authenticated;
grant select on public.sales_returns, public.sales_return_lines, public.sales_return_events to authenticated;

-- ---------- how much of each item of an order can still be returned ----------
create or replace function public.return_order_items(p_order_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not (public.has_permission('returns.view') or public.has_permission('returns.manage') or public.has_permission('returns.approve')) then
    raise exception 'You do not have permission to see returns' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('item_id', l.item_id, 'code', i.internal_item_code, 'name', i.item_name, 'unit', i.unit, 'decimals', u.decimals,
            'ordered', l.quantity, 'returned', coalesce(r.q, 0), 'remaining', l.quantity - coalesce(r.q, 0)) order by l.id), '[]'::jsonb)
            from public.sales_order_lines l
            join public.items i on i.id = l.item_id join public.units u on u.code = i.unit
            left join lateral (select sum(rl.quantity) as q from public.sales_return_lines rl join public.sales_returns sr on sr.id = rl.return_id
                                where sr.order_id = l.order_id and rl.item_id = l.item_id and sr.status <> 'REJECTED') r on true
           where l.order_id = p_order_id);
end $$;
revoke execute on function public.return_order_items(uuid) from public, anon;
grant execute on function public.return_order_items(uuid) to authenticated;

-- ---------- make a return ----------
-- p_header: {return_date, reason, pickup_awb, remarks}; p_lines: [{item_id, quantity, condition}]
create or replace function public.create_return(p_order_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_orders%rowtype; v_id uuid; v_no text; x record; v_n int; v_errors jsonb := '[]'::jsonb; v_left numeric;
  v_date date := coalesce(nullif(p_header->>'return_date', '')::date, (now() at time zone 'Asia/Kolkata')::date);
  v_reason text := upper(coalesce(p_header->>'reason', '')); v_awb text := nullif(btrim(coalesce(p_header->>'pickup_awb', '')), '');
  v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
begin
  if not public.has_permission('returns.manage') then raise exception 'missing permission: returns.manage' using errcode = '42501'; end if;
  select * into o from public.sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if not public.can_access_location(o.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if o.status <> 'DISPATCHED' then raise exception 'Only a dispatched order can have a return (this one is %)', lower(replace(o.status, '_', ' ')); end if;
  if v_reason not in ('DAMAGED', 'WRONG_ITEM', 'NOT_WORKING', 'CHANGED_MIND', 'MISSING_ITEM', 'OTHER') then raise exception 'Choose the return reason'; end if;
  if v_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'The return date cannot be in the future'; end if;
  if v_date < o.order_date then raise exception 'The return date cannot be before the order date'; end if;
  if v_awb is not null and char_length(v_awb) > 60 then raise exception 'Pickup AWB is too long (max 60)'; end if;
  if v_rem is not null and char_length(v_rem) > 300 then raise exception 'Remarks are too long (max 300)'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Choose at least one item to return'; end if;
  if v_n > 200 then raise exception 'at most 200 lines per return'; end if;

  for x in select t.item_id, t.quantity, upper(coalesce(t.condition, 'GOOD')) as cond, i.internal_item_code as code, u.decimals as dec,
                  (select sum(l.quantity) from public.sales_order_lines l where l.order_id = o.id and l.item_id = t.item_id) as ordered
             from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, condition text)
             left join public.items i on i.id = t.item_id left join public.units u on u.code = i.unit loop
    if x.ordered is null then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'This item is not on the order'); continue; end if;
    if x.quantity is null or x.quantity <= 0 then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'Quantity must be more than 0'); continue; end if;
    if x.quantity <> round(x.quantity, x.dec) then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'Too many decimals for this unit'); continue; end if;
    if x.cond not in ('GOOD', 'DAMAGED', 'USED') then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'Choose the condition'); continue; end if;
    select x.ordered - coalesce(sum(rl.quantity), 0) into v_left from public.sales_return_lines rl join public.sales_returns sr on sr.id = rl.return_id
     where sr.order_id = o.id and rl.item_id = x.item_id and sr.status <> 'REJECTED';
    if x.quantity > v_left then v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'code', x.code, 'message', 'Only ' || trim_scale(v_left)::text || ' can still be returned'); end if;
  end loop;
  for x in select (e->>'item_id')::uuid as item_id from jsonb_array_elements(p_lines) e group by 1 having count(*) > 1 loop
    v_errors := v_errors || jsonb_build_object('item_id', x.item_id, 'message', 'The same item is listed twice');
  end loop;
  if jsonb_array_length(v_errors) > 0 then raise exception '%', coalesce((v_errors->0->>'code') || ': ', '') || (v_errors->0->>'message'); end if;

  insert into public.sales_returns (order_id, location_id, return_date, reason, pickup_awb, remarks) values (o.id, o.location_id, v_date, v_reason, v_awb, v_rem) returning id, return_no into v_id, v_no;
  insert into public.sales_return_lines (return_id, item_id, quantity, condition)
  select v_id, t.item_id, t.quantity, upper(coalesce(t.condition, 'GOOD')) from jsonb_to_recordset(p_lines) as t(item_id uuid, quantity numeric, condition text);
  insert into public.sales_return_events (return_id, status) values (v_id, 'PICKUP_PENDING');
  return jsonb_build_object('id', v_id, 'return_no', v_no);
end $$;
revoke execute on function public.create_return(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_return(uuid, jsonb, jsonb) to authenticated;

-- ---------- move forward: pickup pending -> in transit -> under inspection ----------
create or replace function public.set_return_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.sales_returns%rowtype; v_status text := upper(coalesce(p_status, ''));
  rank_of constant text[] := array['PICKUP_PENDING', 'IN_TRANSIT', 'UNDER_INSPECTION'];
begin
  if not public.has_permission('returns.manage') then raise exception 'missing permission: returns.manage' using errcode = '42501'; end if;
  if v_status not in ('IN_TRANSIT', 'UNDER_INSPECTION') then raise exception 'Choose In Transit or Under Inspection'; end if;
  select * into r from public.sales_returns where id = p_id for update;
  if not found then raise exception 'Return not found'; end if;
  if not public.can_access_location(r.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if r.status in ('APPROVED', 'REJECTED') then raise exception 'This return is already decided'; end if;
  if array_position(rank_of, v_status) <= array_position(rank_of, r.status) then raise exception 'A return can only move forward (it is %)', lower(replace(r.status, '_', ' ')); end if;
  update public.sales_returns set status = v_status, updated_by = auth.uid() where id = p_id;
  insert into public.sales_return_events (return_id, status) values (p_id, v_status);
end $$;
revoke execute on function public.set_return_status(uuid, text) from public, anon;
grant execute on function public.set_return_status(uuid, text) to authenticated;

-- ---------- the inspection: condition of each item, refund or replacement, a note ----------
-- p_header: {resolution, note, pickup_awb}; p_lines: [{item_id, condition}]
create or replace function public.save_inspection(p_id uuid, p_header jsonb, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.sales_returns%rowtype; v_res text := nullif(upper(coalesce(p_header->>'resolution', '')), ''); v_note text := nullif(btrim(coalesce(p_header->>'note', '')), '');
  v_awb text := nullif(btrim(coalesce(p_header->>'pickup_awb', '')), ''); x record;
begin
  if not public.has_permission('returns.manage') then raise exception 'missing permission: returns.manage' using errcode = '42501'; end if;
  select * into r from public.sales_returns where id = p_id for update;
  if not found then raise exception 'Return not found'; end if;
  if not public.can_access_location(r.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if r.status in ('APPROVED', 'REJECTED') then raise exception 'This return is already decided'; end if;
  if v_res is not null and v_res not in ('REFUND', 'REPLACEMENT') then raise exception 'Choose Refund or Replacement'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'The note is too long (max 300)'; end if;
  if v_awb is not null and char_length(v_awb) > 60 then raise exception 'Pickup AWB is too long (max 60)'; end if;
  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
    for x in select t.item_id, upper(coalesce(t.condition, '')) as cond from jsonb_to_recordset(p_lines) as t(item_id uuid, condition text) loop
      if x.cond not in ('GOOD', 'DAMAGED', 'USED') then raise exception 'Choose the condition of each item'; end if;
      update public.sales_return_lines set condition = x.cond where return_id = p_id and item_id = x.item_id;
      if not found then raise exception 'An item is not on this return'; end if;
    end loop;
  end if;
  update public.sales_returns set resolution = v_res, inspection_note = v_note, pickup_awb = coalesce(v_awb, pickup_awb), updated_by = auth.uid() where id = p_id;
end $$;
revoke execute on function public.save_inspection(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_inspection(uuid, jsonb, jsonb) to authenticated;

-- ---------- approve: only GOOD items go back into stock ----------
create or replace function public.approve_return(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.sales_returns%rowtype; v_back int := 0;
begin
  if not public.has_permission('returns.approve') then raise exception 'missing permission: returns.approve' using errcode = '42501'; end if;
  select * into r from public.sales_returns where id = p_id for update;
  if not found then raise exception 'Return not found'; end if;
  if not public.can_access_location(r.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if r.status <> 'UNDER_INSPECTION' then raise exception 'Only a return that is under inspection can be approved (this one is %)', lower(replace(r.status, '_', ' ')); end if;
  if r.resolution is null then raise exception 'Choose Refund or Replacement in the inspection first'; end if;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, null, r.location_id, l.quantity, 'SALE_RETURN', 'Customer return ' || r.return_no, r.return_no
    from public.sales_return_lines l where l.return_id = p_id and l.condition = 'GOOD' order by l.id;
  get diagnostics v_back = row_count;
  update public.sales_returns set status = 'APPROVED', decided_at = now(), decided_by = auth.uid(), updated_by = auth.uid() where id = p_id;
  insert into public.sales_return_events (return_id, status) values (p_id, 'APPROVED');
  return jsonb_build_object('return_no', r.return_no, 'restocked_lines', v_back);
end $$;
revoke execute on function public.approve_return(uuid) from public, anon;
grant execute on function public.approve_return(uuid) to authenticated;

-- ---------- reject: stock is not touched ----------
create or replace function public.reject_return(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.sales_returns%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_permission('returns.approve') then raise exception 'missing permission: returns.approve' using errcode = '42501'; end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'Write a reason (at least 3 letters)'; end if;
  if char_length(v_note) > 300 then raise exception 'The reason is too long (max 300)'; end if;
  select * into r from public.sales_returns where id = p_id for update;
  if not found then raise exception 'Return not found'; end if;
  if not public.can_access_location(r.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if r.status in ('APPROVED', 'REJECTED') then raise exception 'This return is already decided'; end if;
  update public.sales_returns set status = 'REJECTED', inspection_note = v_note, decided_at = now(), decided_by = auth.uid(), updated_by = auth.uid() where id = p_id;
  insert into public.sales_return_events (return_id, status) values (p_id, 'REJECTED');
end $$;
revoke execute on function public.reject_return(uuid, text) from public, anon;
grant execute on function public.reject_return(uuid, text) to authenticated;

-- ---------- the screen ----------
-- p_status: all | PICKUP_PENDING | IN_TRANSIT | UNDER_INSPECTION | APPROVED | REJECTED ; p_reason: all | reason code ; p_channel: all | channel code
create or replace function public.returns_page(
  p_q text default null, p_reason text default null, p_status text default null, p_channel text default null,
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
  if not (public.has_permission('returns.view') or public.has_permission('returns.manage') or public.has_permission('returns.approve')) then
    raise exception 'You do not have permission to see returns' using errcode = '42501';
  end if;
  if p_reason is not null and p_reason not in ('', 'all', 'DAMAGED', 'WRONG_ITEM', 'NOT_WORKING', 'CHANGED_MIND', 'MISSING_ITEM', 'OTHER') then raise exception 'Unknown reason filter' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'PICKUP_PENDING', 'IN_TRANSIT', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  if p_channel is not null and p_channel not in ('', 'all', 'WEBSITE', 'AMAZON', 'FLIPKART', 'MEESHO', 'DIRECT', 'OTHER') then raise exception 'Unknown channel filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select r.id, r.return_no, r.order_id, o.order_no, o.order_date, r.return_date, o.channel, c.name as customer_name, r.reason, r.status, r.resolution,
           r.pickup_awb, r.location_id, l.name as place_name, r.created_at,
           (select count(*) from public.sales_return_lines rl where rl.return_id = r.id) as items
      from public.sales_returns r
      join public.sales_orders o on o.id = r.order_id
      join public.customers c on c.id = o.customer_id
      join public.locations l on l.id = r.location_id
  ),
  filtered as (
    select b.* from base b
     where (coalesce(p_reason, '') in ('', 'all') or b.reason = p_reason)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (coalesce(p_channel, '') in ('', 'all') or b.channel = p_channel)
       and (p_from is null or b.return_date >= p_from)
       and (p_to is null or b.return_date <= p_to)
       and (coalesce(p_q, '') = '' or b.return_no ilike v_like or b.order_no ilike v_like or b.customer_name ilike v_like or coalesce(b.pickup_awb, '') ilike v_like
            or exists (select 1 from public.sales_return_lines rl join public.items i on i.id = rl.item_id
                        where rl.return_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.return_date desc, t.created_at desc), '[]'::jsonb)
               from (select * from filtered order by return_date desc, created_at desc limit v_limit offset v_offset) t),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'customer_name', c.name) order by o.order_no desc), '[]'::jsonb)
                 from (select * from public.sales_orders where status = 'DISPATCHED' order by order_no desc limit 300) o join public.customers c on c.id = o.customer_id),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'pickup_pending', (select count(*) from base where status = 'PICKUP_PENDING'),
      'in_transit', (select count(*) from base where status = 'IN_TRANSIT'),
      'under_inspection', (select count(*) from base where status = 'UNDER_INSPECTION'),
      'approved', (select count(*) from base where status = 'APPROVED'),
      'rejected', (select count(*) from base where status = 'REJECTED')),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', g.d, 'total', (select count(*) from base where return_date = g.d),
                'approved', (select count(*) from public.sales_returns sr where sr.status = 'APPROVED' and (sr.decided_at at time zone 'Asia/Kolkata')::date = g.d)) order by g.d), '[]'::jsonb)
                from generate_series(v_today - 29, v_today, interval '1 day') as gs(d0), lateral (select gs.d0::date as d) g),
    'reasons_month', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'n', n) order by n desc, reason), '[]'::jsonb)
                from (select reason, count(*) as n from base where return_date >= date_trunc('month', v_today)::date group by reason) x),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('return_no', return_no, 'status', status, 'at', at, 'user', public.person_name(by_user)) order by at desc), '[]'::jsonb)
                from (select r.return_no, e.status, e.at, e.by_user from public.sales_return_events e join public.sales_returns r on r.id = e.return_id order by e.at desc limit 5) x))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.returns_page(text, text, text, text, date, date, int, int) from public, anon;
grant execute on function public.returns_page(text, text, text, text, date, date, int, int) to authenticated;
