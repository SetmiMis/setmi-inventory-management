-- Test 042: sales reports (migration 52). Rolled back at the end. Makes its own users, place, customers, items and orders. Item codes start with SRX.
do $$
declare
  adm uuid := gen_random_uuid(); sv uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; sup uuid; c1 uuid; c2 uuid; cat1 uuid; cat2 uuid; ia uuid; ib uuid; cr uuid; r jsonb; res text := ''; pg jsonb; o1 uuid; o2 uuid; o3 uuid; j uuid; rt uuid;
begin
  insert into auth.users (id, email) values (adm,'a@s.l'),(sv,'v@s.l'),(nobody,'n@s.l');
  update public.profiles set is_active = true where id in (adm, sv, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (sv, 'sales_orders.view'), (sv, 'items.view'), (sv, 'returns.view');
  insert into public.locations (code, name, type) values ('WHS', 'Warehouse SR', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (sv, wh), (adm, wh);
  insert into public.suppliers (name, supplier_type) values ('TEST SR SUP', 'LOCAL') returning id into sup;
  insert into public.customers (name, customer_type, city) values ('SRX CUSTOMER ONE', 'DEALER', 'Delhi') returning id into c1;
  insert into public.customers (name, customer_type, city) values ('SRX CUSTOMER TWO', 'RETAILER', null) returning id into c2;
  insert into public.categories (name) values ('SRX CAT 1') returning id into cat1;
  insert into public.categories (name) values ('SRX CAT 2') returning id into cat2;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('SRX-A','srx a','srx a','LOCAL','PCS',10,cat1) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('SRX-B','srx b','srx b','LOCAL','PCS',20,cat2) returning id into ib;
  select id into cr from public.couriers where name = 'Blue Dart';

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 50, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 50, 'unit_cost', 8)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  -- o1: Amazon, customer one, A 5 x 10 + B 2 x 20 = 90, discount 5, shipping 3 -> net 88
  r := public.save_sales_order(null, jsonb_build_object('customer_id', c1, 'location_id', wh, 'channel', 'AMAZON', 'discount', 5, 'shipping_charges', 3),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 5, 'rate', 10), jsonb_build_object('item_id', ib, 'quantity', 2, 'rate', 20)));
  o1 := (r->>'id')::uuid; perform public.confirm_sales_order(o1);
  -- o2: Direct, customer two (no city), A 4 x 10 = 40 -> net 40
  r := public.save_sales_order(null, jsonb_build_object('customer_id', c2, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 4, 'rate', 10)));
  o2 := (r->>'id')::uuid; perform public.confirm_sales_order(o2);
  -- o3: confirmed, not dispatched
  r := public.save_sales_order(null, jsonb_build_object('customer_id', c1, 'location_id', wh, 'channel', 'WEBSITE'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1, 'rate', 10)));
  o3 := (r->>'id')::uuid; perform public.confirm_sales_order(o3);
  j := (public.start_picking(o1, 'HIGH')->>'id')::uuid; perform public.set_pick_quantity(j, ia, 5); perform public.set_pick_quantity(j, ib, 2);
  perform public.mark_packed(j, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B1'));
  perform public.create_dispatch(o1, jsonb_build_object('courier_id', cr, 'awb', 'SRX-AWB-1'));
  j := (public.start_picking(o2, 'LOW')->>'id')::uuid; perform public.set_pick_quantity(j, ia, 4);
  perform public.mark_packed(j, jsonb_build_object('packing_type', 'BOX', 'box_no', 'B2'));
  perform public.create_dispatch(o2, jsonb_build_object('courier_id', cr, 'awb', 'SRX-AWB-2'));
  r := public.create_return(o1, jsonb_build_object('reason', 'DAMAGED'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 1)));
  rt := (r->>'id')::uuid;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',sv,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.sales_report('orders', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S1 only dispatched orders are sales (2 of the 3 orders): ' || case when (pg->'kpi'->>'orders')::int = 2 and (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'S2 total sales = net 88 + 40 = 128 (order value - discount + shipping): ' || case when (pg->'kpi'->>'sales')::numeric = 128 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'S3 items sold 5+2+4 = 11, average order 64, 2 customers: ' || case when (pg->'kpi'->>'items_sold')::numeric = 11 and (pg->'kpi'->>'avg')::numeric = 64 and (pg->'kpi'->>'customers')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'S4 one order has a return: ' || case when (pg->'kpi'->>'return_orders')::int = 1 and (select (e->>'returns')::int = 1 from jsonb_array_elements(pg->'rows') e where e->>'channel' = 'AMAZON') then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'S5 the order row has value 90, discount 5, net 88 and the parcel status: ' || case when (select (e->>'value')::numeric = 90 and (e->>'discount')::numeric = 5 and (e->>'net')::numeric = 88 and e->>'dispatch_status' = 'DISPATCHED' from jsonb_array_elements(pg->'rows') e where e->>'channel' = 'AMAZON') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('product', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S6 product tab: A 9 pieces 90 rupees, B 2 pieces 40: ' || case when (select (e->>'qty')::numeric = 9 and (e->>'value')::numeric = 90 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SRX-A')
    and (select (e->>'qty')::numeric = 2 and (e->>'value')::numeric = 40 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SRX-B') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('channel', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S7 channel tab: Amazon net 88, Direct net 40: ' || case when (select (e->>'net')::numeric = 88 from jsonb_array_elements(pg->'rows') e where e->>'channel' = 'AMAZON')
    and (select (e->>'net')::numeric = 40 from jsonb_array_elements(pg->'rows') e where e->>'channel' = 'DIRECT') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('customer', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S8 customer tab: customer one first with net 88: ' || case when pg->'rows'->0->>'cname' = 'SRX CUSTOMER ONE' and (pg->'rows'->0->>'net')::numeric = 88 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('city', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S9 city tab: Delhi 88 and "Not set" 40: ' || case when (select (e->>'net')::numeric = 88 from jsonb_array_elements(pg->'rows') e where e->>'city' = 'Delhi')
    and (select (e->>'net')::numeric = 40 from jsonb_array_elements(pg->'rows') e where e->>'city' = 'Not set') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('monthly', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S10 monthly tab holds both orders (net 128): ' || case when (select sum((e->>'orders')::int) from jsonb_array_elements(pg->'rows') e) = 2 and (select sum((e->>'net')::numeric) from jsonb_array_elements(pg->'rows') e) = 128 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('orders', 'SRX', 'AMAZON', null, null, null, null, 50, 0);
  res := res || 'S11 channel filter: 1 order: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('orders', 'SRX', null, null, 'RETAILER', null, null, 50, 0);
  res := res || 'S12 customer type filter: 1 order (customer two): ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'cname' = 'SRX CUSTOMER TWO' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('product', 'SRX', null, cat2, null, null, null, 50, 0);
  res := res || 'S13 category filter: only the order with category 2 (1 order) and the product tab shows only B: ' || case when (pg->'kpi'->>'orders')::int = 1 and (pg->>'total')::int = 1 and pg->'rows'->0->>'code' = 'SRX-B' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('orders', 'SRX-B', null, null, null, null, null, 50, 0);
  res := res || 'S14 search by item code: 1 order: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('orders', 'SRX', null, null, null, current_date + 1, current_date + 5, 50, 0);
  res := res || 'S15 date range with no orders: ' || case when (pg->>'total')::int = 0 and (pg->'kpi'->>'sales')::numeric = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('comparison', 'SRX', null, null, null, current_date - 2, current_date, 50, 0);
  res := res || 'S16 comparison: this period 2 orders, 6 measure rows: ' || case when jsonb_array_length(pg->'rows') = 6 and (pg->'rows'->0->>'current')::int = 2 and (pg->'rows'->1->>'current')::numeric = 128 and (pg->'rows'->5->>'current')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.sales_report('orders', 'SRX', null, null, null, null, null, 50, 0);
  res := res || 'S17 charts: 30 days of trend, 2 channels, 2 categories, top lists filled: ' || case when jsonb_array_length(pg->'trend') = 30 and jsonb_array_length(pg->'channels') = 2 and jsonb_array_length(pg->'categories_value') = 2
    and jsonb_array_length(pg->'top_products') = 2 and jsonb_array_length(pg->'top_customers') = 2 and jsonb_array_length(pg->'top_cities') = 2 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.sales_report('nope'); res := res || 'S18 bad tab: FAIL' || E'\n';
  exception when others then res := res || 'S18 an unknown tab is refused: PASS' || E'\n'; end;
  begin perform public.sales_report('orders', null, 'ROCKET'); res := res || 'S19 bad channel: FAIL' || E'\n';
  exception when others then res := res || 'S19 an unknown channel filter is refused: PASS' || E'\n'; end;
  begin perform public.sales_report('orders', null, null, null, 'ROCKET'); res := res || 'S20 bad customer type: FAIL' || E'\n';
  exception when others then res := res || 'S20 an unknown customer type filter is refused: PASS' || E'\n'; end;
  begin perform public.sales_report('orders', null, null, null, null, current_date, current_date - 2); res := res || 'S21 end before start: FAIL' || E'\n';
  exception when others then res := res || 'S21 an end date before the start date is refused: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.sales_report('orders'); res := res || 'S22 no permission: FAIL' || E'\n';
  exception when others then res := res || 'S22 a person without sales order permission cannot open the report: PASS' || E'\n'; end;
  reset role;

  raise exception E'SALES REPORT TEST RESULT\n%', res;
end $$;
