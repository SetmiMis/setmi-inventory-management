-- Inventory Reports screen (owner's mock): one call that returns the top numbers, the charts and the rows of one tab:
--   current (all stock lines) | low | out | slow | fast | ageing | movement | location (one line per place).
-- A stock line = one product in one place (same lines and same status rules as Current Stock). Status: OUT (quantity 0 or less), LOW (below the minimum level),
-- OVER (above the maximum level), IN (the rest).
-- Reserved = quantity on sales orders that are Confirmed or In Packing and not dispatched yet, in that place. It is only information: orders do not reserve stock
-- (stock leaves at Dispatch). Available = quantity - reserved. A person who may not see sales orders sees 0 reserved.
-- Slow moving: quantity in stock and LESS THAN 5 sold (SALE movements) in the date range. Fast moving: at least 1 sold in the range, most sold first.
-- The date range (default the last 30 days) is used for sold quantities and for the movement tab.
-- Ageing: days since stock last CAME INTO that place (any movement into it: receipt, transfer in, return, opening, adjustment up). Buckets 0-30, 31-60, 61-90, 91+.
-- Average cost and stock value follow Current Stock (average of POSTED goods receipts, only with receipts.cost; otherwise null).
-- Stock In / Out of the movement chart and tab are per place like the Stock Ledger (a transfer is Out of one place and In to another). Transit places are left out.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which places, products and prices are visible. Stock never changes here.
create or replace function public.inventory_report(
  p_tab text default 'current',     -- current | low | out | slow | fast | ageing | movement | location
  p_q text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_status text default null,       -- all | IN | LOW | OUT | OVER   (current tab only)
  p_type text default null,         -- all | OPENING | RECEIPT | SALE | SALE_RETURN | TRANSFER | TRANSFER_SHORTAGE | ADJUSTMENT | STOCK_IN | STOCK_OUT   (movement tab only)
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
  v_from date := coalesce(p_from, (now() at time zone 'Asia/Kolkata')::date - 29);
  v_to date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
  v_result jsonb;
begin
  if not public.has_permission('stock.view') then
    raise exception 'You do not have permission to see stock' using errcode = '42501';
  end if;
  if p_tab is null or p_tab not in ('current', 'low', 'out', 'slow', 'fast', 'ageing', 'movement', 'location') then
    raise exception 'Unknown report tab' using errcode = 'P0001';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'IN', 'LOW', 'OUT', 'OVER') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  if p_type is not null and p_type not in ('', 'all', 'OPENING', 'RECEIPT', 'SALE', 'SALE_RETURN', 'TRANSFER', 'TRANSFER_SHORTAGE', 'ADJUSTMENT', 'STOCK_IN', 'STOCK_OUT') then raise exception 'Unknown type filter' using errcode = 'P0001'; end if;
  if v_to < v_from then raise exception 'The end date is before the start date' using errcode = 'P0001'; end if;
  if v_to - v_from > 3660 then raise exception 'The date range is too long' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with avgc as (
    select gl.item_id, sum(gl.quantity * gc.unit_cost) / nullif(sum(gl.quantity), 0) as avg_cost
      from public.goods_receipt_lines gl
      join public.goods_receipts r on r.id = gl.receipt_id and r.status = 'POSTED'
      join public.goods_receipt_costs gc on gc.line_id = gl.id
     where v_cost
     group by gl.item_id
  ),
  places as (select id, name from public.locations where is_active and type <> 'TRANSIT'),
  lines as (   -- every movement as a +/- line of one place (transit places left out)
    select m.id, m.created_at, m.movement_type::text as typ, m.reference, m.reason, m.created_by, m.item_id, m.to_location_id as location_id, m.quantity as delta
      from public.stock_movements m where m.to_location_id is not null
    union all
    select m.id, m.created_at, m.movement_type::text, m.reference, m.reason, m.created_by, m.item_id, m.from_location_id, -m.quantity
      from public.stock_movements m where m.from_location_id is not null
  ),
  mv as (
    select ln.*, pl.name as place_name, i.internal_item_code as code, i.item_name, i.unit, i.category_id, (ln.created_at at time zone 'Asia/Kolkata')::date as day
      from lines ln join places pl on pl.id = ln.location_id join public.items i on i.id = ln.item_id
  ),
  sold as (
    select item_id, location_id, sum(-delta) as qty, max(created_at) as last_sale
      from mv where typ = 'SALE' and day between v_from and v_to group by item_id, location_id
  ),
  lastsale as (select item_id, location_id, max(created_at) as last_sale from mv where typ = 'SALE' group by item_id, location_id),
  lastin as (select item_id, location_id, max(created_at) as last_in from mv where delta > 0 group by item_id, location_id),
  lastmove as (select item_id, location_id, max(created_at) as last_move from mv group by item_id, location_id),
  resv as (
    select o.location_id, sl.item_id, sum(sl.quantity) as qty
      from public.sales_orders o join public.sales_order_lines sl on sl.order_id = o.id
     where o.status in ('CONFIRMED', 'IN_PACKING') group by o.location_id, sl.item_id
  ),
  base as (
    select i.id as item_id, i.internal_item_code as code, i.item_name, i.unit,
           c.id as category_id, c.name as category_name, l.id as location_id, l.name as place_name,
           coalesce(b.quantity, 0) as qty, rl.min_qty, rl.max_qty,
           (select sb.code from public.item_bins ib join public.storage_bins sb on sb.id = ib.bin_id
             where ib.item_id = i.id and ib.location_id = l.id order by sb.code limit 1) as rack,
           a.avg_cost,
           case when a.avg_cost is not null then coalesce(b.quantity, 0) * a.avg_cost end as value,
           coalesce(rv.qty, 0) as reserved,
           coalesce(b.quantity, 0) - coalesce(rv.qty, 0) as available,
           case when coalesce(b.quantity, 0) <= 0 then 'OUT'
                when rl.min_qty is not null and rl.min_qty > 0 and coalesce(b.quantity, 0) < rl.min_qty then 'LOW'
                when rl.max_qty is not null and coalesce(b.quantity, 0) > rl.max_qty then 'OVER'
                else 'IN' end as status,
           coalesce(sd.qty, 0) as sold_qty, ls.last_sale, li.last_in, lm.last_move,
           case when li.last_in is not null then v_today - (li.last_in at time zone 'Asia/Kolkata')::date end as age_days
      from public.items i
      join places l on true
      left join public.categories c on c.id = i.category_id
      left join public.stock_balances b on b.item_id = i.id and b.location_id = l.id
      left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = l.id
      left join avgc a on a.item_id = i.id
      left join resv rv on rv.item_id = i.id and rv.location_id = l.id
      left join sold sd on sd.item_id = i.id and sd.location_id = l.id
      left join lastsale ls on ls.item_id = i.id and ls.location_id = l.id
      left join lastin li on li.item_id = i.id and li.location_id = l.id
      left join lastmove lm on lm.item_id = i.id and lm.location_id = l.id
     where i.is_active and (b.item_id is not null or rl.item_id is not null)
  ),
  scoped as (   -- the category and place choice apply to the numbers and charts
    select * from base where (p_category is null or category_id = p_category) and (p_location is null or location_id = p_location)
  ),
  searched as (
    select s.* from scoped s
     where coalesce(p_q, '') = '' or s.code ilike v_like or s.item_name ilike v_like or s.category_name ilike v_like or s.place_name ilike v_like or s.rack ilike v_like
        or exists (select 1 from public.item_barcodes bc where bc.item_id = s.item_id and bc.barcode ilike v_like)
  ),
  tabrows as (
    select s.* from searched s
     where case p_tab
             when 'current' then (coalesce(p_status, '') in ('', 'all') or s.status = p_status)
             when 'low' then s.status = 'LOW'
             when 'out' then s.status = 'OUT'
             when 'slow' then s.qty > 0 and s.sold_qty < 5
             when 'fast' then s.sold_qty >= 1
             when 'ageing' then s.qty > 0
             else false end
  ),
  mvrows as (
    select m.* from mv m
     where p_tab = 'movement' and m.day between v_from and v_to
       and (p_category is null or m.category_id = p_category) and (p_location is null or m.location_id = p_location)
       and (coalesce(p_type, '') in ('', 'all') or m.typ = p_type)
       and (coalesce(p_q, '') = '' or m.code ilike v_like or m.item_name ilike v_like or m.place_name ilike v_like or coalesce(m.reference, '') ilike v_like)
  ),
  locrows as (
    select pl.id as location_id, pl.name as place_name, count(distinct s.item_id) as items, coalesce(sum(s.qty), 0) as qty,
           case when v_cost then coalesce(sum(s.value), 0) end as value,
           count(*) filter (where s.status = 'LOW') as low, count(*) filter (where s.status = 'OUT') as out
      from places pl left join scoped s on s.location_id = pl.id
     where p_tab = 'location' and (p_location is null or pl.id = p_location)
     group by pl.id, pl.name
  ),
  chartmv as (
    select m.day, sum(m.delta) filter (where m.delta > 0) as qty_in, sum(-m.delta) filter (where m.delta < 0) as qty_out
      from mv m where m.day >= v_today - 29 and (p_category is null or m.category_id = p_category) and (p_location is null or m.location_id = p_location)
     group by m.day
  )
  select jsonb_build_object(
    'tab', p_tab,
    'total', case p_tab when 'movement' then (select count(*) from mvrows) when 'location' then (select count(*) from locrows) else (select count(*) from tabrows) end,
    'rows', case p_tab
      when 'movement' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id, created_at, typ, reference, reason, code, item_name, unit, place_name, delta, public.person_name(created_by) as by_name
                                                                                       from mvrows order by created_at desc, id desc limit v_limit offset v_offset) t)
      when 'location' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select * from locrows order by place_name limit v_limit offset v_offset) t)
      else (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
              from (select item_id, code, item_name, category_name, unit, place_name, rack, qty, reserved, available, min_qty, max_qty, avg_cost, value, status, sold_qty, last_sale, last_in, last_move, age_days
                      from tabrows
                     order by case p_tab when 'fast' then -sold_qty when 'slow' then sold_qty when 'ageing' then -coalesce(age_days, 0) else 0 end, code, place_name
                     limit v_limit offset v_offset) t) end,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.categories),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from places),
    'kpi', jsonb_build_object(
      'items', (select count(distinct item_id) from scoped),
      'qty', (select coalesce(sum(qty), 0) from scoped),
      'value', (select case when v_cost then coalesce(sum(value), 0) end from scoped),
      'low', (select count(*) from scoped where status = 'LOW'),
      'out', (select count(*) from scoped where status = 'OUT'),
      'slow', (select count(*) from scoped where qty > 0 and sold_qty < 5)),
    'value_by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', v) order by v desc), '[]'::jsonb)
                            from (select coalesce(category_name, 'No category') as name, case when v_cost then coalesce(sum(value), 0) else coalesce(sum(qty), 0) end as v from scoped group by 1) x where v > 0),
    'qty_by_place', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', q) order by q desc), '[]'::jsonb) from (select place_name as name, sum(qty) as q from scoped group by place_name) x where q > 0),
    'movement_trend', (select coalesce(jsonb_agg(jsonb_build_object('day', g.d, 'in', coalesce(c.qty_in, 0), 'out', coalesce(c.qty_out, 0)) order by g.d), '[]'::jsonb)
                         from generate_series(v_today - 29, v_today, interval '1 day') as gs(d0), lateral (select gs.d0::date as d) g left join chartmv c on c.day = g.d),
    'status_dist', jsonb_build_object(
      'out', (select count(*) from scoped where status = 'OUT'),
      'low', (select count(*) from scoped where status = 'LOW'),
      'slow', (select count(*) from scoped where status in ('IN', 'OVER') and qty > 0 and sold_qty < 5),
      'in', (select count(*) from scoped where status in ('IN', 'OVER') and not (qty > 0 and sold_qty < 5)),
      'inactive', (select count(*) from public.items i where not i.is_active and exists (select 1 from public.stock_balances b where b.item_id = i.id and b.quantity > 0))),
    'top_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                    from (select code, item_name, sum(qty) as qty, case when v_cost then sum(value) end as value from scoped group by item_id, code, item_name
                           having sum(qty) > 0 order by case when v_cost then sum(value) end desc nulls last, sum(qty) desc limit 5) t),
    'low_top', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                  from (select code, item_name, place_name, qty, min_qty from scoped where status = 'LOW' order by (min_qty - qty) desc, code limit 5) t),
    'recent', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                 from (select m.created_at, m.code, m.typ, m.delta, public.person_name(m.created_by) as by_name from mv m
                        where (p_location is null or m.location_id = p_location) order by m.created_at desc, m.id desc limit 5) t))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.inventory_report(text, text, uuid, uuid, text, text, date, date, int, int) from public, anon;
grant execute on function public.inventory_report(text, text, uuid, uuid, text, text, date, date, int, int) to authenticated;
