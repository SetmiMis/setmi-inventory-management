-- Purchase Orders screen (owner's mock): one call that returns a page of orders with supplier, order type
-- (Import / Domestic, from the supplier's type), number of items, order value and an "overdue" flag, plus the top numbers.
-- The order value is returned only to people who may see buying prices (receipts.cost); for everybody else it is null.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which orders are visible.
create or replace function public.purchase_orders_page(
  p_q text default null,
  p_supplier uuid default null,
  p_type text default null,      -- LOCAL | IMPORT
  p_status text default null,    -- all | DRAFT | SENT | PARTIAL | COMPLETED | CANCELLED | OVERDUE
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
  v_cost boolean := public.has_permission('receipts.cost');
  v_result jsonb;
begin
  if not (public.has_permission('purchase.view') or public.has_permission('purchase.create') or public.has_permission('purchase.approve')) then
    raise exception 'You do not have permission to see purchase orders' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'DRAFT', 'SENT', 'PARTIAL', 'COMPLETED', 'CANCELLED', 'OVERDUE') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_type is not null and p_type not in ('', 'LOCAL', 'IMPORT') then
    raise exception 'Unknown type filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select o.id, o.po_no, o.order_date, o.expected_date, o.status::text as status, o.created_at,
           (o.status in ('SENT', 'PARTIAL') and o.expected_date is not null and o.expected_date < v_today) as overdue,
           l.code as place_code, l.name as place_name,
           s.id as supplier_id, s.name as supplier_name, s.country as supplier_country, s.supplier_type::text as supplier_type,
           coalesce(t.items, 0) as items, coalesce(t.qty, 0) as qty,
           case when v_cost then coalesce(t.value, 0) end as value
      from public.purchase_orders o
      join public.suppliers s on s.id = o.supplier_id
      join public.locations l on l.id = o.location_id
      left join (select pl.po_id, count(*) as items, sum(pl.quantity) as qty, sum(pl.quantity * coalesce(c.unit_cost, 0)) as value
                   from public.purchase_order_lines pl
                   left join public.purchase_order_costs c on c.line_id = pl.id
                  group by pl.po_id) t on t.po_id = o.id
  ),
  filtered as (
    select b.* from base b
     where (p_supplier is null or b.supplier_id = p_supplier)
       and (coalesce(p_type, '') = '' or b.supplier_type = p_type)
       and (coalesce(p_status, '') in ('', 'all')
            or (p_status = 'OVERDUE' and b.overdue)
            or (p_status <> 'OVERDUE' and b.status = p_status))
       and (p_from is null or b.order_date >= p_from)
       and (p_to is null or b.order_date <= p_to)
       and (coalesce(p_q, '') = '' or b.po_no ilike v_like or b.supplier_name ilike v_like
            or exists (select 1 from public.purchase_order_lines pl join public.items i on i.id = pl.item_id
                        where pl.po_id = b.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
               from (select * from filtered order by created_at desc, po_no desc limit v_limit offset v_offset) t),
    'suppliers', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.suppliers where is_active),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'open', (select count(*) from base where status in ('DRAFT', 'SENT', 'PARTIAL')),
      'sent', (select count(*) from base where status = 'SENT'),
      'partial', (select count(*) from base where status = 'PARTIAL'),
      'completed', (select count(*) from base where status = 'COMPLETED'),
      'overdue', (select count(*) from base where overdue),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.purchase_orders_page(text, uuid, text, text, date, date, int, int) from public, anon;
grant execute on function public.purchase_orders_page(text, uuid, text, text, date, date, int, int) to authenticated;
