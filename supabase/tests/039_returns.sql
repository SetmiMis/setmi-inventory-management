-- Test 039: customer returns (migration 49). Rolled back at the end. Makes its own users, place, customer, items and orders. Item codes start with RTX.
do $$
declare
  adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); appr uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  wh uuid; wh2 uuid; sup uuid; cu uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; o1 uuid; o2 uuid; o3 uuid; j uuid; cr uuid; r1 uuid; r2 uuid; r3 uuid; bal_a numeric; bal_b numeric; n_mov int;
begin
  insert into auth.users (id, email) values (adm,'a@r.l'),(mgr,'m@r.l'),(appr,'p@r.l'),(viewer,'v@r.l'),(nobody,'n@r.l'),(other,'o@r.l');
  update public.profiles set is_active = true where id in (adm, mgr, appr, viewer, nobody, other);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (mgr, 'returns.manage'), (mgr, 'sales_orders.view'), (mgr, 'items.view'),
    (appr, 'returns.approve'), (appr, 'sales_orders.view'), (appr, 'items.view'),
    (viewer, 'returns.view'), (viewer, 'sales_orders.view'), (viewer, 'items.view'),
    (other, 'returns.manage'), (other, 'sales_orders.view'), (other, 'items.view');
  insert into public.locations (code, name, type) values ('WHR', 'Warehouse RT', 'WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('WHS', 'Warehouse RU', 'WAREHOUSE') returning id into wh2;
  insert into public.user_locations values (mgr, wh), (appr, wh), (viewer, wh), (adm, wh), (other, wh2);
  insert into public.suppliers (name, supplier_type) values ('TEST RT SUP', 'LOCAL') returning id into sup;
  insert into public.customers (name, customer_type) values ('TEST RT CUSTOMER', 'DEALER') returning id into cu;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('RTX-A','rtx a','rtx a','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('RTX-B','rtx b','rtx b','LOCAL','MTR',10) returning id into ib;
  select id into cr from public.couriers where name = 'Blue Dart';

  -- stock, two dispatched orders and one that is only confirmed (admin does every step)
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 30, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 50, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'AMAZON'),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 5, 'rate', 10), jsonb_build_object('item_id', ib, 'quantity', 10.5, 'rate', 10)));
  o1 := (r->>'id')::uuid; perform public.confirm_sales_order(o1);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 3, 'rate', 10)));
  o2 := (r->>'id')::uuid; perform public.confirm_sales_order(o2);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'WEBSITE'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 10)));
  o3 := (r->>'id')::uuid; perform public.confirm_sales_order(o3);
  j := (public.start_picking(o1, 'HIGH')->>'id')::uuid; perform public.set_pick_quantity(j, ia, 5); perform public.set_pick_quantity(j, ib, 10.5);
  perform public.mark_packed(j, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B1'));
  perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'RTX-AWB-1'));
  j := (public.start_picking(o2, 'LOW')->>'id')::uuid; perform public.set_pick_quantity(j, ia, 3);
  perform public.mark_packed(j, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B2'));
  perform public.create_dispatch(o2, jsonb_build_object('courier_id', cr, 'awb', 'RTX-AWB-2'));
  reset role;
  select quantity into bal_a from public.stock_balances where item_id = ia and location_id = wh;
  select quantity into bal_b from public.stock_balances where item_id = ib and location_id = wh;

  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_return(o3, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1))); res := res || 'R1 return of an order not dispatched: FAIL' || E'\n';
  exception when others then res := res || 'R1 an order that is not dispatched cannot have a return: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 6))); res := res || 'R2 more than ordered: FAIL' || E'\n';
  exception when others then res := res || 'R2 returning more than was ordered is refused: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 1.2345))); res := res || 'R3 decimals: FAIL' || E'\n';
  exception when others then res := res || 'R3 too many decimals are refused: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'ROCKET'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1))); res := res || 'R4 bad reason: FAIL' || E'\n';
  exception when others then res := res || 'R4 an unknown reason is refused: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), '[]'::jsonb); res := res || 'R5 no items: FAIL' || E'\n';
  exception when others then res := res || 'R5 a return needs at least one item: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'condition', 'BROKEN'))); res := res || 'R6 bad condition: FAIL' || E'\n';
  exception when others then res := res || 'R6 an unknown condition is refused: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1), jsonb_build_object('item_id', ia, 'quantity', 1))); res := res || 'R7 same item twice: FAIL' || E'\n';
  exception when others then res := res || 'R7 the same item twice is refused: PASS' || E'\n'; end;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED', 'return_date', current_date + 2), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1))); res := res || 'R8 future date: FAIL' || E'\n';
  exception when others then res := res || 'R8 a future return date is refused: PASS' || E'\n'; end;
  r := public.create_return(o1, jsonb_build_object('reason', 'wrong_item', 'pickup_awb', 'PICK-1', 'remarks', 'customer says wrong'),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 3, 'condition', 'good'), jsonb_build_object('item_id', ib, 'quantity', 2.5, 'condition', 'damaged')));
  r1 := (r->>'id')::uuid;
  res := res || 'R9 a return is made (RT number, Pickup Pending, two lines, history): ' || case when (r->>'return_no') like 'RT-%' and (select status from public.sales_returns where id = r1) = 'PICKUP_PENDING'
    and (select count(*) from public.sales_return_lines where return_id = r1) = 2 and (select count(*) from public.sales_return_events where return_id = r1) = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 3))); res := res || 'R10 over what is left: FAIL' || E'\n';
  exception when others then res := res || 'R10 returning more than what is left (5 ordered, 3 already) is refused: PASS' || E'\n'; end;
  pg := public.return_order_items(o1);
  res := res || 'R11 remaining quantities: ' || case when (select (e->>'remaining')::numeric from jsonb_array_elements(pg) e where e->>'code' = 'RTX-A') = 2
    and (select (e->>'remaining')::numeric from jsonb_array_elements(pg) e where e->>'code' = 'RTX-B') = 8 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  res := res || 'R12 making a return does not move stock: ' || case when (select quantity from public.stock_balances where item_id = ia and location_id = wh) = bal_a
    and (select quantity from public.stock_balances where item_id = ib and location_id = wh) = bal_b then 'PASS' else 'FAIL' end || E'\n';

  -- permissions and place
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1))); res := res || 'R13 viewer makes return: FAIL' || E'\n';
  exception when others then res := res || 'R13 a viewer cannot make a return: PASS' || E'\n'; end;
  begin perform public.set_return_status(r1, 'IN_TRANSIT'); res := res || 'R14 viewer moves status: FAIL' || E'\n';
  exception when others then res := res || 'R14 a viewer cannot move a return: PASS' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',other,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_return(o2, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1))); res := res || 'R15 other place: FAIL' || E'\n';
  exception when others then res := res || 'R15 a person of another place cannot make a return: PASS' || E'\n'; end;
  reset role;

  -- moving forward
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.approve_return(r1); res := res || 'R16 manager approves: FAIL' || E'\n';
  exception when others then res := res || 'R16 a person without returns.approve cannot approve: PASS' || E'\n'; end;
  perform public.set_return_status(r1, 'IN_TRANSIT');
  begin perform public.set_return_status(r1, 'IN_TRANSIT'); res := res || 'R17 same status again: FAIL' || E'\n';
  exception when others then res := res || 'R17 a return cannot stay or go back: PASS' || E'\n'; end;
  begin perform public.set_return_status(r1, 'APPROVED'); res := res || 'R18 set approved by hand: FAIL' || E'\n';
  exception when others then res := res || 'R18 approving is not a plain status change: PASS' || E'\n'; end;
  perform public.set_return_status(r1, 'UNDER_INSPECTION');
  res := res || 'R19 moved to Under Inspection with history: ' || case when (select status from public.sales_returns where id = r1) = 'UNDER_INSPECTION' and (select count(*) from public.sales_return_events where return_id = r1) = 3 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- inspection and approval
  perform set_config('request.jwt.claims', json_build_object('sub',appr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.approve_return(r1); res := res || 'R20 approve without a resolution: FAIL' || E'\n';
  exception when others then res := res || 'R20 approving needs Refund or Replacement first: PASS' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.save_inspection(r1, jsonb_build_object('resolution', 'CASH'), null); res := res || 'R21 bad resolution: FAIL' || E'\n';
  exception when others then res := res || 'R21 an unknown resolution is refused: PASS' || E'\n'; end;
  begin perform public.save_inspection(r1, jsonb_build_object('resolution', 'REFUND'), jsonb_build_array(jsonb_build_object('item_id', ia, 'condition', 'NEW'))); res := res || 'R22 bad condition in inspection: FAIL' || E'\n';
  exception when others then res := res || 'R22 an unknown condition in the inspection is refused: PASS' || E'\n'; end;
  perform public.save_inspection(r1, jsonb_build_object('resolution', 'replacement', 'note', 'checked in the shop'), jsonb_build_array(jsonb_build_object('item_id', ia, 'condition', 'USED'), jsonb_build_object('item_id', ib, 'condition', 'GOOD')));
  res := res || 'R23 the inspection is saved: ' || case when (select resolution from public.sales_returns where id = r1) = 'REPLACEMENT'
    and (select condition from public.sales_return_lines where return_id = r1 and item_id = ia) = 'USED' and (select condition from public.sales_return_lines where return_id = r1 and item_id = ib) = 'GOOD' then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',appr,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.approve_return(r1);
  reset role;
  res := res || 'R24 approving puts only the GOOD item back (RTX-B 2.5, RTX-A stays out): ' || case when (select quantity from public.stock_balances where item_id = ib and location_id = wh) = bal_b + 2.5
    and (select quantity from public.stock_balances where item_id = ia and location_id = wh) = bal_a and (r->>'restocked_lines')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n_mov from public.stock_movements where reference = (select return_no from public.sales_returns where id = r1) and movement_type = 'SALE_RETURN' and to_location_id = wh;
  res := res || 'R25 one SALE_RETURN movement: ' || case when n_mov = 1 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'R26 the return is Approved with who and when: ' || case when (select status from public.sales_returns where id = r1) = 'APPROVED' and (select decided_by from public.sales_returns where id = r1) = appr then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',appr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.approve_return(r1); res := res || 'R27 approve twice: FAIL' || E'\n';
  exception when others then res := res || 'R27 a return cannot be approved twice: PASS' || E'\n'; end;
  begin perform public.reject_return(r1, 'too late'); res := res || 'R28 reject after approve: FAIL' || E'\n';
  exception when others then res := res || 'R28 an approved return cannot be rejected: PASS' || E'\n'; end;
  reset role;

  -- reject
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_return(o2, jsonb_build_object('reason', 'CHANGED_MIND'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 3)));
  r2 := (r->>'id')::uuid;
  reset role;
  select quantity into bal_a from public.stock_balances where item_id = ia and location_id = wh;
  perform set_config('request.jwt.claims', json_build_object('sub',appr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.reject_return(r2, ' '); res := res || 'R29 reject without a reason: FAIL' || E'\n';
  exception when others then res := res || 'R29 rejecting needs a reason: PASS' || E'\n'; end;
  perform public.reject_return(r2, 'Used by the customer');
  reset role;
  res := res || 'R30 reject leaves stock alone and sets the note: ' || case when (select status from public.sales_returns where id = r2) = 'REJECTED'
    and (select quantity from public.stock_balances where item_id = ia and location_id = wh) = bal_a and (select inspection_note from public.sales_returns where id = r2) = 'Used by the customer' then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_return(o2, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 3)));
  r3 := (r->>'id')::uuid;
  res := res || 'R31 a rejected return gives its quantity back to the order: ' || case when r3 is not null then 'PASS' else 'FAIL' end || E'\n';
  begin insert into public.sales_returns (order_id, location_id, return_date, reason) values (o2, wh, current_date, 'DAMAGED'); res := res || 'R32 direct insert: FAIL' || E'\n';
  exception when others then res := res || 'R32 no direct writes to returns: PASS' || E'\n'; end;
  reset role;

  -- the screen
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.returns_page(null, null, null, null, null, null, 100, 0);
  res := res || 'R33 the screen counts: ' || case when (pg->>'total')::int = 3 and (pg->'kpi'->>'approved')::int = 1 and (pg->'kpi'->>'rejected')::int = 1 and (pg->'kpi'->>'pickup_pending')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'R34 the order list holds dispatched orders only: ' || case when exists (select 1 from jsonb_array_elements(pg->'orders') e where e->>'order_id' = o1::text) and not exists (select 1 from jsonb_array_elements(pg->'orders') e where e->>'order_id' = o3::text) then 'PASS' else 'FAIL' end || E'\n';
  pg := public.returns_page(null, 'WRONG_ITEM', 'APPROVED', 'AMAZON', null, null, 10, 0);
  res := res || 'R35 filters (reason, status, channel): ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.returns_page('RTX-B', null, null, null, null, null, 10, 0);
  res := res || 'R36 search by item code: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.returns_page(null, 'NOPE', null, null, null, null, 10, 0); res := res || 'R37 bad filter: FAIL' || E'\n';
  exception when others then res := res || 'R37 an unknown filter is refused: PASS' || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.returns_page(null, null, null, null, null, null, 10, 0); res := res || 'R38 no permission: FAIL' || E'\n';
  exception when others then res := res || 'R38 a person without returns permission cannot open the screen: PASS' || E'\n'; end;
  reset role;

  raise exception E'RETURNS TEST RESULT\n%', res;
end $$;
