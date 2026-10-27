-- Current Stock screen (owner's mock): one call that returns a page of stock lines (one line = one product in one place) with
-- category, rack, quantity, min / max level, stock status, average cost and stock value, plus the top numbers and the filter lists.
-- A line exists when the product has a stock record or a min/max level in that place.
-- Status: Out of stock (quantity 0 or less), Low stock (below the minimum level), Over stocked (above the maximum level), else In stock.
-- Average cost = weighted average of the buying prices of POSTED goods receipts that this person may see (receipts.cost needed);
-- stock value = quantity x average cost. Without receipts.cost both are null. Stock itself never changes here.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which places, products and prices are visible.
create or replace function public.current_stock_page(
  p_q text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_status text default null,    -- all | IN | LOW | OUT | OVER
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
  v_result jsonb;
begin
  if not public.has_permission('stock.view') then
    raise exception 'You do not have permission to see stock' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'IN', 'LOW', 'OUT', 'OVER') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with avgc as (
    select gl.item_id, sum(gl.quantity * gc.unit_cost) / nullif(sum(gl.quantity), 0) as avg_cost
      from public.goods_receipt_lines gl
      join public.goods_receipts r on r.id = gl.receipt_id and r.status = 'POSTED'
      join public.goods_receipt_costs gc on gc.line_id = gl.id
     where v_cost
     group by gl.item_id
  ),
  base as (
    select i.id as item_id, i.internal_item_code as code, i.item_name, i.unit, i.image_paths[1] as image,
           c.id as category_id, c.name as category_name,
           l.id as location_id, l.name as place_name,
           coalesce(b.quantity, 0) as qty, rl.min_qty, rl.max_qty,
           (select sb.code from public.item_bins ib join public.storage_bins sb on sb.id = ib.bin_id
             where ib.item_id = i.id and ib.location_id = l.id order by sb.code limit 1) as rack,
           a.avg_cost,
           case when a.avg_cost is not null then coalesce(b.quantity, 0) * a.avg_cost end as value,
           case when coalesce(b.quantity, 0) <= 0 then 'OUT'
                when rl.min_qty is not null and rl.min_qty > 0 and coalesce(b.quantity, 0) < rl.min_qty then 'LOW'
                when rl.max_qty is not null and coalesce(b.quantity, 0) > rl.max_qty then 'OVER'
                else 'IN' end as status
      from public.items i
      join public.locations l on l.is_active and l.type <> 'TRANSIT'
      left join public.categories c on c.id = i.category_id
      left join public.stock_balances b on b.item_id = i.id and b.location_id = l.id
      left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = l.id
      left join avgc a on a.item_id = i.id
     where i.is_active and (b.item_id is not null or rl.item_id is not null)
  ),
  filtered as (
    select x.* from base x
     where (p_category is null or x.category_id = p_category)
       and (p_location is null or x.location_id = p_location)
       and (coalesce(p_status, '') in ('', 'all') or x.status = p_status)
       and (coalesce(p_q, '') = '' or x.code ilike v_like or x.item_name ilike v_like or x.category_name ilike v_like or x.place_name ilike v_like or x.rack ilike v_like
            or exists (select 1 from public.item_barcodes bc where bc.item_id = x.item_id and bc.barcode ilike v_like))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.code, t.place_name), '[]'::jsonb)
               from (select * from filtered order by code, place_name limit v_limit offset v_offset) t),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.categories),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'items', (select count(distinct item_id) from base),
      'qty', (select coalesce(sum(qty), 0) from base),
      'value', (select case when v_cost then coalesce(sum(value), 0) end from base),
      'low', (select count(*) from base where status = 'LOW'),
      'out', (select count(*) from base where status = 'OUT'),
      'over', (select count(*) from base where status = 'OVER')))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.current_stock_page(text, uuid, uuid, text, int, int) from public, anon;
grant execute on function public.current_stock_page(text, uuid, uuid, text, int, int) to authenticated;
