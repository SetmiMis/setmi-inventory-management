-- One call for the Product / SKU Master screen: a page of items with their total stock and reorder level
-- (all places the person may see added together), a stock status per item, the filters, and the five top numbers.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which items and stock rows are visible.
create or replace function public.items_page(
  p_q text default null,
  p_category uuid default null,
  p_source text default null,
  p_status text default null,   -- all | in | low | out | inactive
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
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select i.id, i.internal_item_code as code, i.item_name as name, i.selling_item_name, i.import_item_code,
           i.category_id, c.name as category, i.unit,
           i.purchase_source::text as source, i.is_active as active, i.selling_price as price, i.image_paths[1] as image,
           coalesce(s.qty, 0) as qty, coalesce(s.reorder, 0) as reorder,
           case when not i.is_active then 'inactive'
                when coalesce(s.qty, 0) = 0 then 'out'
                when coalesce(s.low, false) then 'low'
                else 'in' end as status
      from public.items i
      left join public.categories c on c.id = i.category_id
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
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) - 'import_item_code' - 'category_id' order by t.code), '[]'::jsonb)
               from (select * from filtered order by code limit v_limit offset v_offset) t),
    'kpi', (select jsonb_build_object(
              'total', count(*), 'active', count(*) filter (where active), 'inactive', count(*) filter (where not active),
              'low', count(*) filter (where status = 'low'), 'out', count(*) filter (where status = 'out'))
              from base))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.items_page(text, uuid, text, text, int, int) from public, anon;
grant execute on function public.items_page(text, uuid, text, text, int, int) to authenticated;
