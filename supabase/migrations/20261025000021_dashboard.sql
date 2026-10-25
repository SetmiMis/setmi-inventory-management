-- Business dashboard (the "Blinkit-style" overview). One read-only function returns every number the
-- dashboard shows, as JSON. It runs as the CALLER (security invoker), so the existing row rules decide which
-- places, bills and documents count. Each section is only filled when the caller holds that area's permission;
-- otherwise the section is simply missing (the screen then hides that card). No purchase cost is used.
create or replace function public.dashboard_data(p_from date, p_to date, p_location uuid default null)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  r jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_days int;
  v_prev_from date; v_prev_to date;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a date range of at most one year' using errcode = 'P0001';
  end if;
  v_days := p_to - p_from + 1;
  v_prev_to := p_from - 1;
  v_prev_from := p_from - v_days;

  -- Sales (needs bills.view). Voided bills never count.
  if public.has_permission('bills.view') then
    r := r || jsonb_build_object('sales', (
      select jsonb_build_object(
        'total', coalesce(sum(b.total), 0),
        'bills', count(*),
        'discount', coalesce(sum(b.discount), 0),
        'cash', coalesce(sum(b.total) filter (where b.payment_mode = 'CASH'), 0),
        'upi', coalesce(sum(b.total) filter (where b.payment_mode = 'UPI'), 0),
        'card', coalesce(sum(b.total) filter (where b.payment_mode = 'CARD'), 0),
        'other', coalesce(sum(b.total) filter (where b.payment_mode = 'OTHER'), 0),
        'prev_total', (select coalesce(sum(p.total), 0) from public.bills p
                        where p.status = 'COMPLETED'
                          and (p.created_at at time zone 'Asia/Kolkata')::date between v_prev_from and v_prev_to
                          and (p_location is null or p.location_id = p_location)),
        'by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', g.d::date, 'total', coalesce(s.t, 0), 'bills', coalesce(s.n, 0)) order by g.d), '[]'::jsonb)
                     from generate_series(p_from, p_to, interval '1 day') as g(d)
                     left join (select (x.created_at at time zone 'Asia/Kolkata')::date as day, sum(x.total) as t, count(*) as n
                                  from public.bills x
                                 where x.status = 'COMPLETED'
                                   and (x.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
                                   and (p_location is null or x.location_id = p_location)
                                 group by 1) s on s.day = g.d::date),
        'top_items', (select coalesce(jsonb_agg(t order by t.amount desc), '[]'::jsonb) from (
                        select bl.item_code as code, max(bl.item_name) as name, max(bl.unit) as unit,
                               sum(bl.quantity) as qty, sum(bl.line_total) as amount
                          from public.bill_lines bl join public.bills y on y.id = bl.bill_id
                         where y.status = 'COMPLETED'
                           and (y.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
                           and (p_location is null or y.location_id = p_location)
                         group by bl.item_code order by sum(bl.line_total) desc limit 5) t)
      )
      from public.bills b
      where b.status = 'COMPLETED'
        and (b.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
        and (p_location is null or b.location_id = p_location)
    ));
  end if;

  -- Stock (needs stock.view). Counts are item-and-place pairs.
  if public.has_permission('stock.view') then
    r := r || jsonb_build_object('stock', (
      select jsonb_build_object(
        'in_stock', count(*) filter (where so.quantity > 0),
        'low', count(*) filter (where so.is_low),
        'out', count(*) filter (where so.is_low and so.quantity = 0),
        'low_list', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
                       select so2.internal_item_code as code, so2.item_name as name, so2.unit, l2.code as place,
                              so2.quantity as qty, so2.min_qty as min
                         from public.stock_overview so2 join public.locations l2 on l2.id = so2.location_id
                        where so2.is_low and (p_location is null or so2.location_id = p_location)
                        order by (so2.min_qty - so2.quantity) desc, l2.code, so2.internal_item_code limit 8) t),
        'by_place', (select coalesce(jsonb_agg(t order by t.place), '[]'::jsonb) from (
                       select l3.code as place, l3.name as place_name,
                              count(*) filter (where so3.quantity > 0) as in_stock,
                              count(*) filter (where so3.is_low) as low
                         from public.stock_overview so3 join public.locations l3 on l3.id = so3.location_id
                        where (p_location is null or so3.location_id = p_location)
                        group by l3.code, l3.name) t),
        'recent', (select coalesce(jsonb_agg(t order by t.at desc), '[]'::jsonb) from (
                     select m.created_at as at, m.movement_type::text as type, m.quantity as qty,
                            i.internal_item_code as code, i.unit, lf.code as from_place, lt.code as to_place
                       from public.stock_movements m
                       join public.items i on i.id = m.item_id
                       left join public.locations lf on lf.id = m.from_location_id
                       left join public.locations lt on lt.id = m.to_location_id
                      where (p_location is null or m.from_location_id = p_location or m.to_location_id = p_location)
                      order by m.id desc limit 8) t)
      )
      from public.stock_overview so
      where (p_location is null or so.location_id = p_location)
    ));
  end if;

  -- Purchase orders (any purchase permission).
  if public.has_permission('purchase.view') or public.has_permission('purchase.create') or public.has_permission('purchase.approve') then
    r := r || jsonb_build_object('purchase', (
      select jsonb_build_object(
        'open', count(*) filter (where o.status in ('SENT', 'PARTIAL')),
        'late', count(*) filter (where o.status in ('SENT', 'PARTIAL') and o.expected_date < v_today),
        'drafts', count(*) filter (where o.status = 'DRAFT'))
      from public.purchase_orders o
      where (p_location is null or o.location_id = p_location)
    ));
  end if;

  -- Receipts waiting to be posted (any receipts permission).
  if public.has_permission('receipts.view') or public.has_permission('receipts.create') or public.has_permission('receipts.post') then
    r := r || jsonb_build_object('receipts', (
      select jsonb_build_object('drafts', count(*))
      from public.goods_receipts g
      where g.status = 'DRAFT' and (p_location is null or g.location_id = p_location)
    ));
  end if;

  -- Transfers on the way to the caller's places (any transfers permission).
  if public.has_permission('transfers.view') or public.has_permission('transfers.create')
     or public.has_permission('transfers.send') or public.has_permission('transfers.receive') then
    r := r || jsonb_build_object('transfers', (
      select jsonb_build_object(
        'incoming', count(*) filter (where t.status = 'SENT' and public.can_access_location(t.to_location_id)
                                       and (p_location is null or t.to_location_id = p_location)),
        'outgoing', count(*) filter (where t.status = 'SENT' and public.can_access_location(t.from_location_id)
                                       and (p_location is null or t.from_location_id = p_location)))
      from public.stock_transfers t
    ));
  end if;

  return r || jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today);
end $$;

revoke all on function public.dashboard_data(date, date, uuid) from public, anon;
grant execute on function public.dashboard_data(date, date, uuid) to authenticated;
