-- One row per (active item, active location): current quantity, minimum level, low-stock flag.
-- security_invoker = the viewer's own rights and Row Level Security apply, so a user only gets
-- rows for the places they work in. The has_permission line stops a user who may see items but
-- not stock from seeing a misleading list of zeros.
create view public.stock_overview with (security_invoker = true) as
select i.id as item_id,
       i.internal_item_code,
       i.item_name,
       i.selling_item_name,
       i.unit,
       l.id as location_id,
       coalesce(b.quantity, 0) as quantity,
       rl.min_qty,
       rl.max_qty,
       (rl.min_qty is not null and rl.min_qty > 0 and coalesce(b.quantity, 0) < rl.min_qty) as is_low
from public.items i
cross join public.locations l
left join public.stock_balances b on b.item_id = i.id and b.location_id = l.id
left join public.reorder_levels rl on rl.item_id = i.id and rl.location_id = l.id
where i.is_active and l.is_active and (select public.has_permission('stock.view'));

revoke all on public.stock_overview from public, anon;
grant select on public.stock_overview to authenticated;
