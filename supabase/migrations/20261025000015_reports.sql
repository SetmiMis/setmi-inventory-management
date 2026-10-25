-- P8: reports. Read-only. Every function runs as the CALLER (security invoker), so the existing
-- row level security still decides which places and bills the person can see. On top of that a
-- person needs the new permission reports.view. No purchase cost is used anywhere.

insert into public.permissions (key, module, description) values
  ('reports.view',   'reports', 'Open the reports screens (rows still limited to your places)'),
  ('reports.export', 'reports', 'Download a report as a CSV file');

-- Row cap so one report can never return an unbounded amount of data.
-- 1. Stock of every item in every place the person can see, plus stock on its way to that place.
create or replace function public.report_stock_by_place(p_location uuid default null)
returns table (
  location_id uuid, location_code text, location_name text,
  item_id uuid, internal_item_code text, item_name text, unit text,
  quantity numeric, in_transit_to_here numeric, min_qty numeric, is_low boolean
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('reports.view') then
    raise exception 'You do not have access to reports' using errcode = 'P0001';
  end if;
  return query
    select so.location_id, l.code, l.name, so.item_id, so.internal_item_code, so.item_name, so.unit,
           so.quantity,
           coalesce((select sum(tl.quantity_sent) from public.stock_transfer_lines tl
                      join public.stock_transfers t on t.id = tl.transfer_id
                     where t.status = 'SENT' and t.to_location_id = so.location_id and tl.item_id = so.item_id), 0),
           so.min_qty, so.is_low
      from public.stock_overview so
      join public.locations l on l.id = so.location_id
     where (p_location is null or so.location_id = p_location)
       and (so.quantity > 0 or so.is_low)
     order by l.code, so.internal_item_code
     limit 20000;
end $$;

-- 2. Items at or below their minimum level.
create or replace function public.report_low_stock(p_location uuid default null)
returns table (
  location_code text, location_name text, internal_item_code text, item_name text, unit text,
  quantity numeric, min_qty numeric, shortfall numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('reports.view') then
    raise exception 'You do not have access to reports' using errcode = 'P0001';
  end if;
  return query
    select l.code, l.name, so.internal_item_code, so.item_name, so.unit, so.quantity, so.min_qty,
           greatest(so.min_qty - so.quantity, 0)
      from public.stock_overview so
      join public.locations l on l.id = so.location_id
     where so.is_low and (p_location is null or so.location_id = p_location)
     order by greatest(so.min_qty - so.quantity, 0) desc, l.code, so.internal_item_code
     limit 20000;
end $$;

-- 3. Sales per day and place (India time). Voided bills are not counted.
create or replace function public.report_sales_by_day(p_from date, p_to date, p_location uuid default null)
returns table (
  sale_date date, location_code text, location_name text, bills bigint,
  subtotal numeric, discount numeric, total numeric,
  cash numeric, upi numeric, card numeric, other numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('reports.view') then
    raise exception 'You do not have access to reports' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a date range of at most one year' using errcode = 'P0001';
  end if;
  return query
    select (b.created_at at time zone 'Asia/Kolkata')::date, b.location_code, b.location_name, count(*),
           sum(b.subtotal), sum(b.discount), sum(b.total),
           coalesce(sum(b.total) filter (where b.payment_mode = 'CASH'), 0),
           coalesce(sum(b.total) filter (where b.payment_mode = 'UPI'), 0),
           coalesce(sum(b.total) filter (where b.payment_mode = 'CARD'), 0),
           coalesce(sum(b.total) filter (where b.payment_mode = 'OTHER'), 0)
      from public.bills b
     where b.status = 'COMPLETED'
       and (b.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
       and (p_location is null or b.location_id = p_location)
     group by 1, b.location_code, b.location_name
     order by 1 desc, b.location_code
     limit 20000;
end $$;

-- 4. What sold: per item quantity and amount, using the name and price saved on the bill.
create or replace function public.report_sales_by_item(p_from date, p_to date, p_location uuid default null)
returns table (
  item_code text, item_name text, unit text, quantity numeric, amount numeric, bills bigint
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('reports.view') then
    raise exception 'You do not have access to reports' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a date range of at most one year' using errcode = 'P0001';
  end if;
  return query
    select bl.item_code, max(bl.item_name), max(bl.unit), sum(bl.quantity), sum(bl.line_total), count(distinct bl.bill_id)
      from public.bill_lines bl
      join public.bills b on b.id = bl.bill_id
     where b.status = 'COMPLETED'
       and (b.created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
       and (p_location is null or b.location_id = p_location)
     group by bl.item_code
     order by sum(bl.line_total) desc, bl.item_code
     limit 20000;
end $$;

-- 5. Slow or dead stock: stock on hand but no sale from that place in the last N days.
create or replace function public.report_dead_stock(p_days integer default 90, p_location uuid default null)
returns table (
  location_code text, location_name text, internal_item_code text, item_name text, unit text,
  quantity numeric, last_sale date
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.has_permission('reports.view') then
    raise exception 'You do not have access to reports' using errcode = 'P0001';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Days must be between 1 and 3650' using errcode = 'P0001';
  end if;
  return query
    select l.code, l.name, so.internal_item_code, so.item_name, so.unit, so.quantity,
           (select (max(m.created_at) at time zone 'Asia/Kolkata')::date from public.stock_movements m
             where m.item_id = so.item_id and m.from_location_id = so.location_id and m.movement_type = 'SALE')
      from public.stock_overview so
      join public.locations l on l.id = so.location_id
     where so.quantity > 0
       and (p_location is null or so.location_id = p_location)
       and not exists (select 1 from public.stock_movements m
                        where m.item_id = so.item_id and m.from_location_id = so.location_id
                          and m.movement_type = 'SALE' and m.created_at >= now() - make_interval(days => p_days))
     order by so.quantity desc, l.code, so.internal_item_code
     limit 20000;
end $$;

revoke all on function public.report_stock_by_place(uuid) from public, anon;
revoke all on function public.report_low_stock(uuid) from public, anon;
revoke all on function public.report_sales_by_day(date, date, uuid) from public, anon;
revoke all on function public.report_sales_by_item(date, date, uuid) from public, anon;
revoke all on function public.report_dead_stock(integer, uuid) from public, anon;
grant execute on function public.report_stock_by_place(uuid) to authenticated;
grant execute on function public.report_low_stock(uuid) to authenticated;
grant execute on function public.report_sales_by_day(date, date, uuid) to authenticated;
grant execute on function public.report_sales_by_item(date, date, uuid) to authenticated;
grant execute on function public.report_dead_stock(integer, uuid) to authenticated;
