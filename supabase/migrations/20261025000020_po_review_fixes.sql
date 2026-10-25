-- Fixes found by the independent review of the purchase order migrations (17-19):
-- 1. People who only hold purchase permissions could not read suppliers (empty supplier list on a new order,
--    no supplier name or address on the order and its print). The supplier read rule now also admits them.
-- 2. purchase_order_open_lines answered for any status, so a warehouse user who knew the id of a DRAFT,
--    CANCELLED or closed order could read its item lines. It now answers only for SENT or PARTIAL orders.

drop policy suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using ((select public.has_permission('suppliers.view')) or (select public.has_permission('receipts.view'))
         or (select public.has_permission('receipts.create')) or (select public.has_permission('receipts.post'))
         or (select public.has_permission('purchase.view')) or (select public.has_permission('purchase.create'))
         or (select public.has_permission('purchase.approve')));

create or replace function public.purchase_order_open_lines(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.purchase_orders%rowtype; v_lines jsonb;
begin
  if not public.has_permission('receipts.create') then
    raise exception 'missing permission: receipts.create' using errcode = '42501';
  end if;
  select * into o from public.purchase_orders where id = p_id;
  if not found or not public.can_access_location(o.location_id) or o.status not in ('SENT', 'PARTIAL') then
    raise exception 'purchase order not found';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'code', i.internal_item_code, 'name', i.item_name, 'unit', i.unit, 'decimals', u.decimals,
           'open', l.quantity - l.received_qty) order by l.id), '[]'::jsonb)
    into v_lines
    from public.purchase_order_lines l
    join public.items i on i.id = l.item_id
    join public.units u on u.code = i.unit
   where l.po_id = p_id and l.quantity > l.received_qty and i.is_active;
  return jsonb_build_object('id', o.id, 'po_no', o.po_no, 'status', o.status, 'supplier_id', o.supplier_id,
                            'location_id', o.location_id, 'lines', v_lines);
end $$;
