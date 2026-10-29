-- Applied to the live project on 2026-10-29 (after migration 58, with the owner's yes). Product list: also return the average buying cost of each item.
-- Average cost = weighted average of the buying prices of POSTED goods receipts (same rule as Current Stock, migration 41).
-- Only people with receipts.cost get a number; for everybody else 'cost' is null. Same function signature as migration 58,
-- so create or replace is enough and the app keeps working before and after this runs. Stock and prices are not changed.

create or replace function public.items_page(
  p_q text default null, p_category uuid default null, p_source text default null, p_status text default null,
  p_limit int default 10, p_offset int default 0, p_sort text default 'code', p_dir text default 'asc'
) returns jsonb
language plpgsql stable set search_path = ''
as $function$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort text := coalesce(nullif(p_sort, ''), 'code');
  v_asc boolean := lower(coalesce(p_dir, 'asc')) <> 'desc';
  v_cost boolean := public.has_permission('receipts.cost');
  v_result jsonb;
begin
  if not public.has_permission('items.view') then
    raise exception 'You do not have permission to see items' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'in', 'low', 'out', 'inactive') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_source is not null and p_source not in ('', 'LOCAL', 'IMPORT') then
    raise exception 'Unknown source filter' using errcode = 'P0001';
  end if;
  if v_sort not in ('code', 'name', 'category', 'qty', 'price', 'status') then
    raise exception 'Unknown sort column' using errcode = 'P0001';
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
    select i.id, i.internal_item_code as code, i.item_name as name, i.selling_item_name, i.import_item_code,
           i.category_id, c.name as category, i.unit,
           i.purchase_source::text as source, i.is_active as active, i.selling_price as price, a.avg_cost as cost, i.image_paths[1] as image,
           coalesce(s.qty, 0) as qty, coalesce(s.reorder, 0) as reorder,
           case when not i.is_active then 'inactive'
                when coalesce(s.qty, 0) = 0 then 'out'
                when coalesce(s.low, false) then 'low'
                else 'in' end as status
      from public.items i
      left join public.categories c on c.id = i.category_id
      left join avgc a on a.item_id = i.id
      left join (select so.item_id, sum(so.quantity) as qty, coalesce(sum(so.min_qty), 0) as reorder, bool_or(so.is_low) as low
                   from public.stock_overview so group by so.item_id) s on s.item_id = i.id
  ),
  filtered as (
    select b.* from base b
     where (p_category is null or b.category_id = p_category)
       and (coalesce(p_source, '') = '' or b.source = p_source)
       and (coalesce(p_status, '') in ('', 'all') or b.status = p_status)
       and (coalesce(p_q, '') = ''
            or b.code ilike v_like or b.name ilike v_like or b.selling_item_name ilike v_like
            or coalesce(b.import_item_code, '') ilike v_like
            or exists (select 1 from public.item_barcodes bc where bc.item_id = b.id and bc.barcode ilike v_like))
  ),
  ordered as (
    select f.*, row_number() over (order by
      case when v_sort = 'code' and v_asc then f.code end asc,        case when v_sort = 'code' and not v_asc then f.code end desc,
      case when v_sort = 'name' and v_asc then f.name end asc,        case when v_sort = 'name' and not v_asc then f.name end desc,
      case when v_sort = 'category' and v_asc then f.category end asc, case when v_sort = 'category' and not v_asc then f.category end desc,
      case when v_sort = 'status' and v_asc then f.status end asc,    case when v_sort = 'status' and not v_asc then f.status end desc,
      case when v_sort = 'qty' and v_asc then f.qty end asc,          case when v_sort = 'qty' and not v_asc then f.qty end desc,
      case when v_sort = 'price' and v_asc then f.price end asc,      case when v_sort = 'price' and not v_asc then f.price end desc,
      f.code asc) as rn
      from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) - 'import_item_code' - 'category_id' - 'rn' order by t.rn), '[]'::jsonb)
               from (select * from ordered order by rn limit v_limit offset v_offset) t),
    'kpi', (select jsonb_build_object(
              'total', count(*), 'active', count(*) filter (where active), 'inactive', count(*) filter (where not active),
              'low', count(*) filter (where status = 'low'), 'out', count(*) filter (where status = 'out'))
              from base))
  into v_result;
  return v_result;
end $function$;

revoke execute on function public.items_page(text, uuid, text, text, int, int, text, text) from public, anon;
grant execute on function public.items_page(text, uuid, text, text, int, int, text, text) to authenticated;
