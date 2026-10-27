-- Import Shipments (owner's mock): one shipment carries goods of ONE purchase order of an Import supplier (a PO may have many
-- shipments). A shipment has a container, ports, ETD/ETA, shipping line, vessel and incoterms, the quantities of the PO lines it
-- carries, a status that moves forward (Booked, Dispatched, In Transit, Arrived at Port, Customs Clearance, Delivered) or Cancelled,
-- and optional charges (freight, duty ...). A shipment NEVER changes stock: stock only grows when a goods receipt (GRN) is posted.
-- "Delayed" is not stored: it is a shipment that is not delivered / cancelled and whose ETA is before today (India time).
-- Nothing is deleted. All writes go through the functions below (no direct table writes for anyone).
-- To see shipments a person needs shipments.view or shipments.manage AND a purchase permission (the order stays behind row rules).

insert into public.permissions (key, module, description) values
  ('shipments.view',   'purchasing', 'See import shipments of your locations'),
  ('shipments.manage', 'purchasing', 'Create import shipments, change their status and add charges')
on conflict (key) do nothing;

create sequence public.import_shipment_seq;
revoke all on sequence public.import_shipment_seq from public, anon, authenticated;

create table public.import_shipments (
  id             uuid primary key default gen_random_uuid(),
  shipment_no    text not null unique default ('IMP-' || to_char((now() at time zone 'Asia/Kolkata'), 'YYYY') || '-' || lpad(nextval('public.import_shipment_seq')::text, 3, '0')),
  po_id          uuid not null references public.purchase_orders (id) on delete restrict,
  container_no   text check (container_no is null or char_length(container_no) <= 40),
  bl_no          text check (bl_no is null or char_length(bl_no) <= 60),
  port_loading   text check (port_loading is null or char_length(port_loading) <= 80),
  port_discharge text check (port_discharge is null or char_length(port_discharge) <= 80),
  etd            date,
  eta            date,
  shipping_line  text check (shipping_line is null or char_length(shipping_line) <= 80),
  vessel         text check (vessel is null or char_length(vessel) <= 80),
  incoterms      text check (incoterms is null or incoterms in ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP')),
  notes          text check (notes is null or char_length(notes) <= 1000),
  status         text not null default 'BOOKED' check (status in ('BOOKED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS', 'DELIVERED', 'CANCELLED')),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id),
  constraint import_shipments_dates check (eta is null or etd is null or eta >= etd)
);
create index import_shipments_po_idx on public.import_shipments (po_id);
create index import_shipments_created_idx on public.import_shipments (created_at desc);
alter table public.import_shipments enable row level security;
create trigger import_shipments_updated_at before update on public.import_shipments for each row execute function public.set_updated_at();
create trigger import_shipments_audit after insert or update or delete on public.import_shipments for each row execute function public.log_audit();

create table public.import_shipment_lines (
  id           bigint generated always as identity primary key,
  shipment_id  uuid not null references public.import_shipments (id) on delete cascade,
  po_line_id   bigint not null references public.purchase_order_lines (id) on delete restrict,
  quantity     numeric(14,3) not null check (quantity > 0),
  constraint import_shipment_lines_one_per_line unique (shipment_id, po_line_id)
);
alter table public.import_shipment_lines enable row level security;

-- Every status the shipment has reached, with its date (this is the progress line and the history).
create table public.import_shipment_events (
  id           bigint generated always as identity primary key,
  shipment_id  uuid not null references public.import_shipments (id) on delete cascade,
  status       text not null,
  event_date   date not null,
  note         text check (note is null or char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) default auth.uid()
);
create index import_shipment_events_idx on public.import_shipment_events (shipment_id, id);
alter table public.import_shipment_events enable row level security;

-- Money: freight, duty and so on. Visible and changeable only with receipts.cost.
create table public.import_shipment_charges (
  id           bigint generated always as identity primary key,
  shipment_id  uuid not null references public.import_shipments (id) on delete cascade,
  charge_type  text not null check (charge_type in ('FREIGHT', 'CUSTOMS_DUTY', 'CLEARING', 'INSURANCE', 'PORT', 'OTHER')),
  amount       numeric(14,2) not null check (amount >= 0 and amount <= 99999999999),
  note         text check (note is null or char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) default auth.uid()
);
create index import_shipment_charges_idx on public.import_shipment_charges (shipment_id);
alter table public.import_shipment_charges enable row level security;
create trigger import_shipment_charges_audit after insert or update or delete on public.import_shipment_charges for each row execute function public.log_audit();

-- ---------- read rules ----------
create policy import_shipments_select on public.import_shipments for select to authenticated
  using (((select public.has_permission('shipments.view')) or (select public.has_permission('shipments.manage')))
         and exists (select 1 from public.purchase_orders o where o.id = import_shipments.po_id));
create policy import_shipment_lines_select on public.import_shipment_lines for select to authenticated
  using (exists (select 1 from public.import_shipments s where s.id = import_shipment_lines.shipment_id));
create policy import_shipment_events_select on public.import_shipment_events for select to authenticated
  using (exists (select 1 from public.import_shipments s where s.id = import_shipment_events.shipment_id));
create policy import_shipment_charges_select on public.import_shipment_charges for select to authenticated
  using ((select public.has_permission('receipts.cost'))
         and exists (select 1 from public.import_shipments s where s.id = import_shipment_charges.shipment_id));
revoke all on public.import_shipments, public.import_shipment_lines, public.import_shipment_events, public.import_shipment_charges from anon, authenticated;
grant select on public.import_shipments, public.import_shipment_lines, public.import_shipment_events, public.import_shipment_charges to authenticated;

-- ---------- save (create or edit) ----------
-- p_header: {po_id, container_no, bl_no, port_loading, port_discharge, etd, eta, shipping_line, vessel, incoterms, notes}
-- p_lines : [{po_line_id, quantity}]
-- Only Booked or Dispatched shipments can be edited; the order cannot be changed on an existing shipment.
create or replace function public.save_import_shipment(p_id uuid, p_header jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_po uuid := (p_header->>'po_id')::uuid;
  v_etd date := nullif(p_header->>'etd', '')::date;
  v_eta date := nullif(p_header->>'eta', '')::date;
  v_inco text := upper(nullif(btrim(coalesce(p_header->>'incoterms', '')), ''));
  v_loc uuid; v_status text; v_pstatus public.po_status; v_stype text; v_old_po uuid;
  v_id uuid; v_no text; v_n int; v_errors jsonb := '[]'::jsonb;
  x record; v_free numeric; v_dec smallint;
begin
  if not public.has_permission('shipments.manage') then
    raise exception 'missing permission: shipments.manage' using errcode = '42501';
  end if;
  select o.location_id, o.status, s.supplier_type::text into v_loc, v_pstatus, v_stype
    from public.purchase_orders o join public.suppliers s on s.id = o.supplier_id where o.id = v_po;
  if not found then raise exception 'Purchase order not found'; end if;
  if not public.can_access_location(v_loc) then
    raise exception 'you do not work in this location' using errcode = '42501';
  end if;
  if v_stype <> 'IMPORT' then raise exception 'Import shipments are only for purchase orders of an Import supplier'; end if;
  if v_pstatus not in ('SENT', 'PARTIAL') then raise exception 'The purchase order must be sent and not yet completed'; end if;
  if v_etd is not null and v_eta is not null and v_eta < v_etd then raise exception 'ETA cannot be before ETD'; end if;
  if v_inco is not null and v_inco not in ('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP') then raise exception 'Unknown incoterms'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'lines must be a JSON array'; end if;
  v_n := jsonb_array_length(p_lines);
  if v_n = 0 then raise exception 'Add at least one item'; end if;
  if v_n > 500 then raise exception 'at most 500 lines per shipment'; end if;

  if p_id is not null then
    select status, po_id into v_status, v_old_po from public.import_shipments where id = p_id for update;
    if not found then raise exception 'Shipment not found'; end if;
    if v_old_po <> v_po then raise exception 'The purchase order of a shipment cannot be changed'; end if;
    if v_status not in ('BOOKED', 'DISPATCHED') then raise exception 'Only a booked or dispatched shipment can be edited' using errcode = '42501'; end if;
  end if;

  for x in select t.po_line_id, t.quantity from jsonb_to_recordset(p_lines) as t(po_line_id bigint, quantity numeric) loop
    select l.quantity - greatest(l.received_qty, 0)
           - coalesce((select sum(sl.quantity) from public.import_shipment_lines sl join public.import_shipments s2 on s2.id = sl.shipment_id
                        where sl.po_line_id = l.id and s2.status <> 'CANCELLED' and s2.id is distinct from p_id), 0),
           u.decimals
      into v_free, v_dec
      from public.purchase_order_lines l join public.items i on i.id = l.item_id join public.units u on u.code = i.unit
     where l.id = x.po_line_id and l.po_id = v_po;
    if not found then
      v_errors := v_errors || jsonb_build_object('po_line_id', x.po_line_id, 'message', 'Item is not on this purchase order');
    elsif x.quantity is null or x.quantity <= 0 or x.quantity > 99999999 then
      v_errors := v_errors || jsonb_build_object('po_line_id', x.po_line_id, 'message', 'Quantity must be more than 0');
    elsif x.quantity <> round(x.quantity, v_dec) then
      v_errors := v_errors || jsonb_build_object('po_line_id', x.po_line_id, 'message', 'Quantity has too many decimals for this unit');
    elsif x.quantity > v_free then
      v_errors := v_errors || jsonb_build_object('po_line_id', x.po_line_id, 'message', 'More than is still open on the order (' || trim_scale(v_free) || ')');
    end if;
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    raise exception '%', (v_errors->0->>'message') using errcode = 'P0001', detail = v_errors::text;
  end if;
  if (select count(distinct t.po_line_id) from jsonb_to_recordset(p_lines) as t(po_line_id bigint, quantity numeric)) <> v_n then
    raise exception 'An item is listed twice';
  end if;

  if p_id is null then
    insert into public.import_shipments (po_id, container_no, bl_no, port_loading, port_discharge, etd, eta, shipping_line, vessel, incoterms, notes)
    values (v_po, nullif(btrim(coalesce(p_header->>'container_no', '')), ''), nullif(btrim(coalesce(p_header->>'bl_no', '')), ''),
            nullif(btrim(coalesce(p_header->>'port_loading', '')), ''), nullif(btrim(coalesce(p_header->>'port_discharge', '')), ''), v_etd, v_eta,
            nullif(btrim(coalesce(p_header->>'shipping_line', '')), ''), nullif(btrim(coalesce(p_header->>'vessel', '')), ''), v_inco,
            nullif(btrim(coalesce(p_header->>'notes', '')), ''))
    returning id, shipment_no into v_id, v_no;
    insert into public.import_shipment_events (shipment_id, status, event_date) values (v_id, 'BOOKED', (now() at time zone 'Asia/Kolkata')::date);
  else
    update public.import_shipments set
      container_no = nullif(btrim(coalesce(p_header->>'container_no', '')), ''), bl_no = nullif(btrim(coalesce(p_header->>'bl_no', '')), ''),
      port_loading = nullif(btrim(coalesce(p_header->>'port_loading', '')), ''), port_discharge = nullif(btrim(coalesce(p_header->>'port_discharge', '')), ''),
      etd = v_etd, eta = v_eta, shipping_line = nullif(btrim(coalesce(p_header->>'shipping_line', '')), ''),
      vessel = nullif(btrim(coalesce(p_header->>'vessel', '')), ''), incoterms = v_inco, notes = nullif(btrim(coalesce(p_header->>'notes', '')), ''),
      updated_by = auth.uid()
     where id = p_id returning id, shipment_no into v_id, v_no;
    delete from public.import_shipment_lines where shipment_id = v_id;
  end if;
  insert into public.import_shipment_lines (shipment_id, po_line_id, quantity)
    select v_id, t.po_line_id, t.quantity from jsonb_to_recordset(p_lines) as t(po_line_id bigint, quantity numeric);
  return jsonb_build_object('id', v_id, 'shipment_no', v_no);
end $$;
revoke execute on function public.save_import_shipment(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_import_shipment(uuid, jsonb, jsonb) to authenticated;

-- ---------- status ----------
-- Moves forward only (steps may be skipped, e.g. by air). Cancelled is possible until Delivered. Delivered and Cancelled are final.
create or replace function public.set_import_shipment_status(p_id uuid, p_status text, p_date date, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old text; v_loc uuid;
  v_order text[] := array['BOOKED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS', 'DELIVERED'];
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if not public.has_permission('shipments.manage') then
    raise exception 'missing permission: shipments.manage' using errcode = '42501';
  end if;
  select s.status, o.location_id into v_old, v_loc
    from public.import_shipments s join public.purchase_orders o on o.id = s.po_id where s.id = p_id for update of s;
  if not found then raise exception 'Shipment not found'; end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS', 'DELIVERED', 'CANCELLED') then raise exception 'Choose a status'; end if;
  if v_old in ('DELIVERED', 'CANCELLED') then raise exception 'A % shipment cannot change any more', lower(v_old); end if;
  if p_status <> 'CANCELLED' and array_position(v_order, p_status) <= array_position(v_order, v_old) then
    raise exception 'The shipment is already past this step';
  end if;
  if p_date is null or p_date > v_today + 1 then raise exception 'Choose a date that is not in the future'; end if;
  update public.import_shipments set status = p_status, updated_by = auth.uid() where id = p_id;
  insert into public.import_shipment_events (shipment_id, status, event_date, note) values (p_id, p_status, p_date, nullif(btrim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function public.set_import_shipment_status(uuid, text, date, text) from public, anon;
grant execute on function public.set_import_shipment_status(uuid, text, date, text) to authenticated;

-- ---------- charges ----------
create or replace function public.add_import_shipment_charge(p_id uuid, p_type text, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_loc uuid; v_status text;
begin
  if not (public.has_permission('shipments.manage') and public.has_permission('receipts.cost')) then
    raise exception 'missing permission: shipments.manage and receipts.cost' using errcode = '42501';
  end if;
  select s.status, o.location_id into v_status, v_loc from public.import_shipments s join public.purchase_orders o on o.id = s.po_id where s.id = p_id;
  if not found then raise exception 'Shipment not found'; end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  if v_status = 'CANCELLED' then raise exception 'A cancelled shipment cannot get charges'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 99999999999 then raise exception 'Amount is not valid'; end if;
  insert into public.import_shipment_charges (shipment_id, charge_type, amount, note)
    values (p_id, upper(coalesce(p_type, '')), p_amount, nullif(btrim(coalesce(p_note, '')), ''));
end $$;
revoke execute on function public.add_import_shipment_charge(uuid, text, numeric, text) from public, anon;
grant execute on function public.add_import_shipment_charge(uuid, text, numeric, text) to authenticated;

create or replace function public.remove_import_shipment_charge(p_charge_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_loc uuid;
begin
  if not (public.has_permission('shipments.manage') and public.has_permission('receipts.cost')) then
    raise exception 'missing permission: shipments.manage and receipts.cost' using errcode = '42501';
  end if;
  select o.location_id into v_loc from public.import_shipment_charges c join public.import_shipments s on s.id = c.shipment_id
    join public.purchase_orders o on o.id = s.po_id where c.id = p_charge_id;
  if not found then raise exception 'Charge not found'; end if;
  if not public.can_access_location(v_loc) then raise exception 'you do not work in this location' using errcode = '42501'; end if;
  delete from public.import_shipment_charges where id = p_charge_id;
end $$;
revoke execute on function public.remove_import_shipment_charge(bigint) from public, anon;
grant execute on function public.remove_import_shipment_charge(bigint) to authenticated;

-- ---------- the screen ----------
-- One call: a page of shipments, the top numbers and the lists for the filters. Runs as the caller (row rules apply).
-- p_status: all | BOOKED | DISPATCHED | IN_TRANSIT | ARRIVED | CUSTOMS | DELIVERED | CANCELLED | DELAYED
create or replace function public.import_shipments_page(
  p_q text default null, p_supplier uuid default null, p_status text default null,
  p_pol text default null, p_pod text default null, p_limit int default 10, p_offset int default 0
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
  if not (public.has_permission('shipments.view') or public.has_permission('shipments.manage')) then
    raise exception 'You do not have permission to see import shipments' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'BOOKED', 'DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'CUSTOMS', 'DELIVERED', 'CANCELLED', 'DELAYED') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select s.id, s.shipment_no, s.container_no, s.bl_no, s.port_loading, s.port_discharge, s.etd, s.eta, s.status, s.created_at,
           (s.status not in ('DELIVERED', 'CANCELLED') and s.eta is not null and s.eta < v_today) as delayed,
           o.id as po_id, o.po_no, sup.id as supplier_id, sup.name as supplier_name, sup.country as supplier_country,
           coalesce(t.items, 0) as items,
           case when v_cost then coalesce(t.value, 0) end as value
      from public.import_shipments s
      join public.purchase_orders o on o.id = s.po_id
      join public.suppliers sup on sup.id = o.supplier_id
      left join (select sl.shipment_id, count(*) as items, sum(sl.quantity * coalesce(c.unit_cost, 0)) as value
                   from public.import_shipment_lines sl left join public.purchase_order_costs c on c.line_id = sl.po_line_id
                  group by sl.shipment_id) t on t.shipment_id = s.id
  ),
  filtered as (
    select b.* from base b
     where (p_supplier is null or b.supplier_id = p_supplier)
       and (coalesce(p_status, '') in ('', 'all') or (p_status = 'DELAYED' and b.delayed) or (p_status <> 'DELAYED' and b.status = p_status))
       and (coalesce(p_pol, '') = '' or b.port_loading = p_pol)
       and (coalesce(p_pod, '') = '' or b.port_discharge = p_pod)
       and (coalesce(p_q, '') = '' or b.shipment_no ilike v_like or b.po_no ilike v_like or b.supplier_name ilike v_like
            or b.container_no ilike v_like or b.bl_no ilike v_like or b.port_loading ilike v_like or b.port_discharge ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
               from (select * from filtered order by created_at desc, shipment_no desc limit v_limit offset v_offset) t),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers where is_active and supplier_type = 'IMPORT'),
    'ports_loading', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from (select distinct port_loading as p from base where port_loading is not null) x),
    'ports_discharge', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from (select distinct port_discharge as p from base where port_discharge is not null) x),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'in_transit', (select count(*) from base where status in ('DISPATCHED', 'IN_TRANSIT')),
      'arrived', (select count(*) from base where status = 'ARRIVED'),
      'customs', (select count(*) from base where status = 'CUSTOMS'),
      'delivered', (select count(*) from base where status = 'DELIVERED'),
      'delayed', (select count(*) from base where delayed),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.import_shipments_page(text, uuid, text, text, text, int, int) from public, anon;
grant execute on function public.import_shipments_page(text, uuid, text, text, text, int, int) to authenticated;
