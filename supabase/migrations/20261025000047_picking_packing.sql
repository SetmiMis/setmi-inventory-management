-- Picking & Packing (owner's mock): the warehouse picks the goods of a CONFIRMED sales order, then packs them.
-- A "job" is made when picking starts (the sales order becomes IN_PACKING). Steps of a job: IN_PICKING (scan / type what was picked),
-- IN_PACKING (everything picked, packing details are entered), READY (packed, ready to dispatch). The Dispatch page (later) sends READY jobs.
-- A job can be cancelled before dispatch: the sales order goes back to CONFIRMED.
-- IT DOES NOT TOUCH STOCK (owner's choice): picking and packing are a record; stock goes out at Dispatch.
-- A line can only be picked up to the quantity ordered, and not more than the stock that is in the place now (a check, not a reservation).
-- All writes go through the functions below (no direct table writes).

insert into public.permissions (key, module, description) values
  ('picking.view',   'sales', 'See picking and packing jobs of your locations'),
  ('picking.manage', 'sales', 'Start picking, pick and pack sales orders')
on conflict (key) do nothing;

create table public.pick_pack_jobs (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.sales_orders (id) on delete restrict,
  location_id   uuid not null references public.locations (id) on delete restrict,
  status        text not null default 'IN_PICKING' check (status in ('IN_PICKING', 'IN_PACKING', 'READY', 'CANCELLED')),
  priority      text not null default 'MEDIUM' check (priority in ('HIGH', 'MEDIUM', 'LOW')),
  packing_type  text check (packing_type is null or packing_type in ('BOX', 'POLYBAG', 'ENVELOPE', 'PALLET', 'OTHER')),
  box_no        text check (box_no is null or char_length(box_no) <= 40),
  weight_kg     numeric(10,3) check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 100000)),
  dim_l         numeric(8,1) check (dim_l is null or (dim_l >= 0 and dim_l <= 10000)),
  dim_w         numeric(8,1) check (dim_w is null or (dim_w >= 0 and dim_w <= 10000)),
  dim_h         numeric(8,1) check (dim_h is null or (dim_h >= 0 and dim_h <= 10000)),
  pack_remarks  text check (pack_remarks is null or char_length(pack_remarks) <= 300),
  started_at    timestamptz not null default now(),
  started_by    uuid references public.profiles (id) default auth.uid(),
  picked_at     timestamptz,
  packed_at     timestamptz,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id)
);
create unique index pick_pack_jobs_one_open on public.pick_pack_jobs (order_id) where status <> 'CANCELLED';
create index pick_pack_jobs_location_idx on public.pick_pack_jobs (location_id, updated_at desc);
alter table public.pick_pack_jobs enable row level security;
create trigger pick_pack_jobs_updated_at before update on public.pick_pack_jobs for each row execute function public.set_updated_at();
create trigger pick_pack_jobs_audit after insert or update or delete on public.pick_pack_jobs for each row execute function public.log_audit();

create table public.pick_pack_lines (
  id        bigint generated always as identity primary key,
  job_id    uuid not null references public.pick_pack_jobs (id) on delete cascade,
  item_id   uuid not null references public.items (id) on delete restrict,
  required  numeric(14,3) not null check (required > 0),
  picked    numeric(14,3) not null default 0 check (picked >= 0),
  constraint pick_pack_lines_one_per_item unique (job_id, item_id),
  constraint pick_pack_lines_not_over check (picked <= required)
);
alter table public.pick_pack_lines enable row level security;

create policy pick_pack_jobs_select on public.pick_pack_jobs for select to authenticated
  using (((select public.has_permission('picking.view')) or (select public.has_permission('picking.manage')))
         and exists (select 1 from public.sales_orders o where o.id = pick_pack_jobs.order_id));
create policy pick_pack_lines_select on public.pick_pack_lines for select to authenticated
  using (exists (select 1 from public.pick_pack_jobs j where j.id = pick_pack_lines.job_id));
revoke all on public.pick_pack_jobs, public.pick_pack_lines from anon, authenticated;
grant select on public.pick_pack_jobs, public.pick_pack_lines to authenticated;

-- ---------- start picking ----------
create or replace function public.start_picking(p_order_id uuid, p_priority text default 'MEDIUM')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.sales_orders%rowtype; v_prio text := upper(coalesce(p_priority, 'MEDIUM')); v_id uuid;
begin
  if not public.has_permission('picking.manage') then raise exception 'missing permission: picking.manage' using errcode = '42501'; end if;
  if v_prio not in ('HIGH', 'MEDIUM', 'LOW') then raise exception 'Choose a priority'; end if;
  select * into o from public.sales_orders where id = p_order_id for update;
  if not found then raise exception 'Sales order not found'; end if;
  if not public.can_access_location(o.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if o.status <> 'CONFIRMED' then raise exception 'Only a confirmed order can be picked (this one is %)', lower(replace(o.status, '_', ' ')); end if;
  insert into public.pick_pack_jobs (order_id, location_id, priority) values (o.id, o.location_id, v_prio) returning id into v_id;
  insert into public.pick_pack_lines (job_id, item_id, required) select v_id, l.item_id, l.quantity from public.sales_order_lines l where l.order_id = o.id;
  update public.sales_orders set status = 'IN_PACKING' where id = o.id;
  return jsonb_build_object('id', v_id, 'order_no', o.order_no);
end $$;
revoke execute on function public.start_picking(uuid, text) from public, anon;
grant execute on function public.start_picking(uuid, text) to authenticated;

-- ---------- set how much of an item has been picked ----------
create or replace function public.set_pick_quantity(p_job_id uuid, p_item_id uuid, p_qty numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.pick_pack_jobs%rowtype; v_req numeric; v_dec smallint; v_code text; v_have numeric := 0; v_left int;
begin
  if not public.has_permission('picking.manage') then raise exception 'missing permission: picking.manage' using errcode = '42501'; end if;
  select * into j from public.pick_pack_jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if not public.can_access_location(j.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if j.status <> 'IN_PICKING' then raise exception 'Picking is finished for this order (it is %)', lower(replace(j.status, '_', ' ')); end if;
  select l.required, u.decimals, i.internal_item_code into v_req, v_dec, v_code
    from public.pick_pack_lines l join public.items i on i.id = l.item_id join public.units u on u.code = i.unit where l.job_id = p_job_id and l.item_id = p_item_id;
  if not found then raise exception 'This item is not on the order'; end if;
  if p_qty is null or p_qty < 0 then raise exception '%: quantity cannot be negative', v_code; end if;
  if p_qty <> round(p_qty, v_dec) then raise exception '%: too many decimals for this unit', v_code; end if;
  if p_qty > v_req then raise exception '%: only % are needed for this order', v_code, trim_scale(v_req); end if;
  select coalesce(quantity, 0) into v_have from public.stock_balances where item_id = p_item_id and location_id = j.location_id;
  if p_qty > coalesce(v_have, 0) then raise exception '%: only % in stock here', v_code, trim_scale(coalesce(v_have, 0)); end if;
  update public.pick_pack_lines set picked = p_qty where job_id = p_job_id and item_id = p_item_id;
  select count(*) into v_left from public.pick_pack_lines where job_id = p_job_id and picked < required;
  update public.pick_pack_jobs set status = case when v_left = 0 then 'IN_PACKING' else 'IN_PICKING' end,
         picked_at = case when v_left = 0 then now() end, updated_by = auth.uid() where id = p_job_id;
  return jsonb_build_object('picked', p_qty, 'required', v_req, 'all_picked', v_left = 0);
end $$;
revoke execute on function public.set_pick_quantity(uuid, uuid, numeric) from public, anon;
grant execute on function public.set_pick_quantity(uuid, uuid, numeric) to authenticated;

-- ---------- pack ----------
-- p_header: {packing_type, box_no, weight_kg, dim_l, dim_w, dim_h, remarks}
create or replace function public.mark_packed(p_job_id uuid, p_header jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  j public.pick_pack_jobs%rowtype; v_type text := upper(coalesce(p_header->>'packing_type', '')); v_box text := nullif(btrim(coalesce(p_header->>'box_no', '')), '');
  v_w numeric := nullif(p_header->>'weight_kg', '')::numeric; v_l numeric := nullif(p_header->>'dim_l', '')::numeric; v_wd numeric := nullif(p_header->>'dim_w', '')::numeric;
  v_h numeric := nullif(p_header->>'dim_h', '')::numeric; v_rem text := nullif(btrim(coalesce(p_header->>'remarks', '')), '');
begin
  if not public.has_permission('picking.manage') then raise exception 'missing permission: picking.manage' using errcode = '42501'; end if;
  select * into j from public.pick_pack_jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if not public.can_access_location(j.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if j.status <> 'IN_PACKING' then raise exception 'Pick everything first (this job is %)', lower(replace(j.status, '_', ' ')); end if;
  if v_type not in ('BOX', 'POLYBAG', 'ENVELOPE', 'PALLET', 'OTHER') then raise exception 'Choose the packing type'; end if;
  if v_box is null then raise exception 'Enter the box / packet number'; end if;
  if char_length(v_box) > 40 then raise exception 'The box number is too long (max 40)'; end if;
  if v_rem is not null and char_length(v_rem) > 300 then raise exception 'Remarks are too long (max 300)'; end if;
  if coalesce(v_w, 0) < 0 or coalesce(v_l, 0) < 0 or coalesce(v_wd, 0) < 0 or coalesce(v_h, 0) < 0 then raise exception 'Weight and sizes cannot be negative'; end if;
  update public.pick_pack_jobs set status = 'READY', packing_type = v_type, box_no = v_box, weight_kg = v_w, dim_l = v_l, dim_w = v_wd, dim_h = v_h,
         pack_remarks = v_rem, packed_at = now(), updated_by = auth.uid() where id = p_job_id;
end $$;
revoke execute on function public.mark_packed(uuid, jsonb) from public, anon;
grant execute on function public.mark_packed(uuid, jsonb) to authenticated;

-- ---------- give up (before dispatch): the order goes back to Confirmed ----------
create or replace function public.cancel_picking(p_job_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.pick_pack_jobs%rowtype;
begin
  if not public.has_permission('picking.manage') then raise exception 'missing permission: picking.manage' using errcode = '42501'; end if;
  select * into j from public.pick_pack_jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;
  if not public.can_access_location(j.location_id) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if j.status = 'CANCELLED' then raise exception 'This job is already cancelled'; end if;
  if (select status from public.sales_orders where id = j.order_id) <> 'IN_PACKING' then raise exception 'The order is already dispatched or cancelled'; end if;
  update public.pick_pack_jobs set status = 'CANCELLED', updated_by = auth.uid() where id = p_job_id;
  update public.sales_orders set status = 'CONFIRMED' where id = j.order_id;
end $$;
revoke execute on function public.cancel_picking(uuid) from public, anon;
grant execute on function public.cancel_picking(uuid) to authenticated;

-- ---------- the screen ----------
-- Orders that are confirmed, being packed or dispatched, each with its picking / packing stage:
-- PENDING_PICKING (confirmed, picking not started), IN_PICKING, IN_PACKING, READY, DISPATCHED. DELAYED = expected dispatch date passed and not dispatched.
-- p_status: all | PENDING_PICKING | IN_PICKING | IN_PACKING | READY | DISPATCHED | DELAYED ; p_channel: all | channel code
create or replace function public.picking_page(
  p_q text default null, p_location uuid default null, p_channel text default null, p_status text default null,
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
  if not (public.has_permission('picking.view') or public.has_permission('picking.manage')) then
    raise exception 'You do not have permission to see picking and packing' using errcode = '42501';
  end if;
  if p_channel is not null and p_channel not in ('', 'all', 'WEBSITE', 'AMAZON', 'FLIPKART', 'MEESHO', 'DIRECT', 'OTHER') then raise exception 'Unknown channel filter' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'PENDING_PICKING', 'IN_PICKING', 'IN_PACKING', 'READY', 'DISPATCHED', 'DELAYED') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select o.id as order_id, o.order_no, o.order_date, o.expected_dispatch, o.channel, o.created_at as order_created,
           c.name as customer_name, l.id as location_id, l.name as place_name,
           j.id as job_id, coalesce(j.priority, 'MEDIUM') as priority, j.updated_at as job_updated, j.updated_by as job_user,
           case when o.status = 'DISPATCHED' then 'DISPATCHED' when j.id is null and o.status = 'IN_PACKING' then 'IN_PICKING' when j.id is null then 'PENDING_PICKING' else j.status end as stage,
           (select count(*) from public.sales_order_lines sl where sl.order_id = o.id) as items,
           coalesce((select count(*) from public.pick_pack_lines pl where pl.job_id = j.id and pl.picked >= pl.required), 0) as picked_items,
           (o.status <> 'DISPATCHED' and o.expected_dispatch is not null and o.expected_dispatch < v_today) as delayed
      from public.sales_orders o
      join public.customers c on c.id = o.customer_id
      join public.locations l on l.id = o.location_id
      left join public.pick_pack_jobs j on j.order_id = o.id and j.status <> 'CANCELLED'
     where o.status in ('CONFIRMED', 'IN_PACKING', 'DISPATCHED')
  ),
  filtered as (
    select b.* from base b
     where (p_location is null or b.location_id = p_location)
       and (coalesce(p_channel, '') in ('', 'all') or b.channel = p_channel)
       and (coalesce(p_status, '') in ('', 'all') or (p_status = 'DELAYED' and b.delayed) or (p_status <> 'DELAYED' and b.stage = p_status))
       and (p_from is null or b.order_date >= p_from)
       and (p_to is null or b.order_date <= p_to)
       and (coalesce(p_q, '') = '' or b.order_no ilike v_like or b.customer_name ilike v_like
            or exists (select 1 from public.sales_order_lines sl join public.items i on i.id = sl.item_id
                        where sl.order_id = b.order_id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.order_created desc, t.order_no desc), '[]'::jsonb)
               from (select * from filtered order by order_created desc, order_no desc limit v_limit offset v_offset) t),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'pending', (select count(*) from base where stage = 'PENDING_PICKING'),
      'in_picking', (select count(*) from base where stage = 'IN_PICKING'),
      'in_packing', (select count(*) from base where stage = 'IN_PACKING'),
      'ready', (select count(*) from base where stage = 'READY'),
      'dispatched', (select count(*) from base where stage = 'DISPATCHED'),
      'delayed', (select count(*) from base where delayed)),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'n', n) order by n desc), '[]'::jsonb) from (select channel, count(*) as n from base where stage <> 'DISPATCHED' group by channel) x),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('order_no', order_no, 'stage', stage, 'at', job_updated, 'user', public.person_name(job_user)) order by job_updated desc), '[]'::jsonb)
                 from (select * from base where job_updated is not null order by job_updated desc limit 5) r))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.picking_page(text, uuid, text, text, date, date, int, int) from public, anon;
grant execute on function public.picking_page(text, uuid, text, text, date, date, int, int) to authenticated;
