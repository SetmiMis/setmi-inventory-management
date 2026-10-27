-- Goods Inward (GRN) screen (owner's mock): one call that returns a page of goods receipts with supplier, source
-- (Import / Domestic, from the supplier's type), place, number of items, received quantity and the order number,
-- plus the top numbers and the lists for the filters.
-- There is no quality check in the system yet, so the mock's "Pending Inspection / Accepted / Rejected" are shown as
-- Draft (not posted), Posted (stock added) and Cancelled. "Partly received" = a posted receipt whose purchase order
-- is still waiting for more goods.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which receipts (and which orders) are visible.
create or replace function public.receipts_page(
  p_q text default null,
  p_location uuid default null,
  p_supplier uuid default null,
  p_source text default null,    -- LOCAL | IMPORT
  p_status text default null,    -- all | DRAFT | POSTED | CANCELLED | PARTIAL
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
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not (public.has_permission('receipts.view') or public.has_permission('receipts.create') or public.has_permission('receipts.post')) then
    raise exception 'You do not have permission to see goods receipts' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'DRAFT', 'POSTED', 'CANCELLED', 'PARTIAL') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_source is not null and p_source not in ('', 'LOCAL', 'IMPORT') then
    raise exception 'Unknown source filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select r.id, r.receipt_no, r.receipt_date, r.status::text as status, r.supplier_invoice_no, r.created_at, r.posted_at,
           l.id as location_id, l.code as place_code, l.name as place_name,
           s.id as supplier_id, s.name as supplier_name, s.country as supplier_country, s.supplier_type::text as source,
           o.id as po_id, o.po_no,
           (r.status = 'POSTED' and o.status = 'PARTIAL') as partial,
           coalesce(t.items, 0) as items, coalesce(t.qty, 0) as qty
      from public.goods_receipts r
      join public.suppliers s on s.id = r.supplier_id
      join public.locations l on l.id = r.location_id
      left join public.purchase_orders o on o.id = r.purchase_order_id
      left join (select gl.receipt_id, count(*) as items, sum(gl.quantity) as qty from public.goods_receipt_lines gl group by gl.receipt_id) t on t.receipt_id = r.id
  ),
  filtered as (
    select b.* from base b
     where (p_location is null or b.location_id = p_location)
       and (p_supplier is null or b.supplier_id = p_supplier)
       and (coalesce(p_source, '') = '' or b.source = p_source)
       and (coalesce(p_status, '') in ('', 'all') or (p_status = 'PARTIAL' and b.partial) or (p_status <> 'PARTIAL' and b.status = p_status))
       and (p_from is null or b.receipt_date >= p_from)
       and (p_to is null or b.receipt_date <= p_to)
       and (coalesce(p_q, '') = '' or b.receipt_no ilike v_like or b.po_no ilike v_like or b.supplier_name ilike v_like or b.supplier_invoice_no ilike v_like
            or exists (select 1 from public.goods_receipt_lines gl join public.items i on i.id = gl.item_id
                        where gl.receipt_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
               from (select * from filtered order by created_at desc, receipt_no desc limit v_limit offset v_offset) t),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers where is_active),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'today', (select count(*) from base where status = 'POSTED' and (posted_at at time zone 'Asia/Kolkata')::date = v_today),
      'draft', (select count(*) from base where status = 'DRAFT'),
      'posted', (select count(*) from base where status = 'POSTED'),
      'partial', (select count(*) from base where partial),
      'cancelled', (select count(*) from base where status = 'CANCELLED'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.receipts_page(text, uuid, uuid, text, text, date, date, int, int) from public, anon;
grant execute on function public.receipts_page(text, uuid, uuid, text, text, date, date, int, int) to authenticated;
