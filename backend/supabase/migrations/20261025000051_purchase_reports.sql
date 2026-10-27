-- Purchase Reports screen (owner's mock): one call with the top numbers, the charts and the rows of one tab:
--   orders | grn | pending | supplier | category | item | monthly | comparative.
-- A "placed" order is a purchase order that is SENT, PARTIAL or COMPLETED (a DRAFT is not placed yet, a CANCELLED one does not count).
-- Total purchase value, supplier / category / item / monthly tabs and the charts use PLACED orders only. The Purchase Orders tab lists every order.
-- Order value = ordered quantity x the buying price written on the order (needs receipts.cost, like the Purchase Orders page; otherwise all money is null).
-- Received (per order) = received quantity x the order price. "Received Value (GRN)" on the card is different: the real value of POSTED goods receipts
-- (quantity x the cost on the receipt) inside the date range. Pending value = (ordered - received) x order price of orders that are SENT or PARTIAL.
-- Active suppliers = suppliers that got at least one order in the range. Category of an order = the category with the biggest value on it.
-- Filters: supplier, place, category (works on order LINES, so the order value shows only that category), date range (order date; receipt date for the GRN tab),
-- search (order no, supplier, item code or name), status (DRAFT | SENT | PARTIAL | COMPLETED | CANCELLED | OVERDUE).
-- Comparative: the date range (default: this month so far) against the period of the same length just before it.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which orders, places and prices are visible. Nothing is changed here.
create or replace function public.purchase_report(
  p_tab text default 'orders',      -- orders | grn | pending | supplier | category | item | monthly | comparative
  p_q text default null,
  p_supplier uuid default null,
  p_category uuid default null,
  p_status text default null,
  p_location uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_cost boolean := public.has_permission('receipts.cost');
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_cfrom date := coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date);
  v_cto date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
  v_pto date;
  v_pfrom date;
  v_result jsonb;
begin
  if not (public.has_permission('purchase.view') or public.has_permission('purchase.create') or public.has_permission('purchase.approve')) then
    raise exception 'You do not have permission to see purchase orders' using errcode = '42501';
  end if;
  if p_tab is null or p_tab not in ('orders', 'grn', 'pending', 'supplier', 'category', 'item', 'monthly', 'comparative') then raise exception 'Unknown report tab' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'DRAFT', 'SENT', 'PARTIAL', 'COMPLETED', 'CANCELLED', 'OVERDUE') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  if p_from is not null and p_to is not null and p_to < p_from then raise exception 'The end date is before the start date' using errcode = 'P0001'; end if;
  if v_cto < v_cfrom then raise exception 'The end date is before the start date' using errcode = 'P0001'; end if;
  if v_cto - v_cfrom > 3660 then raise exception 'The date range is too long' using errcode = 'P0001'; end if;
  v_pto := v_cfrom - 1;
  v_pfrom := v_pto - (v_cto - v_cfrom);
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with pol as (   -- every order line with its order, supplier, place, item and category
    select pl.id as line_id, o.id as po_id, o.po_no, o.order_date, o.expected_date, o.status::text as status, o.created_at, o.sent_at, o.created_by, o.sent_by,
           s.id as sid, s.name as sname, l.id as lid, l.name as lname,
           i.id as item_id, i.internal_item_code as code, i.item_name, i.unit, c.id as category_id, coalesce(c.name, 'No category') as category_name,
           pl.quantity as qty, pl.received_qty as recv, case when v_cost then coalesce(pc.unit_cost, 0) end as cost,
           (o.status in ('SENT', 'PARTIAL') and o.expected_date is not null and o.expected_date < v_today) as overdue
      from public.purchase_order_lines pl
      join public.purchase_orders o on o.id = pl.po_id
      join public.suppliers s on s.id = o.supplier_id
      join public.locations l on l.id = o.location_id
      join public.items i on i.id = pl.item_id
      left join public.categories c on c.id = i.category_id
      left join public.purchase_order_costs pc on pc.line_id = pl.id
  ),
  polx as (   -- the filters except the date range
    select p.* from pol p
     where (p_supplier is null or p.sid = p_supplier) and (p_location is null or p.lid = p_location) and (p_category is null or p.category_id = p_category)
       and (coalesce(p_q, '') = '' or p.po_no ilike v_like or p.sname ilike v_like
            or exists (select 1 from pol x where x.po_id = p.po_id and (x.code ilike v_like or x.item_name ilike v_like)))
  ),
  polf as (
    select p.* from polx p where (p_from is null or p.order_date >= p_from) and (p_to is null or p.order_date <= p_to)
  ),
  po as (
    select po_id, po_no, order_date, expected_date, status, created_at, sid, sname, lname, bool_or(overdue) as overdue, count(*) as items, sum(qty) as qty, sum(recv) as recv_qty,
           case when v_cost then sum(qty * cost) end as value, case when v_cost then sum(recv * cost) end as received_value,
           case when v_cost and status in ('SENT', 'PARTIAL') then sum(greatest(qty - recv, 0) * cost) when status in ('SENT', 'PARTIAL') then null else 0 end as pending_value,
           (array_agg(category_name order by qty * coalesce(cost, 0) desc, category_name))[1] as category_name
      from polf group by po_id, po_no, order_date, expected_date, status, created_at, sid, sname, lname
  ),
  pof as (
    select * from po
     where coalesce(p_status, '') in ('', 'all') or (p_status = 'OVERDUE' and overdue) or (p_status <> 'OVERDUE' and status = p_status)
  ),
  placed as (select * from pof where status in ('SENT', 'PARTIAL', 'COMPLETED')),
  placedl as (select l.* from polf l join placed pp on pp.po_id = l.po_id),
  grnl as (   -- lines of POSTED goods receipts with the cost on the receipt
    select r.id as rid, r.receipt_no, r.receipt_date, r.supplier_invoice_no, r.posted_at, r.posted_by, s.id as sid, s.name as sname, l.id as lid, l.name as lname,
           i.internal_item_code as code, i.item_name, c.id as category_id, gl.quantity as qty, case when v_cost then coalesce(gc.unit_cost, 0) end as cost
      from public.goods_receipt_lines gl
      join public.goods_receipts r on r.id = gl.receipt_id and r.status = 'POSTED'
      join public.suppliers s on s.id = r.supplier_id
      join public.locations l on l.id = r.location_id
      join public.items i on i.id = gl.item_id
      left join public.categories c on c.id = i.category_id
      left join public.goods_receipt_costs gc on gc.line_id = gl.id
     where (p_supplier is null or s.id = p_supplier) and (p_location is null or l.id = p_location) and (p_category is null or c.id = p_category)
       and (p_from is null or r.receipt_date >= p_from) and (p_to is null or r.receipt_date <= p_to)
       and (coalesce(p_q, '') = '' or r.receipt_no ilike v_like or s.name ilike v_like or coalesce(r.supplier_invoice_no, '') ilike v_like or i.internal_item_code ilike v_like or i.item_name ilike v_like)
  ),
  grn as (
    select rid, receipt_no, receipt_date, supplier_invoice_no, sid, sname, lname, count(*) as items, sum(qty) as qty, case when v_cost then sum(qty * cost) end as value
      from grnl group by rid, receipt_no, receipt_date, supplier_invoice_no, sid, sname, lname
  ),
  months as (
    select to_char(m, 'YYYY-MM') as ym, m::date as first_day from generate_series(date_trunc('month', v_today::timestamp) - interval '5 months', date_trunc('month', v_today::timestamp), interval '1 month') m
  ),
  trend as (   -- last 6 months (the choices except the date range) of placed orders
    select mo.ym, mo.first_day,
           count(distinct x.po_id) as pos, case when v_cost then coalesce(sum(x.qty * x.cost), 0) end as value
      from months mo left join polx x on to_char(x.order_date, 'YYYY-MM') = mo.ym and x.status in ('SENT', 'PARTIAL', 'COMPLETED')
     group by mo.ym, mo.first_day
  ),
  cmp as (   -- comparative: this period and the one before it
    select 'cur' as per, x.* from polx x where x.order_date between v_cfrom and v_cto and x.status in ('SENT', 'PARTIAL', 'COMPLETED')
    union all
    select 'prev', x.* from polx x where x.order_date between v_pfrom and v_pto and x.status in ('SENT', 'PARTIAL', 'COMPLETED')
  ),
  cmpm as (
    select per, count(distinct po_id) as pos, count(distinct sid) as sup, coalesce(sum(qty), 0) as qty,
           case when v_cost then coalesce(sum(qty * cost), 0) end as value, case when v_cost then coalesce(sum(recv * cost), 0) end as received_value
      from cmp group by per
  )
  select jsonb_build_object(
    'tab', p_tab,
    'total', case p_tab
      when 'orders' then (select count(*) from pof) when 'grn' then (select count(*) from grn) when 'pending' then (select count(*) from pof where status in ('SENT', 'PARTIAL'))
      when 'supplier' then (select count(distinct sid) from placed) when 'category' then (select count(distinct category_name) from placedl)
      when 'item' then (select count(distinct item_id) from placedl) when 'monthly' then (select count(distinct to_char(order_date, 'YYYY-MM')) from placed) else 6 end,
    'rows', case p_tab
      when 'orders' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select po_id, po_no, order_date, expected_date, status, overdue, sname, category_name, items, qty, value, received_value, pending_value
                                                                                       from pof order by order_date desc, po_no desc limit v_limit offset v_offset) t)
      when 'grn' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select receipt_no, receipt_date, supplier_invoice_no, sname, lname, items, qty, value from grn order by receipt_date desc, receipt_no desc limit v_limit offset v_offset) t)
      when 'pending' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select po_id, po_no, order_date, expected_date, status, overdue, sname, items, qty, recv_qty, value, pending_value,
                                                                                         case when expected_date is not null then v_today - expected_date end as days_late
                                                                                         from pof where status in ('SENT', 'PARTIAL') order by expected_date nulls last, po_no limit v_limit offset v_offset) t)
      when 'supplier' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select sid as supplier_id, sname, count(*) as pos, sum(items) as items, sum(qty) as qty, sum(value) as value, sum(received_value) as received_value, sum(pending_value) as pending_value
                                                                                         from placed group by sid, sname order by sum(value) desc nulls last, sname limit v_limit offset v_offset) t)
      when 'category' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select category_name, count(distinct po_id) as pos, count(distinct item_id) as items, sum(qty) as qty, sum(recv) as recv_qty,
                                                                                           case when v_cost then sum(qty * cost) end as value, case when v_cost then sum(recv * cost) end as received_value
                                                                                           from placedl group by category_name order by case when v_cost then sum(qty * cost) end desc nulls last, category_name limit v_limit offset v_offset) t)
      when 'item' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select code, item_name, category_name, unit, count(distinct po_id) as pos, sum(qty) as qty, sum(recv) as recv_qty,
                                                                                       case when v_cost then sum(qty * cost) end as value, case when v_cost and sum(qty) > 0 then sum(qty * cost) / sum(qty) end as avg_rate
                                                                                       from placedl group by item_id, code, item_name, category_name, unit order by case when v_cost then sum(qty * cost) end desc nulls last, code limit v_limit offset v_offset) t)
      when 'monthly' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select to_char(order_date, 'YYYY-MM') as month, count(*) as pos, count(distinct sid) as suppliers, sum(qty) as qty, sum(value) as value, sum(received_value) as received_value
                                                                                        from placed group by 1 order by 1 desc limit v_limit offset v_offset) t)
      else (select coalesce(jsonb_agg(jsonb_build_object('metric', m.metric, 'current', m.cur, 'previous', m.prev) order by m.ord), '[]'::jsonb)
              from (select 1 as ord, 'Purchase orders' as metric, (select pos from cmpm where per = 'cur') as cur, (select pos from cmpm where per = 'prev') as prev
                    union all select 2, 'Purchase value', (select value from cmpm where per = 'cur'), (select value from cmpm where per = 'prev')
                    union all select 3, 'Received value (at order price)', (select received_value from cmpm where per = 'cur'), (select received_value from cmpm where per = 'prev')
                    union all select 4, 'Quantity ordered', (select qty from cmpm where per = 'cur'), (select qty from cmpm where per = 'prev')
                    union all select 5, 'Active suppliers', (select sup from cmpm where per = 'cur'), (select sup from cmpm where per = 'prev')
                    union all select 6, 'Average order value', (select case when pos > 0 then value / pos end from cmpm where per = 'cur'), (select case when pos > 0 then value / pos end from cmpm where per = 'prev')) m) end,
    'compare_range', jsonb_build_object('cur_from', v_cfrom, 'cur_to', v_cto, 'prev_from', v_pfrom, 'prev_to', v_pto),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.categories),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'pos', (select count(*) from pof),
      'value', (select case when v_cost then coalesce(sum(value), 0) end from placed),
      'received', (select case when v_cost then coalesce(sum(value), 0) end from grn),
      'pending', (select case when v_cost then coalesce(sum(pending_value), 0) end from pof where status in ('SENT', 'PARTIAL')),
      'avg', (select case when v_cost and count(*) > 0 then sum(value) / count(*) end from placed),
      'suppliers', (select count(distinct sid) from pof)),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', ym, 'pos', pos, 'value', value) order by ym), '[]'::jsonb) from trend),
    'top_suppliers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select sname as name, case when v_cost then sum(value) else sum(qty) end as value from placed group by sid, sname order by 2 desc nulls last limit 5) t),
    'categories_value', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', v) order by v desc), '[]'::jsonb)
                           from (select category_name as name, case when v_cost then coalesce(sum(qty * cost), 0) else sum(qty) end as v from placedl group by category_name) x where v > 0),
    'status_dist', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) as n from pof group by status) x),
    'top_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select code, item_name, sum(qty) as qty, case when v_cost then sum(qty * cost) end as value
                                                                               from placedl group by item_id, code, item_name order by case when v_cost then sum(qty * cost) end desc nulls last, sum(qty) desc limit 5) t),
    'recent', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
                 select at, po_no, activity, public.person_name(by_user) as by_name from (
                   select o.created_at as at, o.po_no, 'PO Created' as activity, o.created_by as by_user from public.purchase_orders o
                   union all select o.sent_at, o.po_no, 'PO Sent', o.sent_by from public.purchase_orders o where o.sent_at is not null
                   union all select r.posted_at, r.receipt_no, 'GRN Completed', r.posted_by from public.goods_receipts r where r.status = 'POSTED' and r.posted_at is not null
                 ) e order by at desc limit 5) t))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.purchase_report(text, text, uuid, uuid, text, uuid, date, date, int, int) from public, anon;
grant execute on function public.purchase_report(text, text, uuid, uuid, text, uuid, date, date, int, int) to authenticated;
