-- Test 036: sales orders (migration 46). Staff also have items.view (item names and the item search come from the item list). Rolled back at the end. Makes its own users, place, customers and items. Searches use the item code prefix SOX.
do $$
declare
  creator uuid := gen_random_uuid(); boss uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; cu uuid; cu_off uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; o1 uuid; o2 uuid; o3 uuid; bal_before numeric; bal_after numeric;
begin
  insert into auth.users (id, email) values (creator,'c@t.l'),(boss,'b@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (creator, boss, viewer, nobody);
  insert into public.user_permissions (user_id, permission_key) values
    (creator, 'sales_orders.create'), (creator, 'sales_orders.view'), (creator, 'items.view'), (boss, 'sales_orders.confirm'), (boss, 'sales_orders.view'), (boss, 'items.view'),
    (viewer, 'sales_orders.view'), (viewer, 'items.view');
  insert into public.locations (code, name, type) values ('WHO', 'Warehouse SO', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (creator, wh), (boss, wh), (viewer, wh);
  insert into public.customers (name, customer_type) values ('TEST SO CUSTOMER', 'DEALER') returning id into cu;
  insert into public.customers (name, customer_type, is_active) values ('TEST SO OFF', 'DEALER', false) returning id into cu_off;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('SOX-A','sox a','sox a','LOCAL','PCS',25) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('SOX-B','sox b','sox b','LOCAL','PCS',120) returning id into ib;
  select coalesce(sum(quantity), 0) into bal_before from public.stock_balances where item_id = ia;

  perform set_config('request.jwt.claims', json_build_object('sub',creator,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'amazon', 'shipping_address', 'Delhi', 'discount', 100, 'shipping_charges', 50),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 50, 'rate', 25), jsonb_build_object('item_id', ib, 'quantity', 20, 'rate', 120)));
  o1 := (r->>'id')::uuid;
  res := res || 'O1 an order gets a number (' || (r->>'order_no') || ') and waits: ' || case when (r->>'order_no') ~ '^SO-[0-9]{4}-[0-9]{4,}$' and (select status from public.sales_orders where id = o1) = 'PENDING' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_orders_page('sox', null, null, null, null, null, 10, 0);
  res := res || 'O2 value = 1250 + 2400 - 100 + 50 = 3600 (' || coalesce(pg->'rows'->0->>'total', '?') || '), 2 items: ' || case when (pg->'rows'->0->>'total')::numeric = 3600 and (pg->'rows'->0->>'items')::int = 2 and (pg->'rows'->0->>'channel') = 'AMAZON' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT', 'discount', 99999), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 25)));
    res := res || 'O3 discount more than the items: FAIL' || E'\n';
  exception when others then res := res || 'O3 a discount bigger than the items total is refused: PASS' || E'\n'; end;
  begin perform public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 25), jsonb_build_object('item_id', ia, 'quantity', 2, 'rate', 25)));
    res := res || 'O4 same item twice: FAIL' || E'\n';
  exception when others then res := res || 'O4 the same item twice is refused: PASS' || E'\n'; end;
  begin perform public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'TELEPATHY'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 25)));
    res := res || 'O5 unknown channel: FAIL' || E'\n';
  exception when others then res := res || 'O5 an unknown channel is refused: PASS' || E'\n'; end;
  begin perform public.save_sales_order(null, jsonb_build_object('customer_id', cu_off, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 25)));
    res := res || 'O6 switched-off customer: FAIL' || E'\n';
  exception when others then res := res || 'O6 a switched-off customer is refused: PASS' || E'\n'; end;
  -- edit while pending
  perform public.save_sales_order(o1, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'WEBSITE', 'discount', 0, 'shipping_charges', 0), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 5, 'rate', 100)));
  res := res || 'O7 editing a waiting order replaces its lines (500): ' || case when (select sum(quantity * rate) from public.sales_order_lines where order_id = o1) = 500 and (select channel from public.sales_orders where id = o1) = 'WEBSITE' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.confirm_sales_order(o1); res := res || 'O8 creator confirms: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'O8 a person without sales_orders.confirm cannot confirm: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',boss,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.confirm_sales_order(o1);
  res := res || 'O9 confirming works: ' || case when (select status from public.sales_orders where id = o1) = 'CONFIRMED' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.confirm_sales_order(o1); res := res || 'O10 confirm twice: FAIL' || E'\n';
  exception when others then res := res || 'O10 an order cannot be confirmed twice: PASS' || E'\n'; end;
  begin perform public.save_sales_order(o1, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 25)));
    res := res || 'O11 edit after confirm: FAIL' || E'\n';
  exception when others then res := res || 'O11 an order cannot be edited after it is made: PASS' || E'\n'; end;
  reset role;

  -- more orders in other states (set directly: the packing and dispatch pages do not exist yet)
  perform set_config('request.jwt.claims', json_build_object('sub',creator,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 2, 'rate', 25)));
  o2 := (r->>'id')::uuid;
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'FLIPKART'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 3, 'rate', 25)));
  o3 := (r->>'id')::uuid;
  perform public.cancel_sales_order(o2, 'customer changed mind');
  res := res || 'O12 a waiting order can be cancelled with a note: ' || case when (select status from public.sales_orders where id = o2) = 'CANCELLED' and (select cancel_note from public.sales_orders where id = o2) = 'customer changed mind' then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  update public.sales_orders set status = 'IN_PACKING' where id = o3;
  perform set_config('request.jwt.claims', json_build_object('sub',creator,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.cancel_sales_order(o3, null); res := res || 'O13 cancel while packing: FAIL' || E'\n';
  exception when others then res := res || 'O13 an order that is being packed cannot be cancelled here: PASS' || E'\n'; end;

  pg := public.sales_orders_page('sox', 'DIRECT', 'CANCELLED', cu, null, null, 10, 0);
  res := res || 'O14 filters channel + status + customer find the cancelled one: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = o2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_orders_page('sox-b', null, null, null, null, null, 10, 0);
  res := res || 'O15 search by an item on the order: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_orders_page(null, null, null, null, null, null, 10, 0);
  res := res || 'O16 numbers and a 30-day trend: ' || case when pg->'kpi' ?& array['total','pending','confirmed','in_packing','dispatched','cancelled','new_month'] and jsonb_array_length(pg->'trend') = 30
     and (pg->'kpi'->>'confirmed')::int >= 1 and (pg->'kpi'->>'cancelled')::int >= 1 and (pg->'kpi'->>'in_packing')::int >= 1 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  pg := public.sales_orders_page('%', null, null, null, null, null, 10, 0);
  res := res || 'O17 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.sales_orders_page(null, 'MOON', null, null, null, null, 10, 0); res := res || 'O18 bad channel: FAIL' || E'\n';
  exception when others then res := res || 'O18 a bad channel filter is refused: PASS' || E'\n'; end;
  begin insert into public.sales_order_lines (order_id, item_id, quantity, rate) values (o1, ia, 1, 1); res := res || 'O19 direct write: FAIL' || E'\n';
  exception when others then res := res || 'O19 no direct table writes: PASS' || E'\n'; end;
  reset role;

  select coalesce(sum(quantity), 0) into bal_after from public.stock_balances where item_id = ia;
  res := res || 'O20 sales orders do not change stock (' || bal_before || ' -> ' || bal_after || '): ' || case when bal_before = bal_after then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.sales_orders_page('sox', null, null, null, null, null, 10, 0);
  res := res || 'O21 a viewer sees the orders with the customer name (' || coalesce(pg->'rows'->0->>'customer_name', '?') || '): ' || case when (pg->>'total')::int = 3 and pg->'rows'->0->>'customer_name' = 'TEST SO CUSTOMER' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 25)));
    res := res || 'O22 viewer makes an order: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'O22 a viewer cannot make an order: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.sales_orders_page(null, null, null, null, null, null, 10, 0); res := res || 'O23 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'O23 a user without sales order rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.confirm_sales_order(o3); res := res || 'O24 anonymous confirms: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'O24 anonymous cannot confirm: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 036 RESULTS (rolled back):\n%', res;
end $$;
