-- Fix for 20261025000024 found by supabase/tests/016_stock_entries_and_reorder.sql: power(10, decimals)
-- returns double precision, so the suggested quantity did not match the declared numeric column.
create or replace function public.reorder_suggestions(p_location uuid default null, p_days integer default 30)
returns table (
  item_id uuid, internal_item_code text, item_name text, unit text,
  location_id uuid, location_code text,
  on_hand numeric, incoming_po numeric, incoming_transfer numeric,
  consumed numeric, avg_daily numeric, days_of_cover numeric,
  lead_time_days integer, safety_factor numeric, moq numeric, min_qty numeric, max_qty numeric,
  target numeric, target_source text, suggested numeric
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not (public.has_permission('stock.view') and public.has_permission('items.view')) then
    raise exception 'Reorder suggestions need the stock.view and items.view permissions' using errcode = 'P0001';
  end if;
  if p_days is null or p_days < 7 or p_days > 365 then
    raise exception 'Days must be between 7 and 365' using errcode = 'P0001';
  end if;
  return query
  with flow as (
    select m.item_id as fi, m.from_location_id as fl, sum(m.quantity) as q
      from public.stock_movements m
     where m.from_location_id is not null
       and m.movement_type in ('SALE', 'STOCK_OUT', 'TRANSFER')
       and m.created_at >= now() - make_interval(days => p_days)
     group by 1, 2
  ), back as (
    select m.item_id as bi, m.to_location_id as bl, sum(m.quantity) as q
      from public.stock_movements m
     where m.to_location_id is not null and m.movement_type = 'SALE_RETURN'
       and m.created_at >= now() - make_interval(days => p_days)
     group by 1, 2
  ), po as (
    select pl.item_id as pi, o.location_id as plo, sum(pl.quantity - pl.received_qty) as q
      from public.purchase_order_lines pl join public.purchase_orders o on o.id = pl.po_id
     where o.status in ('SENT', 'PARTIAL')
     group by 1, 2
  ), tr as (
    select tl.item_id as ti, t.to_location_id as tlo, sum(tl.quantity_sent) as q
      from public.stock_transfer_lines tl join public.stock_transfers t on t.id = tl.transfer_id
     where t.status = 'SENT'
     group by 1, 2
  ), base as (
    select so.item_id as b_item, so.internal_item_code as b_code, so.item_name as b_name, so.unit as b_unit,
           so.location_id as b_loc, l.code as b_loc_code, so.quantity as b_on_hand, so.min_qty as b_min, so.max_qty as b_max,
           i.lead_time_days as b_lead, i.safety_factor as b_safety, i.moq as b_moq, u.decimals as b_dec,
           coalesce(po.q, 0) as b_po, coalesce(tr.q, 0) as b_tr,
           greatest(coalesce(flow.q, 0) - coalesce(back.q, 0), 0) as b_consumed
      from public.stock_overview so
      join public.locations l on l.id = so.location_id
      join public.items i on i.id = so.item_id
      join public.units u on u.code = i.unit
      left join flow on flow.fi = so.item_id and flow.fl = so.location_id
      left join back on back.bi = so.item_id and back.bl = so.location_id
      left join po on po.pi = so.item_id and po.plo = so.location_id
      left join tr on tr.ti = so.item_id and tr.tlo = so.location_id
     where (p_location is null or so.location_id = p_location)
  ), calc as (
    select b.*, b.b_consumed / p_days as b_avg,
           case when b.b_lead is not null and b.b_consumed > 0 then (b.b_consumed / p_days) * b.b_lead * coalesce(b.b_safety, 1.5)
                when b.b_max is not null then b.b_max end as b_target,
           case when b.b_lead is not null and b.b_consumed > 0 then 'formula'
                when b.b_max is not null then 'max level' end as b_source
      from base b
  ), need as (
    select c.*, greatest(coalesce(c.b_target, 0) - (c.b_on_hand + c.b_po + c.b_tr), 0) as b_need
      from calc c
  )
  select n.b_item, n.b_code, n.b_name, n.b_unit, n.b_loc, n.b_loc_code,
         n.b_on_hand, n.b_po, n.b_tr,
         n.b_consumed, round(n.b_avg, 3),
         case when n.b_avg > 0 then round(n.b_on_hand / n.b_avg, 1) end,
         n.b_lead, n.b_safety, n.b_moq, n.b_min, n.b_max,
         round(n.b_target, 3), n.b_source,
         case when n.b_need <= 0 then 0
              when n.b_moq is not null then ceil(n.b_need / n.b_moq) * n.b_moq
              else ceil(n.b_need * power(10::numeric, n.b_dec)) / power(10::numeric, n.b_dec) end
    from need n
   where n.b_target is not null or n.b_consumed > 0
   order by 20 desc, n.b_loc_code, n.b_code
   limit 5000;
end $$;
