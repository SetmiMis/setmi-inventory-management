-- Dispatch (owner's mock): a packed (READY) sales order is handed to a courier.
-- "Mark as Dispatched" TAKES THE STOCK OUT (owner's choice: stock leaves at Dispatch only): one SALE movement per item for the packed
-- quantity, the sales order becomes DISPATCHED. After that the status of the parcel is changed by hand (no courier API):
-- DISPATCHED -> IN_TRANSIT -> OUT_FOR_DELIVERY -> DELIVERED / DELIVERY_FAILED / RTO. DELIVERED and RTO are final.
-- An RTO does not put the stock back here (that belongs to the Returns page). A dispatch cannot be cancelled.
-- One dispatch per sales order. The same AWB cannot be used twice for the same courier.
-- All writes go through the functions below (no direct table writes).

insert into public.permissions (key, module, description) values
  ('dispatch.view',   'sales', 'See dispatches and courier status of your locations'),
  ('dispatch.manage', 'sales', 'Dispatch packed orders, change courier status, add couriers')
on conflict (key) do nothing;

create table public.couriers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index couriers_name_unique on public.couriers (lower(btrim(name)));
alter table public.couriers enable row level security;
create trigger couriers_audit after insert or update or delete on public.couriers for each row execute function public.log_audit();
insert into public.couriers (name) values ('Blue Dart'), ('Delhivery'), ('Ekart'), ('XpressBees'), ('DTDC'), ('India Post'), ('Other');

create table public.dispatches (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.sales_orders (id) on delete restrict,
  job_id          uuid references public.pick_pack_jobs (id) on delete restrict,
  location_id     uuid not null references public.locations (id) on delete restrict,
  dispatch_date   date not null,
  courier_id      uuid not null references public.couriers (id) on delete restrict,
  service_type    text check (service_type is null or service_type in ('SURFACE', 'AIR', 'EXPRESS', 'STANDARD')),
  awb             text not null check (char_length(awb) between 3 and 60),
  insurance       boolean not null default false,
  pickup_ref      text check (pickup_ref is null or char_length(pickup_ref) <= 60),
  remarks         text check (remarks is null or char_length(remarks) <= 300),
  status          text not null default 'DISPATCHED' check (status in ('DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RTO')),
  delivery_date   date,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id),
  constraint dispatches_delivery_after check (delivery_date is null or delivery_date >= dispatch_date)
);
create unique index dispatches_awb_unique on public.dispatches (courier_id, lower(awb));
create index dispatches_loc_idx on public.dispatches (location_id, dispatch_date desc);
alter table public.dispatches enable row level security;
create trigger dispatches_updated_at before update on public.dispatches for each row execute function public.set_updated_at();
create trigger dispatches_audit after insert or update or delete on public.dispatches for each row execute function public.log_audit();

create table public.dispatch_events (
  id          bigint generated always as identity primary key,
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  status      text not null,
  at          timestamptz not null default now(),
  by_user     uuid references public.profiles (id) default auth.uid()
);
create index dispatch_events_idx on public.dispatch_events (at desc);
alter table public.dispatch_events enable row level security;

create policy couriers_select on public.couriers for select to authenticated
  using ((select public.has_permission('dispatch.view')) or (select public.has_permission('dispatch.manage')));
create policy dispatches_select on public.dispatches for select to authenticated
  using (((select public.has_permission('dispatch.view')) or (select public.has_permission('dispatch.manage')))
         and exists (select 1 from public.sales_orders o where o.id = dispatches.order_id));
create policy dispatch_events_select on public.dispatch_events for select to authenticated
  using (exists (select 1 from public.dispatches d where d.id = dispatch_events.dispatch_id));
revoke all on public.couriers, public.dispatches, public.dispatch_events from anon, authenticated;
grant select on public.couriers, public.dispatches, public.dispatch_events to authenticated;

-- ---------- add a courier ----------
create or replace function public.add_courier(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid;
begin
  if not public.has_permission('dispatch.manage') then raise exception 'missing permission: dispatch.manage' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then raise exception 'Courier name must be 2 to 60 letters'; end if;
  if exists (select 1 from public.couriers where lower(btrim(name)) = lower(v_name)) then raise exception 'This courier is already in the list'; end if;
  insert into public.couriers (name) values (v_name) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.add_courier(text) from public, anon;
grant execute on function public.add_courier(text) to authenticated;

-- ---------- dispatch a packed order ----------
-- p_header: {dispatch_date, courier_id, service_type, awb, insurance, pickup_ref, remarks}
create or replace function public.create_dispatch(p_order_id uuid, p_header jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.sales_orders%rowtype; j public.pick_pack_jobs%rowtype; v_id uuid;
  v_date date := coalesce(nullif(p_header->>'dispatch_date', '')::date, (now() at time zone 'Asia/Kolkata')::date);
  v_courier uuid := nullif(p_header->>'courier_id', '')::uuid; v_service text := nullif(upper(coalesce(p_header->>'service_type', '')), '');
  v_awb text := nullif(btrim(coalesce(p_header->>'awb', '')), ''); v_ins boolean := coalesce((p_header->>'insurance')::boolean, false);
  v_ref text := nullif(btrim(coalesce(p_header->>'pickup_ref', '')), ''); v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
  v_bad text;
begin
  if not public.has_permission('dispatch.manage') then raise exception 'missing permission: dispatch.manage' using errcode = '42501'; end if;
  select * into o from public.sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if not public.can_access_location(o.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if o.status = 'DISPATCHED' then raise exception 'This order is already dispatched'; end if;
  select * into j from public.pick_pack_jobs where order_id = o.id and status <> 'CANCELLED' for update;
  if o.status <> 'IN_PACKING' or j.id is null or j.status <> 'READY' then raise exception 'Only an order that is packed (Ready to Dispatch) can be dispatched'; end if;
  if v_courier is null or not exists (select 1 from public.couriers where id = v_courier and is_active) then raise exception 'Choose the courier partner'; end if;
  if v_service is not null and v_service not in ('SURFACE', 'AIR', 'EXPRESS', 'STANDARD') then raise exception 'Choose a valid service type'; end if;
  if v_awb is null then raise exception 'Enter the AWB / tracking ID'; end if;
  if char_length(v_awb) < 3 or char_length(v_awb) > 60 then raise exception 'The AWB / tracking ID must be 3 to 60 characters'; end if;
  if exists (select 1 from public.dispatches where courier_id = v_courier and lower(awb) = lower(v_awb)) then raise exception 'This AWB is already used for this courier'; end if;
  if v_ref is not null and char_length(v_ref) > 60 then raise exception 'Pickup reference is too long (max 60)'; end if;
  if v_rem is not null and char_length(v_rem) > 300 then raise exception 'Remarks are too long (max 300)'; end if;
  if v_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'The dispatch date cannot be in the future'; end if;
  if v_date < o.order_date then raise exception 'The dispatch date cannot be before the order date'; end if;

  select string_agg(i.internal_item_code || ' (has ' || coalesce(b.quantity, 0)::text || ', needs ' || l.required::text || ')', ', ') into v_bad
    from public.pick_pack_lines l join public.items i on i.id = l.item_id
    left join public.stock_balances b on b.item_id = l.item_id and b.location_id = o.location_id
   where l.job_id = j.id and coalesce(b.quantity, 0) < l.required;
  if v_bad is not null then raise exception 'Not enough stock to dispatch: %', v_bad; end if;

  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason, reference)
  select l.item_id, o.location_id, null, l.required, 'SALE', 'Dispatched on ' || o.order_no, o.order_no
    from public.pick_pack_lines l where l.job_id = j.id order by l.id;

  insert into public.dispatches (order_id, job_id, location_id, dispatch_date, courier_id, service_type, awb, insurance, pickup_ref, remarks)
  values (o.id, j.id, o.location_id, v_date, v_courier, v_service, v_awb, v_ins, v_ref, v_rem) returning id into v_id;
  insert into public.dispatch_events (dispatch_id, status) values (v_id, 'DISPATCHED');
  update public.sales_orders set status = 'DISPATCHED', dispatch_date = v_date where id = o.id;
  return jsonb_build_object('id', v_id, 'order_no', o.order_no);
end $$;
revoke execute on function public.create_dispatch(uuid, jsonb) from public, anon;
grant execute on function public.create_dispatch(uuid, jsonb) to authenticated;

-- ---------- fix the courier details of a dispatch (stock is not touched) ----------
create or replace function public.update_dispatch(p_id uuid, p_header jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.dispatches%rowtype; v_courier uuid;
  v_service text := nullif(upper(coalesce(p_header->>'service_type', '')), '');
  v_awb text := nullif(btrim(coalesce(p_header->>'awb', '')), ''); v_ins boolean := coalesce((p_header->>'insurance')::boolean, false);
  v_ref text := nullif(btrim(coalesce(p_header->>'pickup_ref', '')), ''); v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
begin
  if not public.has_permission('dispatch.manage') then raise exception 'missing permission: dispatch.manage' using errcode = '42501'; end if;
  select * into d from public.dispatches where id = p_id for update;
  if not found then raise exception 'Dispatch not found'; end if;
  if not public.can_access_location(d.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  v_courier := coalesce(nullif(p_header->>'courier_id', '')::uuid, d.courier_id);
  v_courier := coalesce(nullif(p_header->>'courier_id', '')::uuid, d.courier_id);
  if d.status in ('DELIVERED', 'RTO') then raise exception 'A delivered or returned parcel cannot be changed'; end if;
  if not exists (select 1 from public.couriers where id = v_courier and (is_active or id = d.courier_id)) then raise exception 'Choose the courier partner'; end if;
  if v_service is not null and v_service not in ('SURFACE', 'AIR', 'EXPRESS', 'STANDARD') then raise exception 'Choose a valid service type'; end if;
  if v_awb is null then raise exception 'Enter the AWB / tracking ID'; end if;
  if char_length(v_awb) < 3 or char_length(v_awb) > 60 then raise exception 'The AWB / tracking ID must be 3 to 60 characters'; end if;
  if exists (select 1 from public.dispatches where courier_id = v_courier and lower(awb) = lower(v_awb) and id <> d.id) then raise exception 'This AWB is already used for this courier'; end if;
  if v_ref is not null and char_length(v_ref) > 60 then raise exception 'Pickup reference is too long (max 60)'; end if;
  if v_rem is not null and char_length(v_rem) > 300 then raise exception 'Remarks are too long (max 300)'; end if;
  update public.dispatches set courier_id = v_courier, service_type = v_service, awb = v_awb, insurance = v_ins, pickup_ref = v_ref, remarks = v_rem, updated_by = auth.uid() where id = d.id;
end $$;
revoke execute on function public.update_dispatch(uuid, jsonb) from public, anon;
grant execute on function public.update_dispatch(uuid, jsonb) to authenticated;

-- ---------- change the status of the parcel ----------
create or replace function public.set_dispatch_status(p_id uuid, p_status text, p_date date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.dispatches%rowtype; v_status text := upper(coalesce(p_status, '')); v_date date;
begin
  if not public.has_permission('dispatch.manage') then raise exception 'missing permission: dispatch.manage' using errcode = '42501'; end if;
  if v_status not in ('IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RTO') then raise exception 'Choose a status'; end if;
  select * into d from public.dispatches where id = p_id for update;
  if not found then raise exception 'Dispatch not found'; end if;
  if not public.can_access_location(d.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if d.status in ('DELIVERED', 'RTO') then raise exception 'A delivered or returned parcel cannot be changed'; end if;
  if d.status = v_status then raise exception 'The parcel already has this status'; end if;
  v_date := case when v_status in ('DELIVERED', 'DELIVERY_FAILED', 'RTO') then coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date) end;
  if v_date is not null and v_date < d.dispatch_date then raise exception 'The date cannot be before the dispatch date'; end if;
  if v_date is not null and v_date > (now() at time zone 'Asia/Kolkata')::date then raise exception 'The date cannot be in the future'; end if;
  update public.dispatches set status = v_status, delivery_date = v_date, updated_by = auth.uid() where id = d.id;
  insert into public.dispatch_events (dispatch_id, status) values (d.id, v_status);
end $$;
revoke execute on function public.set_dispatch_status(uuid, text, date) from public, anon;
grant execute on function public.set_dispatch_status(uuid, text, date) to authenticated;

-- ---------- the screen ----------
-- p_status: all | DISPATCHED | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | DELIVERY_FAILED | RTO
create or replace function public.dispatch_page(
  p_q text default null, p_courier uuid default null, p_status text default null,
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
  if not (public.has_permission('dispatch.view') or public.has_permission('dispatch.manage')) then
    raise exception 'You do not have permission to see dispatches' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RTO') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select d.id, d.order_id, o.order_no, o.order_date, d.dispatch_date, o.channel, c.name as customer_name, d.courier_id, cr.name as courier_name,
           d.service_type, d.awb, d.insurance, d.pickup_ref, d.remarks, d.status, d.delivery_date, d.location_id, l.name as place_name, d.created_at
      from public.dispatches d
      join public.sales_orders o on o.id = d.order_id
      join public.customers c on c.id = o.customer_id
      join public.couriers cr on cr.id = d.courier_id
      join public.locations l on l.id = d.location_id
  ),
  filtered as (
    select b.* from base b
     where (p_courier is null or b.courier_id = p_courier)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (p_from is null or b.dispatch_date >= p_from)
       and (p_to is null or b.dispatch_date <= p_to)
       and (coalesce(p_q, '') = '' or b.order_no ilike v_like or b.customer_name ilike v_like or b.awb ilike v_like or b.courier_name ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.dispatch_date desc, t.created_at desc), '[]'::jsonb)
               from (select * from filtered order by dispatch_date desc, created_at desc limit v_limit offset v_offset) t),
    'couriers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.couriers where is_active),
    'ready', (select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'order_no', o.order_no, 'customer_name', c.name, 'place_name', l.name) order by o.order_no), '[]'::jsonb)
                from public.sales_orders o join public.customers c on c.id = o.customer_id join public.locations l on l.id = o.location_id
               where o.status = 'IN_PACKING' and exists (select 1 from public.pick_pack_jobs j where j.order_id = o.id and j.status = 'READY')),
    'kpi', jsonb_build_object(
      'to_dispatch', (select count(*) from public.sales_orders o where o.status = 'IN_PACKING' and exists (select 1 from public.pick_pack_jobs j where j.order_id = o.id and j.status = 'READY')),
      'total', (select count(*) from base),
      'today', (select count(*) from base where dispatch_date = v_today),
      'dispatched', (select count(*) from base where status = 'DISPATCHED'),
      'in_transit', (select count(*) from base where status = 'IN_TRANSIT'),
      'out_for_delivery', (select count(*) from base where status = 'OUT_FOR_DELIVERY'),
      'delivered', (select count(*) from base where status = 'DELIVERED'),
      'failed', (select count(*) from base where status = 'DELIVERY_FAILED'),
      'rto', (select count(*) from base where status = 'RTO')),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', g.d, 'dispatched', (select count(*) from base where dispatch_date = g.d),
                'delivered', (select count(*) from base where status = 'DELIVERED' and delivery_date = g.d)) order by g.d), '[]'::jsonb)
                from generate_series(v_today - 29, v_today, interval '1 day') as gs(d0), lateral (select gs.d0::date as d) g),
    'couriers_month', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'n', n) order by n desc, name), '[]'::jsonb)
                from (select courier_name as name, count(*) as n from base where dispatch_date >= date_trunc('month', v_today)::date group by courier_name) x),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('order_no', order_no, 'status', status, 'at', at, 'user', public.person_name(by_user)) order by at desc), '[]'::jsonb)
                from (select o.order_no, e.status, e.at, e.by_user from public.dispatch_events e join public.dispatches d on d.id = e.dispatch_id
                        join public.sales_orders o on o.id = d.order_id order by e.at desc limit 5) r))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.dispatch_page(text, uuid, text, date, date, int, int) from public, anon;
grant execute on function public.dispatch_page(text, uuid, text, date, date, int, int) to authenticated;
