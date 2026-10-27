-- Tiny 30-day activity lines for the dashboard cards (one number per day). Runs as the caller; permissions decide what is returned.
create or replace function public.dashboard_spark(p_location uuid default null)
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
  if public.has_permission('items.view') then
    r := r || jsonb_build_object('items', (select coalesce(jsonb_agg(coalesce(s.n, 0) order by g.d), '[]'::jsonb)
      from generate_series(v_today - 29, v_today, interval '1 day') as g(d)
      left join (select (i.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n from public.items i
                  where (i.created_at at time zone 'Asia/Kolkata')::date >= v_today - 29 group by 1) s on s.day = g.d::date));
  end if;
  if public.has_permission('stock.view') then
    r := r || jsonb_build_object('stock_in', (select coalesce(jsonb_agg(coalesce(s.n, 0) order by g.d), '[]'::jsonb)
      from generate_series(v_today - 29, v_today, interval '1 day') as g(d)
      left join (select (m.created_at at time zone 'Asia/Kolkata')::date as day, sum(m.quantity) as n from public.stock_movements m
                  where (m.created_at at time zone 'Asia/Kolkata')::date >= v_today - 29
                    and case when p_location is null then m.from_location_id is null else m.to_location_id = p_location end
                  group by 1) s on s.day = g.d::date));
  end if;
  if public.has_permission('purchase.view') or public.has_permission('purchase.create') or public.has_permission('purchase.approve') then
    r := r || jsonb_build_object('pos', (select coalesce(jsonb_agg(coalesce(s.n, 0) order by g.d), '[]'::jsonb)
      from generate_series(v_today - 29, v_today, interval '1 day') as g(d)
      left join (select (o.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n from public.purchase_orders o
                  where (o.created_at at time zone 'Asia/Kolkata')::date >= v_today - 29 and (p_location is null or o.location_id = p_location)
                  group by 1) s on s.day = g.d::date));
  end if;
  if public.has_permission('transfers.view') or public.has_permission('transfers.create')
     or public.has_permission('transfers.send') or public.has_permission('transfers.receive') then
    r := r || jsonb_build_object('transfers', (select coalesce(jsonb_agg(coalesce(s.n, 0) order by g.d), '[]'::jsonb)
      from generate_series(v_today - 29, v_today, interval '1 day') as g(d)
      left join (select (t.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n from public.stock_transfers t
                  where (t.created_at at time zone 'Asia/Kolkata')::date >= v_today - 29
                    and (p_location is null or t.from_location_id = p_location or t.to_location_id = p_location)
                  group by 1) s on s.day = g.d::date));
  end if;
  if public.has_permission('bills.view') then
    r := r || jsonb_build_object('bills', (select coalesce(jsonb_agg(coalesce(s.n, 0) order by g.d), '[]'::jsonb)
      from generate_series(v_today - 29, v_today, interval '1 day') as g(d)
      left join (select (b.created_at at time zone 'Asia/Kolkata')::date as day, count(*) as n from public.bills b
                  where b.status = 'COMPLETED' and (b.created_at at time zone 'Asia/Kolkata')::date >= v_today - 29
                    and (p_location is null or b.location_id = p_location)
                  group by 1) s on s.day = g.d::date));
  end if;
  return r;
end $$;

revoke execute on function public.dashboard_spark(uuid) from public, anon;
grant execute on function public.dashboard_spark(uuid) to authenticated;
