-- Stock Valuation screen (owner's mock): one call with the top numbers, the charts and the rows of one tab:
--   sku | category | warehouse | supplier | ageing | movers | low | out.
-- Method: AVERAGE COST only (owner's choice): average cost of a product = weighted average of the buying prices of POSTED goods receipts (same rule as Current Stock),
-- stock value = quantity x average cost. No FIFO and no "as on a past date" (those need cost layers the system does not keep). A product without any priced receipt has no value.
-- The page needs BOTH stock.view and receipts.cost (it is all about money). Stock never changes here.
-- A stock line = one product in one place (same lines and status words as Current Stock / Inventory Reports): OUT (0 or less), LOW (below the minimum level), OVER, IN.
-- Movement type: SLOW = stock in the place and less than 5 sold in the last 30 days; FAST = 10 or more sold in the last 30 days; NORMAL = the rest. (Sold = SALE movements.)
-- Age = days since stock last CAME INTO the place (any movement into it). Ageing groups: 0-30, 31-60, 61-90, 91-180, 181+ days.
-- Supplier of a product = supplier of its most recent POSTED goods receipt (any place).
-- Out of Stock Value = the value needed to refill: minimum level x average cost of the lines that are out of stock (their stock value is 0).
-- Low Stock Value = stock value of the lines below their minimum level. Fast / Slow Moving Stock Value = stock value of the lines of that movement type.
-- Status value chart: In Stock, Low Stock, Reserved (quantity on Confirmed / In Packing orders, value carved out of the in-stock part) and In Transit (stock on its way between places, not counted in the total).
-- Runs as the caller (SECURITY INVOKER): row-level security decides which places, products and prices are visible.
create or replace function public.stock_valuation(
  p_tab text default 'sku',          -- sku | category | warehouse | supplier | ageing | movers | low | out
  p_q text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_supplier uuid default null,
  p_status text default null,        -- all | IN | LOW | OUT | OVER   (sku tab only)
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
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not public.has_permission('stock.view') then raise exception 'You do not have permission to see stock' using errcode = '42501'; end if;
  if not public.has_permission('receipts.cost') then raise exception 'Stock valuation needs the permission to see buying prices' using errcode = '42501'; end if;
  if p_tab is null or p_tab not in ('sku', 'category', 'warehouse', 'supplier', 'ageing', 'movers', 'low', 'out') then raise exception 'Unknown report tab' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('', 'all', 'IN', 'LOW', 'OUT', 'OVER') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with avgc as (
    select gl.item_id, sum(gl.quantity * gc.unit_cost) / nullif(sum(gl.quantity), 0) as avg_cost
      from public.goods_receipt_lines gl
      join public.goods_receipts r on r.id = gl.receipt_id and r.status = 'POSTED'
      join public.goods_receipt_costs gc on gc.line_id = gl.id
     group by gl.item_id
  ),
  lastsup as (
    select distinct on (gl.item_id) gl.item_id, s.id as supplier_id, s.name as supplier_name
      from public.goods_receipt_lines gl
      join public.goods_receipts r on r.id = gl.receipt_id and r.status = 'POSTED'
      join public.suppliers s on s.id = r.supplier_id
     order by gl.item_id, r.receipt_date desc, r.posted_at desc nulls last, gl.id desc
  ),
  places as (select id, name from public.locations where is_active and type <> 'TRANSIT'),
  lines as (
    select m.id, m.created_at, m.movement_type::text as typ, m.created_by, m.item_id, m.to_location_id as location_id, m.quantity as delta from public.stock_movements m where m.to_location_id is not null
    union all
    select m.id, m.created_at, m.movement_type::text, m.created_by, m.item_id, m.from_location_id, -m.quantity from public.stock_movements m where m.from_location_id is not null
  ),
  mv as (select ln.*, pl.name as place_name from lines ln join places pl on pl.id = ln.location_id),
  sold as (select item_id, location_id, sum(-delta) as qty from mv where typ = 'SALE' and created_at >= now() - interval '30 days' group by item_id, location_id),
  lastin as (select item_id, location_id, max(created_at) as last_in from mv where delta > 0 group by item_id, location_id),
  lastmove as (select item_id, location_id, max(created_at) as last_move from mv group by item_id, location_id),
  resv as (
    select o.location_id, sl.item_id, sum(sl.quantity) as qty
      from public.sales_orders o join public.sales_order_lines sl on sl.order_id = o.id where o.status in ('CONFIRMED', 'IN_PACKING') group by o.location_id, sl.item_id
  ),
  base as (
    select i.id as item_id, i.internal_item_code as code, i.item_name, i.unit, c.id as category_id, coalesce(c.name, 'No category') as category_name,
           l.id as location_id, l.name as place_name, ls.supplier_id, ls.supplier_name,
           coalesce(b.quantity, 0) as qty, rl.min_qty, a.avg_cost,
           case when a.avg_cost is not null then coalesce(b.quantity, 0) * a.avg_cost end as value,
           least(coalesce(rv.qty, 0), greatest(coalesce(b.quantity, 0), 0)) as reserved,
           case when coalesce(b.quantity, 0) <= 0 then 'OUT'
                when rl.min_qty is not null and rl.min_qty > 0 and coalesce(b.quantity, 0) < rl.min_qty then 'LOW'
                when rl.max_qty is not null and coalesce(b.quantity, 0) > rl.max_qty then 'OVER' else 'IN' end as status,
           case when coalesce(sd.qty, 0) >= 10 then 'FAST' when coalesce(b.quantity, 0) > 0 and coalesce(sd.qty, 0) < 5 then 'SLOW' else 'NORMAL' end as movement,
           lm.last_move, case when li.last_in is not null then v_today - (li.last_in at time zone 'Asia/Kolkata')::date end as age_days
      from public.items i
      join places l on true
      left join public.categories c on c.id = i.category_id
      left join public.stock_balances b on b.item_id = i.id and b.location_id = l.id
      left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = l.id
      left join avgc a on a.item_id = i.id
      left join lastsup ls on ls.item_id = i.id
      left join resv rv on rv.item_id = i.id and rv.location_id = l.id
      left join sold sd on sd.item_id = i.id and sd.location_id = l.id
      left join lastin li on li.item_id = i.id and li.location_id = l.id
      left join lastmove lm on lm.item_id = i.id and lm.location_id = l.id
     where i.is_active and (b.item_id is not null or rl.item_id is not null)
  ),
  scoped as (
    select * from base where (p_category is null or category_id = p_category) and (p_location is null or location_id = p_location) and (p_supplier is null or supplier_id = p_supplier)
  ),
  searched as (
    select s.* from scoped s
     where coalesce(p_q, '') = '' or s.code ilike v_like or s.item_name ilike v_like or s.category_name ilike v_like or s.place_name ilike v_like or coalesce(s.supplier_name, '') ilike v_like
        or exists (select 1 from public.item_barcodes bc where bc.item_id = s.item_id and bc.barcode ilike v_like)
  ),
  bucketed as (
    select s.*, case when age_days is null then 'Unknown' when age_days <= 30 then '0-30 days' when age_days <= 60 then '31-60 days' when age_days <= 90 then '61-90 days' when age_days <= 180 then '91-180 days' else '181+ days' end as bucket
      from searched s
  ),
  scopedb as (
    select s.*, case when age_days is null then 'Unknown' when age_days <= 30 then '0-30 days' when age_days <= 60 then '31-60 days' when age_days <= 90 then '61-90 days' when age_days <= 180 then '91-180 days' else '181+ days' end as bucket
      from scoped s
  ),
  transit as (
    select coalesce(sum(b.quantity * a.avg_cost), 0) as value
      from public.stock_balances b join public.locations l on l.id = b.location_id and l.type = 'TRANSIT' join avgc a on a.item_id = b.item_id where b.quantity > 0
  ),
  tabrows as (
    select s.* from bucketed s
     where case p_tab
             when 'sku' then (coalesce(p_status, '') in ('', 'all') or s.status = p_status)
             when 'movers' then s.movement in ('FAST', 'SLOW')
             when 'low' then s.status = 'LOW'
             when 'out' then s.status = 'OUT'
             else false end
  )
  select jsonb_build_object(
    'tab', p_tab,
    'total', case p_tab
      when 'category' then (select count(distinct category_name) from searched) when 'warehouse' then (select count(distinct location_id) from searched)
      when 'supplier' then (select count(distinct coalesce(supplier_name, 'No receipt yet')) from searched) when 'ageing' then (select count(distinct bucket) from bucketed where qty > 0)
      else (select count(*) from tabrows) end,
    'rows', case p_tab
      when 'category' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select category_name, count(distinct item_id) as items, sum(qty) as qty, coalesce(sum(value), 0) as value from searched group by category_name order by coalesce(sum(value), 0) desc, category_name limit v_limit offset v_offset) t)
      when 'warehouse' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select place_name, count(distinct item_id) as items, sum(qty) as qty, coalesce(sum(value), 0) as value from searched group by location_id, place_name order by coalesce(sum(value), 0) desc, place_name limit v_limit offset v_offset) t)
      when 'supplier' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select coalesce(supplier_name, 'No receipt yet') as supplier_name, count(distinct item_id) as items, sum(qty) as qty, coalesce(sum(value), 0) as value from searched group by supplier_name order by coalesce(sum(value), 0) desc, 1 limit v_limit offset v_offset) t)
      when 'ageing' then (select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) from (select bucket, case bucket when '0-30 days' then 1 when '31-60 days' then 2 when '61-90 days' then 3 when '91-180 days' then 4 when '181+ days' then 5 else 6 end as ord,
                                                                                                         count(*) as lines, sum(qty) as qty, coalesce(sum(value), 0) as value from bucketed where qty > 0 group by bucket) t)
      else (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
              from (select item_id, code, item_name, category_name, place_name, supplier_name, unit, qty, min_qty, avg_cost, value, status, movement, age_days, last_move,
                           case when status = 'OUT' and min_qty is not null and avg_cost is not null then min_qty * avg_cost end as refill_value
                      from tabrows order by case p_tab when 'low' then value when 'movers' then value else null end desc nulls last, code, place_name limit v_limit offset v_offset) t) end,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.categories),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from places),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers),
    'kpi', jsonb_build_object(
      'value', (select coalesce(sum(value), 0) from scoped), 'items', (select count(distinct item_id) from scoped),
      'fast', (select coalesce(sum(value), 0) from scoped where movement = 'FAST'), 'slow', (select coalesce(sum(value), 0) from scoped where movement = 'SLOW'),
      'low', (select coalesce(sum(value), 0) from scoped where status = 'LOW'),
      'out_refill', (select coalesce(sum(min_qty * avg_cost), 0) from scoped where status = 'OUT' and min_qty is not null and avg_cost is not null),
      'unpriced', (select count(*) from scoped where qty > 0 and avg_cost is null)),
    'value_by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', v) order by v desc), '[]'::jsonb) from (select category_name as name, coalesce(sum(value), 0) as v from scoped group by category_name) x where v > 0),
    'value_by_place', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', v) order by v desc), '[]'::jsonb) from (select place_name as name, coalesce(sum(value), 0) as v from scoped group by place_name) x where v > 0),
    'ageing_value', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'value', v) order by ord), '[]'::jsonb)
                       from (select bucket, case bucket when '0-30 days' then 1 when '31-60 days' then 2 when '61-90 days' then 3 when '91-180 days' then 4 when '181+ days' then 5 else 6 end as ord, coalesce(sum(value), 0) as v from scopedb where qty > 0 group by bucket) x where v > 0),
    'status_value', jsonb_build_object(
      'in_stock', (select coalesce(sum(value - reserved * avg_cost), 0) from scoped where status in ('IN', 'OVER') and avg_cost is not null),
      'low', (select coalesce(sum(value - reserved * avg_cost), 0) from scoped where status = 'LOW' and avg_cost is not null),
      'reserved', (select coalesce(sum(reserved * avg_cost), 0) from scoped where avg_cost is not null),
      'transit', (select value from transit)),
    'top_items', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select code, item_name, sum(qty) as qty, coalesce(sum(value), 0) as value from scoped group by item_id, code, item_name having coalesce(sum(value), 0) > 0 order by sum(value) desc, code limit 5) t),
    'low_top', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select code, item_name, place_name, qty, value from scoped where status = 'LOW' order by value desc nulls last, code limit 5) t),
    'recent', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                 from (select m.created_at, i.internal_item_code as code, i.item_name, m.typ, m.delta, case when a.avg_cost is not null then abs(m.delta) * a.avg_cost end as value, public.person_name(m.created_by) as by_name
                         from mv m join public.items i on i.id = m.item_id left join avgc a on a.item_id = m.item_id
                        where (p_location is null or m.location_id = p_location) order by m.created_at desc, m.id desc limit 5) t))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.stock_valuation(text, text, uuid, uuid, uuid, text, int, int) from public, anon;
grant execute on function public.stock_valuation(text, text, uuid, uuid, uuid, text, int, int) to authenticated;
