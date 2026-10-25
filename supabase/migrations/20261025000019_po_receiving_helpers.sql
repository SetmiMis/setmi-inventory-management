-- Two read-only helpers so warehouse staff (receipts.create, no purchase permissions) can receive against an order.
-- They show only what is needed to receive: no prices. Both check the permission and the place inside.

-- Open orders (SENT or PARTIAL) for the places the caller works in.
create or replace function public.receivable_purchase_orders()
returns table (id uuid, po_no text, supplier_id uuid, supplier_name text, location_id uuid, location_code text, expected_date date, status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('receipts.create') then
    raise exception 'missing permission: receipts.create' using errcode = '42501';
  end if;
  return query
    select o.id, o.po_no, o.supplier_id, s.name, o.location_id, l.code, o.expected_date, o.status::text
      from public.purchase_orders o
      join public.suppliers s on s.id = o.supplier_id
      join public.locations l on l.id = o.location_id
     where o.status in ('SENT', 'PARTIAL') and public.can_access_location(o.location_id)
     order by o.expected_date nulls last, o.created_at
     limit 200;
end $$;

-- The lines of one open order with what is still open to receive.
create or replace function public.purchase_order_open_lines(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.purchase_orders%rowtype; v_lines jsonb;
begin
  if not public.has_permission('receipts.create') then
    raise exception 'missing permission: receipts.create' using errcode = '42501';
  end if;
  select * into o from public.purchase_orders where id = p_id;
  if not found or not public.can_access_location(o.location_id) then
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

revoke all on function public.receivable_purchase_orders() from public, anon;
revoke all on function public.purchase_order_open_lines(uuid) from public, anon;
grant execute on function public.receivable_purchase_orders() to authenticated;
grant execute on function public.purchase_order_open_lines(uuid) to authenticated;
