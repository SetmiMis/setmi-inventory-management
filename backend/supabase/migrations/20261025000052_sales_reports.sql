-- Sales Reports screen (owner's mock): one call with the top numbers, the charts and the rows of one tab:
--   orders | product | channel | customer | city | monthly | comparison.
-- A SALE = a sales order that is DISPATCHED (owner's choice). Shop bills (Billing) are not included. Orders that are Pending, Confirmed, In Packing or Cancelled are not sales.
-- Order value = sum of quantity x rate of its lines. Net value = order value - discount + shipping charges (the same Grand Total as on Sales Orders). NO TAX (owner: later).
-- The date range works on the ORDER date (default for the numbers: no limit; Comparison: this month so far against the period of the same length just before it).
-- Filters: channel, category (the order must contain the category; the product and category numbers then count only that category's lines), customer type,
-- search (order no, customer, city, item code or name).
-- Return = number of returns on the order that were not rejected (a person who may not see returns sees 0). "Return Orders" = orders with at least one such return.
-- Dispatch status = the status of the parcel (Dispatched, In Transit, Delivered, ...); a person who may not see dispatches sees "Dispatched". There is NO payment status: the system has no customer payments (owner: later).
-- Runs as the caller (SECURITY INVOKER): row-level security decides which orders, customers and items are visible. Nothing is changed here.
create or replace function public.sales_report(
  p_tab text default 'orders',      -- orders | product | channel | customer | city | monthly | comparison
  p_q text default null,
  p_channel text default null,
  p_category uuid default null,
  p_ctype text default null,
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
  v_cfrom date := coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Kolkata'))::date);
  v_cto date := coalesce(p_to, (now() at time zone 'Asia/Kolkata')::date);
  v_pto date;
  v_pfrom date;
  v_result jsonb;
begin
  if not (public.has_permission('sales_orders.view') or public.has_permission('sales_orders.create') or public.has_permission('sales_orders.confirm')) then
    raise exception 'You do not have permission to see sales orders' using errcode = '42501';
  end if;
  if p_tab is null or p_tab not in ('orders', 'product', 'channel', 'customer', 'city', 'monthly', 'comparison') then raise exception 'Unknown report tab' using errcode = 'P0001'; end if;
  if p_channel is not null and p_channel not in ('', 'all', 'WEBSITE', 'AMAZON', 'FLIPKART', 'MEESHO', 'DIRECT', 'OTHER') then raise exception 'Unknown channel filter' using errcode = 'P0001'; end if;
  if p_ctype is not null and p_ctype not in ('', 'all', 'DEALER', 'DISTRIBUTOR', 'RETAILER', 'OEM', 'PROJECT', 'GOVERNMENT', 'OTHER') then raise exception 'Unknown customer type filter' using errcode = 'P0001'; end if;
  if p_from is not null and p_to is not null and p_to < p_from then raise exception 'The end date is before the start date' using errcode = 'P0001'; end if;
  if v_cto < v_cfrom then raise exception 'The end date is before the start date' using errcode = 'P0001'; end if;
  if v_cto - v_cfrom > 3660 then raise exception 'The date range is too long' using errcode = 'P0001'; end if;
  v_pto := v_cfrom - 1;
  v_pfrom := v_pto - (v_cto - v_cfrom);
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with sl as (   -- every line of a dispatched order with its order, customer, item and category
    select o.id as oid, o.order_no, o.order_date, o.channel, o.discount, o.shipping_charges,
           cu.id as cid, cu.name as cname, cu.customer_type as ctype, coalesce(nullif(btrim(cu.city), ''), 'Not set') as city,
           l.item_id, i.internal_item_code as code, i.item_name, i.unit, c.id as category_id, coalesce(c.name, 'No category') as category_name, l.quantity as qty, l.rate
      from public.sales_order_lines l
      join public.sales_orders o on o.id = l.order_id and o.status = 'DISPATCHED'
      join public.customers cu on cu.id = o.customer_id
      join public.items i on i.id = l.item_id
      left join public.categories c on c.id = i.category_id
  ),
  qox as (   -- orders that pass every filter except the date range
    select distinct s.oid from sl s
     where (coalesce(p_channel, '') in ('', 'all') or s.channel = p_channel)
       and (coalesce(p_ctype, '') in ('', 'all') or s.ctype = p_ctype)
       and (p_category is null or exists (select 1 from sl x where x.oid = s.oid and x.category_id = p_category))
       and (coalesce(p_q, '') = '' or s.order_no ilike v_like or s.cname ilike v_like or s.city ilike v_like
            or exists (select 1 from sl x where x.oid = s.oid and (x.code ilike v_like or x.item_name ilike v_like)))
  ),
  sox as (   -- one row per order
    select s.oid, s.order_no, s.order_date, s.channel, s.cid, s.cname, s.ctype, s.city, count(*) as items, sum(s.qty) as qty, sum(s.qty * s.rate) as value, s.discount, s.shipping_charges,
           sum(s.qty * s.rate) - s.discount + s.shipping_charges as net
      from sl s join qox q on q.oid = s.oid
     group by s.oid, s.order_no, s.order_date, s.channel, s.cid, s.cname, s.ctype, s.city, s.discount, s.shipping_charges
  ),
  so as (
    select x.*, coalesce(d.status, 'DISPATCHED') as dispatch_status, (select count(*) from public.sales_returns r where r.order_id = x.oid and r.status <> 'REJECTED') as returns
      from sox x left join public.dispatches d on d.order_id = x.oid
     where (p_from is null or x.order_date >= p_from) and (p_to is null or x.order_date <= p_to)
  ),
  slq as (   -- lines of the orders in the range (with the category filter applied to the lines)
    select s.* from sl s join so on so.oid = s.oid where (p_category is null or s.category_id = p_category)
  ),
  cmp as (
    select 'cur' as per, x.* from sox x where x.order_date between v_cfrom and v_cto
    union all
    select 'prev', x.* from sox x where x.order_date between v_pfrom and v_pto
  ),
  cmpm as (
    select per, count(*) as orders, coalesce(sum(qty), 0) as qty, coalesce(sum(net), 0) as net, count(distinct cid) as customers,
           (select count(*) from public.sales_returns r join cmp c2 on c2.oid = r.order_id and c2.per = cmp.per where r.status <> 'REJECTED') as returns
      from cmp group by per
  ),
  trend as (
    select g.d, count(x.oid) as orders, coalesce(sum(x.net), 0) as value
      from generate_series(v_today - 29, v_today, interval '1 day') as gs(d0), lateral (select gs.d0::date as d) g
      left join sox x on x.order_date = g.d
     group by g.d
  )
  select jsonb_build_object(
    'tab', p_tab,
    'total', case p_tab
      when 'orders' then (select count(*) from so) when 'product' then (select count(distinct item_id) from slq) when 'channel' then (select count(distinct channel) from so)
      when 'customer' then (select count(distinct cid) from so) when 'city' then (select count(distinct city) from so) when 'monthly' then (select count(distinct to_char(order_date, 'YYYY-MM')) from so) else 6 end,
    'rows', case p_tab
      when 'orders' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select oid as order_id, order_no, order_date, cname, channel, items, qty, value, discount, net, dispatch_status, returns
                                                                                       from so order by order_date desc, order_no desc limit v_limit offset v_offset) t)
      when 'product' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select code, item_name, category_name, unit, count(distinct oid) as orders, sum(qty) as qty, sum(qty * rate) as value, case when sum(qty) > 0 then sum(qty * rate) / sum(qty) end as avg_rate
                                                                                        from slq group by item_id, code, item_name, category_name, unit order by sum(qty * rate) desc, code limit v_limit offset v_offset) t)
      when 'channel' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select channel, count(*) as orders, count(distinct cid) as customers, sum(qty) as qty, sum(value) as value, sum(discount) as discount, sum(net) as net
                                                                                         from so group by channel order by sum(net) desc, channel limit v_limit offset v_offset) t)
      when 'customer' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select cid as customer_id, cname, ctype, city, count(*) as orders, sum(qty) as qty, sum(value) as value, sum(net) as net, max(order_date) as last_order
                                                                                          from so group by cid, cname, ctype, city order by sum(net) desc, cname limit v_limit offset v_offset) t)
      when 'city' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select city, count(*) as orders, count(distinct cid) as customers, sum(qty) as qty, sum(net) as net
                                                                                      from so group by city order by sum(net) desc, city limit v_limit offset v_offset) t)
      when 'monthly' then (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select to_char(order_date, 'YYYY-MM') as month, count(*) as orders, count(distinct cid) as customers, sum(qty) as qty, sum(value) as value, sum(discount) as discount, sum(net) as net
                                                                                        from so group by 1 order by 1 desc limit v_limit offset v_offset) t)
      else (select coalesce(jsonb_agg(jsonb_build_object('metric', m.metric, 'current', m.cur, 'previous', m.prev) order by m.ord), '[]'::jsonb)
              from (select 1 as ord, 'Orders' as metric, (select orders from cmpm where per = 'cur') as cur, (select orders from cmpm where per = 'prev') as prev
                    union all select 2, 'Net sales value', (select net from cmpm where per = 'cur'), (select net from cmpm where per = 'prev')
                    union all select 3, 'Items sold', (select qty from cmpm where per = 'cur'), (select qty from cmpm where per = 'prev')
                    union all select 4, 'Average order value', (select case when orders > 0 then net / orders end from cmpm where per = 'cur'), (select case when orders > 0 then net / orders end from cmpm where per = 'prev')
                    union all select 5, 'Customers', (select customers from cmpm where per = 'cur'), (select customers from cmpm where per = 'prev')
                    union all select 6, 'Returns', (select returns from cmpm where per = 'cur'), (select returns from cmpm where per = 'prev')) m) end,
    'compare_range', jsonb_build_object('cur_from', v_cfrom, 'cur_to', v_cto, 'prev_from', v_pfrom, 'prev_to', v_pto),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.categories),
    'kpi', jsonb_build_object(
      'orders', (select count(*) from so), 'sales', (select coalesce(sum(net), 0) from so), 'items_sold', (select coalesce(sum(qty), 0) from so),
      'avg', (select case when count(*) > 0 then sum(net) / count(*) end from so), 'customers', (select count(distinct cid) from so), 'return_orders', (select count(*) from so where returns > 0)),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'orders', orders, 'value', value) order by d), '[]'::jsonb) from trend),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'value', v) order by v desc), '[]'::jsonb) from (select channel, sum(net) as v from so group by channel) x where v > 0),
    'categories_value', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', v) order by v desc), '[]'::jsonb) from (select category_name as name, sum(qty * rate) as v from slq group by category_name) x where v > 0),
    'top_products', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select code, item_name, sum(qty) as qty, sum(qty * rate) as value from slq group by item_id, code, item_name order by sum(qty * rate) desc, code limit 5) t),
    'top_customers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select cname, count(*) as orders, sum(net) as value from so group by cid, cname order by sum(net) desc, cname limit 5) t),
    'top_cities', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select city, count(*) as orders, sum(net) as value from so group by city order by sum(net) desc, city limit 5) t))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.sales_report(text, text, text, uuid, text, date, date, int, int) from public, anon;
grant execute on function public.sales_report(text, text, text, uuid, text, date, date, int, int) to authenticated;
