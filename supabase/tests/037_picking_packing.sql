-- Test 037: picking and packing (migration 47). Rolled back at the end. Makes its own users, place, customer, items and orders. Searches use the item code prefix PKX.
do $$
declare
  adm uuid := gen_random_uuid(); picker uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); seller uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; sup uuid; cu uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; o1 uuid; o2 uuid; o3 uuid; o4 uuid; j1 uuid; j2 uuid; bal_before numeric; bal_after numeric;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(picker,'p@t.l'),(viewer,'v@t.l'),(seller,'s@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, picker, viewer, seller, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (picker, 'picking.manage'), (picker, 'sales_orders.view'), (picker, 'items.view'),
    (viewer, 'picking.view'), (viewer, 'sales_orders.view'), (viewer, 'items.view'),
    (seller, 'sales_orders.create'), (seller, 'sales_orders.confirm'), (seller, 'sales_orders.view'), (seller, 'items.view');
  insert into public.locations (code, name, type) values ('WHK', 'Warehouse PK', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (picker, wh), (viewer, wh), (seller, wh);
  insert into public.suppliers (name, supplier_type) values ('TEST PK SUP', 'LOCAL') returning id into sup;
  insert into public.customers (name, customer_type) values ('TEST PK CUSTOMER', 'DEALER') returning id into cu;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PKX-A','pkx a','pkx a','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PKX-B','pkx b','pkx b','LOCAL','MTR',10) returning id into ib;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 5, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 50, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  reset role;
  select coalesce(sum(quantity), 0) into bal_before from public.stock_balances where location_id = wh;

  perform set_config('request.jwt.claims', json_build_object('sub',seller,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'AMAZON'),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 4, 'rate', 10), jsonb_build_object('item_id', ib, 'quantity', 10.5, 'rate', 10)));
  o1 := (r->>'id')::uuid; perform public.confirm_sales_order(o1);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT', 'order_date', current_date - 10, 'expected_dispatch', current_date - 5),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 10)));
  o2 := (r->>'id')::uuid; perform public.confirm_sales_order(o2);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'WEBSITE'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 10)));
  o3 := (r->>'id')::uuid;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',picker,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.start_picking(o3, 'HIGH'); res := res || 'K1 start on a pending order: FAIL' || E'\n';
  exception when others then res := res || 'K1 an order that is not confirmed cannot be picked: PASS' || E'\n'; end;
  r := public.start_picking(o1, 'high'); j1 := (r->>'id')::uuid;
  res := res || 'K2 starting makes a job and the order becomes In Packing: ' || case when (select status from public.pick_pack_jobs where id = j1) = 'IN_PICKING' and (select status from public.sales_orders where id = o1) = 'IN_PACKING'
    and (select count(*) from public.pick_pack_lines where job_id = j1) = 2 and (select priority from public.pick_pack_jobs where id = j1) = 'HIGH' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.start_picking(o1, 'HIGH'); res := res || 'K3 start twice: FAIL' || E'\n';
  exception when others then res := res || 'K3 an order cannot be started twice: PASS' || E'\n'; end;
  begin perform public.set_pick_quantity(j1, ia, 5); res := res || 'K4 pick more than ordered: FAIL' || E'\n';
  exception when others then res := res || 'K4 picking more than ordered is refused: PASS' || E'\n'; end;
  begin perform public.set_pick_quantity(j1, ib, 10.55); res := res || 'K5 too many decimals: FAIL' || E'\n';
  exception when others then res := res || 'K5 too many decimals are refused: PASS' || E'\n'; end;
  begin perform public.set_pick_quantity(j1, ia, -1); res := res || 'K6 negative: FAIL' || E'\n';
  exception when others then res := res || 'K6 a negative quantity is refused: PASS' || E'\n'; end;
  perform public.set_pick_quantity(j1, ia, 4);
  res := res || 'K7 one line done, the job still picks: ' || case when (select status from public.pick_pack_jobs where id = j1) = 'IN_PICKING' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.mark_packed(j1, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B1')); res := res || 'K8 pack before everything is picked: FAIL' || E'\n';
  exception when others then res := res || 'K8 packing needs everything picked: PASS' || E'\n'; end;
  perform public.set_pick_quantity(j1, ib, 10.5);
  res := res || 'K9 all lines picked moves the job to In Packing: ' || case when (select status from public.pick_pack_jobs where id = j1) = 'IN_PACKING' and (select picked_at from public.pick_pack_jobs where id = j1) is not null then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.mark_packed(j1, jsonb_build_object('packing_type', 'CRATE', 'box_no', 'B1')); res := res || 'K10 unknown packing type: FAIL' || E'\n';
  exception when others then res := res || 'K10 an unknown packing type is refused: PASS' || E'\n'; end;
  begin perform public.mark_packed(j1, jsonb_build_object('packing_type', 'BOX')); res := res || 'K11 no box number: FAIL' || E'\n';
  exception when others then res := res || 'K11 the box number is needed: PASS' || E'\n'; end;
  perform public.mark_packed(j1, jsonb_build_object('packing_type', 'box', 'box_no', 'BX-1', 'weight_kg', 3.5, 'dim_l', 30, 'dim_w', 20, 'dim_h', 10, 'remarks', 'fragile'));
  res := res || 'K12 packing makes the job Ready with its details: ' || case when (select status from public.pick_pack_jobs where id = j1) = 'READY' and (select box_no from public.pick_pack_jobs where id = j1) = 'BX-1' and (select weight_kg from public.pick_pack_jobs where id = j1) = 3.5 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.set_pick_quantity(j1, ia, 1); res := res || 'K13 change picking after it is finished: FAIL' || E'\n';
  exception when others then res := res || 'K13 picking cannot change after it is finished: PASS' || E'\n'; end;

  -- stock shortage: only 5 of A exist, an order for 8 cannot be fully picked
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',seller,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'MEESHO'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 8, 'rate', 10)));
  o4 := (r->>'id')::uuid; perform public.confirm_sales_order(o4);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',picker,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.start_picking(o4, 'LOW'); j2 := (r->>'id')::uuid;
  begin perform public.set_pick_quantity(j2, ia, 6); res := res || 'K14 pick more than the stock: FAIL' || E'
';
  exception when others then res := res || 'K14 picking more than the stock in the place is refused: PASS' || E'
'; end;
  perform public.cancel_picking(j2);
  res := res || 'K15 giving up puts the order back to Confirmed: ' || case when (select status from public.sales_orders where id = o4) = 'CONFIRMED' and (select status from public.pick_pack_jobs where id = j2) = 'CANCELLED' then 'PASS' else 'FAIL' end || E'
';
  r := public.start_picking(o4, 'MEDIUM');
  res := res || 'K16 after giving up the order can be started again: PASS' || E'
';
  r := public.start_picking(o2, 'MEDIUM');

  pg := public.picking_page('pkx', null, null, null, null, null, 20, 0);
  res := res || 'K17 the screen lists the orders being worked on (' || (pg->>'total') || ', want 3: o1, o2, o4): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'
';
  pg := public.picking_page('pkx', null, null, 'READY', null, null, 20, 0);
  res := res || 'K18 stage filter Ready finds the packed order: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'order_id')::uuid = o1 and (pg->'rows'->0->>'picked_items')::int = 2 then 'PASS' else 'FAIL' end || E'
';
  pg := public.picking_page('pkx', null, null, 'DELAYED', null, null, 20, 0);
  res := res || 'K19 the late order shows as Delayed: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'order_id')::uuid = o2 then 'PASS' else 'FAIL' end || E'
';
  pg := public.picking_page('pkx', null, 'MEESHO', 'IN_PICKING', null, null, 20, 0);
  res := res || 'K20 channel + stage filters: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'order_id')::uuid = o4 then 'PASS' else 'FAIL' end || E'
';
  pg := public.picking_page(null, null, null, null, null, null, 5, 0);
  res := res || 'K21 numbers, channels and recent activity are there: ' || case when pg->'kpi' ?& array['total','pending','in_picking','in_packing','ready','dispatched','delayed'] and jsonb_array_length(pg->'channels') >= 1
    and jsonb_array_length(pg->'recent') >= 1 and (pg->'kpi'->>'ready')::int >= 1 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'
';
  pg := public.picking_page('%', null, null, null, null, null, 5, 0);
  res := res || 'K22 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'
';
  begin perform public.picking_page(null, null, null, 'MOON', null, null, 5, 0); res := res || 'K23 bad status: FAIL' || E'
';
  exception when others then res := res || 'K23 a bad stage filter is refused: PASS' || E'
'; end;
  begin insert into public.pick_pack_lines (job_id, item_id, required) values (j1, ia, 1); res := res || 'K24 direct write: FAIL' || E'
';
  exception when others then res := res || 'K24 no direct table writes: PASS' || E'
'; end;
  reset role;

  select coalesce(sum(quantity), 0) into bal_after from public.stock_balances where location_id = wh;
  res := res || 'K25 picking and packing do not change stock (' || bal_before || ' -> ' || bal_after || '): ' || case when bal_before = bal_after then 'PASS' else 'FAIL' end || E'
';

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.picking_page('pkx', null, null, null, null, null, 20, 0);
  res := res || 'K26 a viewer sees the jobs (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'
';
  begin perform public.start_picking(o3, 'LOW'); res := res || 'K27 viewer starts picking: FAIL' || E'
';
  exception when insufficient_privilege then res := res || 'K27 a viewer cannot start picking: PASS' || E'
'; end;
  begin perform public.set_pick_quantity(j1, ia, 1); res := res || 'K28 viewer picks: FAIL' || E'
';
  exception when insufficient_privilege then res := res || 'K28 a viewer cannot pick: PASS' || E'
'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.picking_page(null, null, null, null, null, null, 10, 0); res := res || 'K29 stranger: FAIL' || E'
';
  exception when insufficient_privilege then res := res || 'K29 a user without picking rights is refused: PASS' || E'
'; end;
  reset role;
  set local role anon;
  begin perform public.mark_packed(j1, '{}'::jsonb); res := res || 'K30 anonymous packs: FAIL' || E'
';
  exception when insufficient_privilege then res := res || 'K30 anonymous cannot pack: PASS' || E'
'; end;
  reset role;
  raise exception E'TEST 037 RESULTS (rolled back):
%', res;
end $$;
