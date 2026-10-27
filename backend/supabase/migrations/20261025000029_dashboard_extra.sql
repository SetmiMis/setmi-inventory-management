-- More numbers for the new dashboard layout (the owner's mock): item counts, stock value, stock status,
-- 30-day stock in/out, top categories, purchase order and receipt lists, transfer status.
-- Runs as the caller (SECURITY INVOKER): row-level security and the permission checks below decide what is returned.
-- Stock value is at SELLING price (items.selling_price); buying prices stay behind the receipts.cost permission.
create or replace function public.dashboard_extra(p_location uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if public.has_permission('stock.view') and public.has_permission('items.view') then
    r := r || jsonb_build_object(
      'catalog', (select jsonb_build_object(
          'total', count(*) filter (where i.is_active),
          'inactive', count(*) filter (where not i.is_active),
          'new_month', count(*) filter (where i.is_active and (i.created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date))
        from public.items i),
      'stock_value', (select coalesce(sum(so.quantity * coalesce(i.selling_price, 0)), 0)
                        from public.stock_overview so join public.items i on i.id = so.item_id
                       where i.is_active and (p_location is null or so.location_id = p_location)),
      -- one status per item (all places in view added together)
      'status', (select jsonb_build_object(
          'ok', count(*) filter (where t.qty > 0 and not t.low),
          'low', count(*) filter (where t.qty > 0 and t.low),
          'out', count(*) filter (where t.qty = 0))
        from (select so.item_id, sum(so.quantity) as qty, bool_or(so.is_low) as low
                from public.stock_overview so join public.items i on i.id = so.item_id
               where i.is_active and (p_location is null or so.location_id = p_location)
               group by so.item_id) t),
      'by_category', (select coalesce(jsonb_agg(t order by t.value desc), '[]'::jsonb) from (
          select coalesce(c.name, 'No category') as name, sum(so.quantity * coalesce(i.selling_price, 0)) as value
            from public.stock_overview so
            join public.items i on i.id = so.item_id
            left join public.categories c on c.id = i.category_id
           where i.is_active and so.quantity > 0 and (p_location is null or so.location_id = p_location)
           group by coalesce(c.name, 'No category')
           order by sum(so.quantity * coalesce(i.selling_price, 0)) desc limit 5) t),
      -- last 30 days: what came in from outside and what left (moves between your own places are not counted)
      'moves_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'in', coalesce(s.q_in, 0), 'out', coalesce(s.q_out, 0)) order by g.d), '[]'::jsonb)
          from generate_series(v_today - 29, v_today, interval '1 day') as g(d)
          left join (select (m.created_at at time zone 'Asia/Kolkata')::date as day,
                            sum(m.quantity) filter (where case when p_location is null then m.from_location_id is null else m.to_location_id = p_location end) as q_in,
                            sum(m.quantity) filter (where case when p_location is null then m.to_location_id is null else m.from_location_id = p_location end) as q_out
                       from public.stock_movements m
                      where (m.created_at at time zone 'Asia/Kolkata')::date between v_today - 29 and v_today
                      group by 1) s on s.day = g.d::date)
    );
  end if;

  if public.has_permission('purchase.view') or public.has_permission('purchase.create') or public.has_permission('purchase.approve') then
    r := r || jsonb_build_object('po', (select jsonb_build_object(
        'total', count(*),
        'completed', count(*) filter (where o.status = 'COMPLETED'),
        'pending', count(*) filter (where o.status in ('SENT', 'PARTIAL')),
        'recent', (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) from (
            select o2.id, o2.po_no, s.name as supplier, l.code as place, o2.status::text as status, o2.expected_date,
                   (select coalesce(sum(pl.quantity), 0) from public.purchase_order_lines pl where pl.po_id = o2.id) as qty, o2.created_at
              from public.purchase_orders o2
              join public.suppliers s on s.id = o2.supplier_id
              join public.locations l on l.id = o2.location_id
             where (p_location is null or o2.location_id = p_location)
             order by o2.created_at desc limit 5) t))
      from public.purchase_orders o where (p_location is null or o.location_id = p_location)));
  end if;

  if public.has_permission('receipts.view') or public.has_permission('receipts.create') or public.has_permission('receipts.post') then
    r := r || jsonb_build_object('grn_recent', (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) from (
        select g.id, g.receipt_no, po.po_no, s.name as supplier, g.status::text as status, g.receipt_date as d, g.created_at,
               (select count(*) from public.goods_receipt_lines l where l.receipt_id = g.id) as items,
               (select coalesce(sum(l.quantity), 0) from public.goods_receipt_lines l where l.receipt_id = g.id) as qty
          from public.goods_receipts g
          join public.suppliers s on s.id = g.supplier_id
          left join public.purchase_orders po on po.id = g.purchase_order_id
         where (p_location is null or g.location_id = p_location)
         order by g.created_at desc limit 5) t));
  end if;

  if public.has_permission('transfers.view') or public.has_permission('transfers.create')
     or public.has_permission('transfers.send') or public.has_permission('transfers.receive') then
    r := r || jsonb_build_object('transfer_status', (select jsonb_build_object(
        'received', count(*) filter (where t.status = 'RECEIVED'),
        'sent', count(*) filter (where t.status = 'SENT'),
        'draft', count(*) filter (where t.status = 'DRAFT'),
        'cancelled', count(*) filter (where t.status = 'CANCELLED'))
      from public.stock_transfers t
      where t.created_at >= now() - interval '7 days'
        and (p_location is null or t.from_location_id = p_location or t.to_location_id = p_location)));
  end if;

  return r;
end $$;

revoke execute on function public.dashboard_extra(uuid) from public, anon;
grant execute on function public.dashboard_extra(uuid) to authenticated;
