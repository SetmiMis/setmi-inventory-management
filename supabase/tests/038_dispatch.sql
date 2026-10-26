-- Test 038: dispatch (migration 48). Rolled back at the end. Makes its own users, place, customer, items and orders. Item codes start with DPX.
do $$
declare
  adm uuid := gen_random_uuid(); disp uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  wh uuid; wh2 uuid; sup uuid; cu uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; o1 uuid; o2 uuid; o3 uuid; j1 uuid; j2 uuid; d1 uuid; d2 uuid; cr uuid; cr2 uuid;
  bal_a numeric; bal_b numeric; n_mov int;
begin
  insert into auth.users (id, email) values (adm,'a@d.l'),(disp,'d@d.l'),(viewer,'v@d.l'),(nobody,'n@d.l'),(other,'o@d.l');
  update public.profiles set is_active = true where id in (adm, disp, viewer, nobody, other);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (disp, 'dispatch.manage'), (disp, 'picking.manage'), (disp, 'sales_orders.view'), (disp, 'items.view'),
    (viewer, 'dispatch.view'), (viewer, 'picking.view'), (viewer, 'sales_orders.view'), (viewer, 'items.view'),
    (other, 'dispatch.manage'), (other, 'picking.view'), (other, 'sales_orders.view'), (other, 'items.view');
  insert into public.locations (code, name, type) values ('WHD', 'Warehouse DP', 'WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('WHE', 'Warehouse DQ', 'WAREHOUSE') returning id into wh2;
  insert into public.user_locations values (disp, wh), (viewer, wh), (adm, wh), (other, wh2);
  insert into public.suppliers (name, supplier_type) values ('TEST DP SUP', 'LOCAL') returning id into sup;
  insert into public.customers (name, customer_type) values ('TEST DP CUSTOMER', 'DEALER') returning id into cu;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('DPX-A','dpx a','dpx a','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('DPX-B','dpx b','dpx b','LOCAL','MTR',10) returning id into ib;
  select id into cr from public.couriers where name = 'Blue Dart';
  select id into cr2 from public.couriers where name = 'Delhivery';

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 20, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 50, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'AMAZON'),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 4, 'rate', 10), jsonb_build_object('item_id', ib, 'quantity', 10.5, 'rate', 10)));
  o1 := (r->>'id')::uuid; perform public.confirm_sales_order(o1);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 2, 'rate', 10)));
  o2 := (r->>'id')::uuid; perform public.confirm_sales_order(o2);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'WEBSITE'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 10)));
  o3 := (r->>'id')::uuid; perform public.confirm_sales_order(o3);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  j1 := (public.start_picking(o1, 'HIGH')->>'id')::uuid;
  perform public.set_pick_quantity(j1, ia, 4); perform public.set_pick_quantity(j1, ib, 10.5);
  j2 := (public.start_picking(o2, 'LOW')->>'id')::uuid;
  perform public.set_pick_quantity(j2, ia, 2);
  perform public.mark_packed(j2, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B2'));
  reset role;
  select quantity into bal_a from public.stock_balances where item_id = ia and location_id = wh;
  select quantity into bal_b from public.stock_balances where item_id = ib and location_id = wh;

  -- D1: an order that is not packed cannot be dispatched
  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'AWB-1001')); res := res || 'D1 dispatch before packing: FAIL' || E'\n';
  exception when others then res := res || 'D1 an order that is not packed cannot be dispatched: PASS' || E'\n'; end;
  perform public.mark_packed(j1, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B1'));
  reset role;

  -- D2/D3: permissions
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'AWB-1001')); res := res || 'D2 viewer dispatches: FAIL' || E'\n';
  exception when others then res := res || 'D2 a viewer cannot dispatch: PASS' || E'\n'; end;
  begin perform public.add_courier('Viewer Courier'); res := res || 'D3 viewer adds courier: FAIL' || E'\n';
  exception when others then res := res || 'D3 a viewer cannot add a courier: PASS' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',other,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'AWB-1001')); res := res || 'D4 other place dispatches: FAIL' || E'\n';
  exception when others then res := res || 'D4 a person of another place cannot dispatch: PASS' || E'\n'; end;
  reset role;

  -- validations
  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', '')); res := res || 'D5 no AWB: FAIL' || E'\n';
  exception when others then res := res || 'D5 the AWB is required: PASS' || E'\n'; end;
  begin perform public.create_dispatch(o1, jsonb_build_object('awb', 'AWB-1001')); res := res || 'D6 no courier: FAIL' || E'\n';
  exception when others then res := res || 'D6 the courier is required: PASS' || E'\n'; end;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'AWB-1001', 'dispatch_date', current_date + 3)); res := res || 'D7 future date: FAIL' || E'\n';
  exception when others then res := res || 'D7 a future dispatch date is refused: PASS' || E'\n'; end;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'AWB-1001', 'service_type', 'ROCKET')); res := res || 'D8 bad service type: FAIL' || E'\n';
  exception when others then res := res || 'D8 an unknown service type is refused: PASS' || E'\n'; end;
  reset role;

  -- D9: dispatching takes the stock out
  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'service_type', 'surface', 'awb', 'AWB-1001', 'insurance', true, 'pickup_ref', 'PK-1'));
  d1 := (r->>'id')::uuid;
  reset role;
  res := res || 'D9 stock goes out at dispatch: ' || case when (select quantity from public.stock_balances where item_id = ia and location_id = wh) = bal_a - 4
    and (select quantity from public.stock_balances where item_id = ib and location_id = wh) = bal_b - 10.5 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n_mov from public.stock_movements where reference = (select order_no from public.sales_orders where id = o1) and movement_type = 'SALE' and from_location_id = wh;
  res := res || 'D10 one SALE movement per item: ' || case when n_mov = 2 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'D11 the order is Dispatched with the date; the dispatch is Dispatched: ' || case when (select status from public.sales_orders where id = o1) = 'DISPATCHED'
    and (select dispatch_date from public.sales_orders where id = o1) = current_date and (select status from public.dispatches where id = d1) = 'DISPATCHED'
    and (select service_type from public.dispatches where id = d1) = 'SURFACE' then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'AWB-2002')); res := res || 'D12 dispatch twice: FAIL' || E'\n';
  exception when others then res := res || 'D12 an order cannot be dispatched twice: PASS' || E'\n'; end;
  begin perform public.create_dispatch(o2, jsonb_build_object('courier_id', cr, 'awb', 'awb-1001')); res := res || 'D13 same AWB twice: FAIL' || E'\n';
  exception when others then res := res || 'D13 the same AWB cannot be used twice for a courier: PASS' || E'\n'; end;
  reset role;

  -- D14: not enough stock now (someone sold it elsewhere)
  select quantity into bal_a from public.stock_balances where item_id = ia and location_id = wh;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason) values (ia, wh, null, bal_a, 'SALE', 'test drain');
  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_dispatch(o2, jsonb_build_object('courier_id', cr, 'awb', 'AWB-3003')); res := res || 'D14 dispatch without stock: FAIL' || E'\n';
  exception when others then res := res || 'D14 dispatch without enough stock is refused: PASS' || E'\n'; end;
  reset role;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason) values (ia, null, wh, bal_a, 'ADJUSTMENT', 'test refill');

  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_dispatch(o2, jsonb_build_object('courier_id', cr2, 'awb', 'AWB-1001'));
  d2 := (r->>'id')::uuid;
  res := res || 'D15 the same AWB at another courier is fine: ' || case when d2 is not null then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- status changes do not touch stock
  select quantity into bal_a from public.stock_balances where item_id = ia and location_id = wh;
  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.set_dispatch_status(d1, 'DISPATCHED'); res := res || 'D16 bad status: FAIL' || E'\n';
  exception when others then res := res || 'D16 a status that cannot be set is refused: PASS' || E'\n'; end;
  perform public.set_dispatch_status(d1, 'IN_TRANSIT');
  perform public.set_dispatch_status(d1, 'OUT_FOR_DELIVERY');
  perform public.set_dispatch_status(d1, 'DELIVERY_FAILED');
  res := res || 'D17 failed delivery keeps a date and the parcel can go out again: ' || case when (select delivery_date from public.dispatches where id = d1) = current_date then 'PASS' else 'FAIL' end || E'\n';
  perform public.set_dispatch_status(d1, 'OUT_FOR_DELIVERY');
  res := res || 'D18 out for delivery clears the date: ' || case when (select delivery_date from public.dispatches where id = d1) is null then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.set_dispatch_status(d1, 'DELIVERED', current_date - 5); res := res || 'D19 delivered before dispatch: FAIL' || E'\n';
  exception when others then res := res || 'D19 a delivery date before the dispatch date is refused: PASS' || E'\n'; end;
  perform public.set_dispatch_status(d1, 'DELIVERED');
  res := res || 'D20 delivered: ' || case when (select status from public.dispatches where id = d1) = 'DELIVERED' and (select delivery_date from public.dispatches where id = d1) = current_date then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.set_dispatch_status(d1, 'IN_TRANSIT'); res := res || 'D21 change after delivered: FAIL' || E'\n';
  exception when others then res := res || 'D21 a delivered parcel cannot be changed: PASS' || E'\n'; end;
  begin perform public.update_dispatch(d1, jsonb_build_object('awb', 'AWB-9999')); res := res || 'D22 edit after delivered: FAIL' || E'\n';
  exception when others then res := res || 'D22 a delivered parcel cannot be edited: PASS' || E'\n'; end;
  perform public.update_dispatch(d2, jsonb_build_object('courier_id', cr, 'awb', 'AWB-4004', 'service_type', 'EXPRESS', 'insurance', false, 'remarks', 'fixed'));
  res := res || 'D23 the courier details can be fixed before delivery: ' || case when (select awb from public.dispatches where id = d2) = 'AWB-4004' and (select courier_id from public.dispatches where id = d2) = cr then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.update_dispatch(d2, jsonb_build_object('courier_id', cr, 'awb', 'AWB-1001')); res := res || 'D24 edit to a used AWB: FAIL' || E'\n';
  exception when others then res := res || 'D24 editing to an AWB that is used is refused: PASS' || E'\n'; end;
  perform public.set_dispatch_status(d2, 'RTO');
  res := res || 'D25 RTO is final: ' || case when (select status from public.dispatches where id = d2) = 'RTO' then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  res := res || 'D26 status changes and RTO did not move stock: ' || case when (select quantity from public.stock_balances where item_id = ia and location_id = wh) = bal_a then 'PASS' else 'FAIL' end || E'\n';

  -- couriers
  perform set_config('request.jwt.claims', json_build_object('sub',disp,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.add_courier('  Test Courier Z ');
  begin perform public.add_courier('test courier z'); res := res || 'D27 duplicate courier: FAIL' || E'\n';
  exception when others then res := res || 'D27 a courier name cannot be added twice: PASS' || E'\n'; end;
  begin perform public.add_courier('x'); res := res || 'D28 one-letter courier: FAIL' || E'\n';
  exception when others then res := res || 'D28 a too short courier name is refused: PASS' || E'\n'; end;
  begin insert into public.dispatches (order_id, location_id, dispatch_date, courier_id, awb) values (o3, wh, current_date, cr, 'AWB-DIRECT'); res := res || 'D29 direct insert: FAIL' || E'\n';
  exception when others then res := res || 'D29 no direct writes to dispatches: PASS' || E'\n'; end;
  reset role;

  -- the screen
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.dispatch_page(null, null, null, null, null, 100, 0);
  res := res || 'D30 the screen lists both dispatches and the status counts: ' || case when (pg->'kpi'->>'delivered')::int >= 1 and (pg->'kpi'->>'rto')::int >= 1 and (pg->>'total')::int >= 2 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'D31 the ready list does not hold dispatched orders: ' || case when not exists (select 1 from jsonb_array_elements(pg->'ready') e where e->>'order_id' = o1::text) then 'PASS' else 'FAIL' end || E'\n';
  pg := public.dispatch_page('AWB-4004', null, null, null, null, 10, 0);
  res := res || 'D32 search by AWB: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.dispatch_page(null, null, 'DELIVERED', null, null, 100, 0);
  res := res || 'D33 filter by status: ' || case when (pg->>'total')::int >= 1 and not exists (select 1 from jsonb_array_elements(pg->'rows') e where e->>'status' <> 'DELIVERED') then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.dispatch_page(null, null, 'NOPE', null, null, 10, 0); res := res || 'D34 bad status filter: FAIL' || E'\n';
  exception when others then res := res || 'D34 an unknown status filter is refused: PASS' || E'\n'; end;
  begin perform public.set_dispatch_status(d2, 'IN_TRANSIT'); res := res || 'D35 viewer changes status: FAIL' || E'\n';
  exception when others then res := res || 'D35 a viewer cannot change a status: PASS' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.dispatch_page(null, null, null, null, null, 10, 0); res := res || 'D36 no permission: FAIL' || E'\n';
  exception when others then res := res || 'D36 a person without dispatch permission cannot open the screen: PASS' || E'\n'; end;
  reset role;

  raise exception E'DISPATCH TEST RESULT\n%', res;
end $$;
