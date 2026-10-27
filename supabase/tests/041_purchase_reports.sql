-- Test 041: purchase reports (migration 51). Rolled back at the end. Makes its own users, suppliers, items, orders and receipt. Item codes start with PRX.
do $$
declare
  adm uuid := gen_random_uuid(); buyer uuid := gen_random_uuid(); buyc uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; sa uuid; sb uuid; cat1 uuid; cat2 uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; l1 bigint; l2 bigint; l3 bigint; l4 bigint; l5 bigint; l6 bigint;
begin
  insert into auth.users (id, email) values (adm,'a@p.l'),(buyer,'b@p.l'),(buyc,'c@p.l'),(nobody,'n@p.l');
  update public.profiles set is_active = true where id in (adm, buyer, buyc, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (buyer, 'purchase.view'), (buyer, 'items.view'), (buyc, 'purchase.view'), (buyc, 'items.view'), (buyc, 'receipts.view'), (buyc, 'receipts.cost');
  insert into public.locations (code, name, type) values ('WHP', 'Warehouse PR', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (buyer, wh), (buyc, wh), (adm, wh);
  insert into public.suppliers (name, supplier_type) values ('PRX SUPPLIER A', 'LOCAL') returning id into sa;
  insert into public.suppliers (name, supplier_type) values ('PRX SUPPLIER B', 'LOCAL') returning id into sb;
  insert into public.categories (name) values ('PRX CAT 1') returning id into cat1;
  insert into public.categories (name) values ('PRX CAT 2') returning id into cat2;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('PRX-A','prx a','prx a','LOCAL','PCS',10,cat1) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('PRX-B','prx b','prx b','LOCAL','PCS',10,cat2) returning id into ib;

  -- P1 COMPLETED (supplier A, A 10 x 5 = 50 and B 10 x 2 = 20, all received), P2 PARTIAL overdue (supplier B, A 20 x 5 = 100, received 5), P3 SENT (A, B 10 x 3 = 30, none received, not late),
  -- P4 DRAFT (A, A 4 x 5 = 20), P5 CANCELLED (B, A 2 x 5 = 10), all dated this month except P3 that is last month
  insert into public.purchase_orders (supplier_id, location_id, order_date, expected_date, status) values (sa, wh, current_date, null, 'DRAFT') returning id into p1;
  insert into public.purchase_orders (supplier_id, location_id, order_date, expected_date, status) values (sb, wh, current_date - 10, current_date - 3, 'DRAFT') returning id into p2;
  insert into public.purchase_orders (supplier_id, location_id, order_date, expected_date, status) values (sa, wh, (date_trunc('month', current_date) - interval '1 day')::date, current_date + 20, 'DRAFT') returning id into p3;
  insert into public.purchase_orders (supplier_id, location_id, order_date, status) values (sa, wh, current_date, 'DRAFT') returning id into p4;
  insert into public.purchase_orders (supplier_id, location_id, order_date, status) values (sb, wh, current_date, 'DRAFT') returning id into p5;
  insert into public.purchase_order_lines (po_id, item_id, quantity, received_qty) values (p1, ia, 10, 10) returning id into l1;
  insert into public.purchase_order_lines (po_id, item_id, quantity, received_qty) values (p1, ib, 10, 10) returning id into l2;
  insert into public.purchase_order_lines (po_id, item_id, quantity, received_qty) values (p2, ia, 20, 5) returning id into l3;
  insert into public.purchase_order_lines (po_id, item_id, quantity, received_qty) values (p3, ib, 10, 0) returning id into l4;
  insert into public.purchase_order_lines (po_id, item_id, quantity, received_qty) values (p4, ia, 4, 0) returning id into l5;
  insert into public.purchase_order_lines (po_id, item_id, quantity, received_qty) values (p5, ia, 2, 0) returning id into l6;
  insert into public.purchase_order_costs (line_id, unit_cost) values (l1, 5), (l2, 2), (l3, 5), (l4, 3), (l5, 5), (l6, 5);
  -- the order flow is DRAFT -> SENT -> PARTIAL -> COMPLETED (or CANCELLED), so move them one step at a time
  update public.purchase_orders set status = 'SENT' where id in (p1, p2, p3, p5);
  update public.purchase_orders set status = 'PARTIAL' where id in (p1, p2);
  update public.purchase_orders set status = 'COMPLETED' where id = p1;
  update public.purchase_orders set status = 'CANCELLED' where id = p5;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sa, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 6)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',buyc,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.purchase_report('orders', 'PRX', null, null, null, wh, current_date - 400, current_date + 400, 50, 0);
  res := res || 'P1 five orders are counted: ' || case when (pg->'kpi'->>'pos')::int = 5 and (pg->>'total')::int = 5 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P2 purchase value counts placed orders only (50+20+100+30 = 200, not the draft or the cancelled): ' || case when (pg->'kpi'->>'value')::numeric = 200 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P3 pending value = (20-5) x 5 + 10 x 3 = 105: ' || case when (pg->'kpi'->>'pending')::numeric = 105 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P4 received value (GRN) is the real receipt value 10 x 6 = 60: ' || case when (pg->'kpi'->>'received')::numeric = 60 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P5 average order value = 200 / 3 placed orders = 66.67 and 2 suppliers: ' || case when round((pg->'kpi'->>'avg')::numeric, 2) = 66.67 and (pg->'kpi'->>'suppliers')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P6 status counts: ' || case when (pg->'status_dist'->>'COMPLETED')::int = 1 and (pg->'status_dist'->>'PARTIAL')::int = 1 and (pg->'status_dist'->>'SENT')::int = 1 and (pg->'status_dist'->>'DRAFT')::int = 1 and (pg->'status_dist'->>'CANCELLED')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P7 the order tab shows every order with received value at the order price (P1 70): ' || case when (select (e->>'received_value')::numeric = 70 and (e->>'value')::numeric = 70 from jsonb_array_elements(pg->'rows') e where e->>'status' = 'COMPLETED') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('orders', 'PRX', null, null, 'OVERDUE', wh, null, null, 50, 0);
  res := res || 'P8 overdue filter finds the partial order only: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'status' = 'PARTIAL' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('pending', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P9 pending deliveries: the partial and the sent order, partial first (3 days late): ' || case when (pg->>'total')::int = 2 and pg->'rows'->0->>'status' = 'PARTIAL' and (pg->'rows'->0->>'days_late')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('supplier', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P10 supplier tab: A has 2 orders and value 100, B 1 order and 100: ' || case when (pg->>'total')::int = 2 and (select (e->>'pos')::int = 2 and (e->>'value')::numeric = 100 from jsonb_array_elements(pg->'rows') e where e->>'sname' = 'PRX SUPPLIER A')
    and (select (e->>'pos')::int = 1 and (e->>'value')::numeric = 100 from jsonb_array_elements(pg->'rows') e where e->>'sname' = 'PRX SUPPLIER B') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('category', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P11 category tab: cat 1 = 150, cat 2 = 50: ' || case when (select (e->>'value')::numeric = 150 from jsonb_array_elements(pg->'rows') e where e->>'category_name' = 'PRX CAT 1')
    and (select (e->>'value')::numeric = 50 from jsonb_array_elements(pg->'rows') e where e->>'category_name' = 'PRX CAT 2') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('item', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P12 item tab: A quantity 30 at average rate 5: ' || case when (select (e->>'qty')::numeric = 30 and (e->>'avg_rate')::numeric = 5 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'PRX-A') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('monthly', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P13 monthly tab holds the 3 placed orders over this and last month: ' || case when (pg->>'total')::int >= 1 and (select sum((e->>'pos')::int) from jsonb_array_elements(pg->'rows') e) = 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('orders', 'PRX', null, cat2, null, wh, null, null, 50, 0);
  res := res || 'P14 category filter works on lines (cat 2: P1 shows 20, value total 20 + 30 = 50): ' || case when (pg->'kpi'->>'value')::numeric = 50 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('orders', 'PRX', sa, null, null, wh, null, null, 50, 0);
  res := res || 'P15 supplier filter (A has 3 orders): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('orders', 'PRX-B', null, null, null, wh, null, null, 50, 0);
  res := res || 'P16 search by item code finds the orders that have it (P1, P3): ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('grn', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P17 GRN tab lists the posted receipt with its value: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'value')::numeric = 60 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('comparative', 'PRX', null, null, null, wh, current_date - 5, current_date, 50, 0);
  res := res || 'P18 comparative: this period has 1 order (P1) and there are 6 metric rows: ' || case when jsonb_array_length(pg->'rows') = 6 and (pg->'rows'->0->>'current')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_report('orders', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P19 charts: 6 months of trend, top suppliers and top items filled: ' || case when jsonb_array_length(pg->'trend') = 6 and jsonb_array_length(pg->'top_suppliers') = 2 and jsonb_array_length(pg->'top_items') = 2 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.purchase_report('nope'); res := res || 'P20 bad tab: FAIL' || E'\n';
  exception when others then res := res || 'P20 an unknown tab is refused: PASS' || E'\n'; end;
  begin perform public.purchase_report('orders', null, null, null, 'ROCKET'); res := res || 'P21 bad status: FAIL' || E'\n';
  exception when others then res := res || 'P21 an unknown status filter is refused: PASS' || E'\n'; end;
  begin perform public.purchase_report('orders', null, null, null, null, null, current_date, current_date - 2); res := res || 'P22 end before start: FAIL' || E'\n';
  exception when others then res := res || 'P22 an end date before the start date is refused: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',buyer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.purchase_report('orders', 'PRX', null, null, null, wh, null, null, 50, 0);
  res := res || 'P23 without receipts.cost every money number is empty: ' || case when pg->'kpi'->'value' = 'null'::jsonb and pg->'kpi'->'received' = 'null'::jsonb and (select bool_and(e->'value' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.purchase_report('orders'); res := res || 'P24 no permission: FAIL' || E'\n';
  exception when others then res := res || 'P24 a person without purchase permission cannot open the report: PASS' || E'\n'; end;
  reset role;

  raise exception E'PURCHASE REPORT TEST RESULT\n%', res;
end $$;
