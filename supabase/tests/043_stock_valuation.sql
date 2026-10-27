-- Test 043: stock valuation (migration 53). Rolled back at the end. Makes its own users, place, suppliers, items, receipts and movements. Item codes start with SVX.
do $$
declare
  adm uuid := gen_random_uuid(); sv uuid := gen_random_uuid(); nocost uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; s1 uuid; s2 uuid; cu uuid; cat uuid; ia uuid; ib uuid; ic uuid; id_ uuid; r jsonb; res text := ''; pg jsonb; o1 uuid;
begin
  insert into auth.users (id, email) values (adm,'a@v.l'),(sv,'s@v.l'),(nocost,'c@v.l'),(nobody,'n@v.l');
  update public.profiles set is_active = true where id in (adm, sv, nocost, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (sv, 'stock.view'), (sv, 'items.view'), (sv, 'sales_orders.view'), (sv, 'receipts.view'), (sv, 'receipts.cost'),
    (nocost, 'stock.view'), (nocost, 'items.view');
  insert into public.locations (code, name, type) values ('WHV', 'Warehouse SV', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (sv, wh), (nocost, wh), (adm, wh);
  insert into public.suppliers (name, supplier_type) values ('SVX SUPPLIER ONE', 'LOCAL') returning id into s1;
  insert into public.suppliers (name, supplier_type) values ('SVX SUPPLIER TWO', 'LOCAL') returning id into s2;
  insert into public.customers (name, customer_type) values ('TEST SV CUSTOMER', 'DEALER') returning id into cu;
  insert into public.categories (name) values ('SVX CAT') returning id into cat;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('SVX-A','svx a','svx a','LOCAL','PCS',10,cat) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('SVX-B','svx b','svx b','LOCAL','PCS',10,cat) returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('SVX-C','svx c','svx c','LOCAL','PCS',10,cat) returning id into ic;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('SVX-D','svx d','svx d','LOCAL','PCS',10,cat) returning id into id_;
  insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (ia, wh, 5, 100), (ib, wh, 5, 100), (ic, wh, 6, 100);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', s1, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 4, 'unit_cost', 10),
                          jsonb_build_object('item_id', ic, 'quantity', 3, 'unit_cost', 2), jsonb_build_object('item_id', id_, 'quantity', 6, 'unit_cost', 1)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', s2, 'location_id', wh), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 7)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', id_, 'quantity', 2, 'rate', 5)));
  o1 := (r->>'id')::uuid; perform public.confirm_sales_order(o1);
  reset role;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason) values (ia, wh, null, 12, 'SALE', 'test'), (ic, wh, null, 3, 'SALE', 'test');
  -- the stock now is: A 8, B 4, C 0, D 6 ... (A 20 - 12). Sold in 30 days: A 12 (fast), B 0 (slow), C 3, D 0 (slow, in stock).

  perform set_config('request.jwt.claims', json_build_object('sub',sv,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.stock_valuation('sku', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V1 four lines and four products: ' || case when (pg->>'total')::int = 4 and (pg->'kpi'->>'items')::int = 4 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'V2 average cost of A is the weighted average (10 x 5 + 10 x 7) / 20 = 6 and its value 8 x 6 = 48: ' || case when (select (e->>'avg_cost')::numeric = 6 and (e->>'value')::numeric = 48 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SVX-A') then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'V3 total value = A 48 + B 40 + C 0 + D 6 = 94: ' || case when (pg->'kpi'->>'value')::numeric = 94 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'V4 movement types: A fast, B slow, C normal (nothing in stock), D slow: ' || case when (select e->>'movement' = 'FAST' from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SVX-A')
    and (select e->>'movement' = 'SLOW' from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SVX-B') and (select e->>'movement' = 'NORMAL' from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SVX-C')
    and (select e->>'movement' = 'SLOW' from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SVX-D') then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'V5 fast value 48, slow value 40 + 6 = 46, low value 40: ' || case when (pg->'kpi'->>'fast')::numeric = 48 and (pg->'kpi'->>'slow')::numeric = 46 and (pg->'kpi'->>'low')::numeric = 40 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'V6 out of stock value = refill = 6 x 2 = 12: ' || case when (pg->'kpi'->>'out_refill')::numeric = 12 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'V7 status value: in stock (A 48 + D 6 - reserved 2) = 52, low 40, reserved 2: ' || case when (pg->'status_value'->>'in_stock')::numeric = 52 and (pg->'status_value'->>'low')::numeric = 40 and (pg->'status_value'->>'reserved')::numeric = 2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('sku', 'SVX', cat, wh, null, 'LOW', 50, 0);
  res := res || 'V8 status filter LOW: B only: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'code' = 'SVX-B' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('low', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V9 low tab: B with value 40: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'value')::numeric = 40 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('out', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V10 out tab: C with refill value 12: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'code' = 'SVX-C' and (pg->'rows'->0->>'refill_value')::numeric = 12 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('movers', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V11 fast / slow tab: A, B and D (not C): ' || case when (pg->>'total')::int = 3 and not exists (select 1 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'SVX-C') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('category', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V12 category tab: one category, value 94: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'value')::numeric = 94 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('warehouse', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V13 warehouse tab: Warehouse SV 94: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'value')::numeric = 94 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('supplier', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V14 supplier tab: the last receipt decides (A to supplier two 48; B, C, D to supplier one 46): ' || case when (select (e->>'value')::numeric = 48 from jsonb_array_elements(pg->'rows') e where e->>'supplier_name' = 'SVX SUPPLIER TWO')
    and (select (e->>'value')::numeric = 46 from jsonb_array_elements(pg->'rows') e where e->>'supplier_name' = 'SVX SUPPLIER ONE') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('sku', 'SVX', cat, wh, s1, null, 50, 0);
  res := res || 'V15 supplier filter (supplier one: B, C, D): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('ageing', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V16 ageing tab: everything came in today, so one group 0-30 days with value 94: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'bucket' = '0-30 days' and (pg->'rows'->0->>'value')::numeric = 94 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_valuation('sku', 'SVX', cat, wh, null, null, 50, 0);
  res := res || 'V17 charts: category, warehouse, ageing, top items and recent are filled: ' || case when jsonb_array_length(pg->'value_by_category') = 1 and jsonb_array_length(pg->'value_by_place') = 1
    and jsonb_array_length(pg->'ageing_value') = 1 and jsonb_array_length(pg->'top_items') = 3 and jsonb_array_length(pg->'recent') > 0 and jsonb_array_length(pg->'low_top') = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.stock_valuation('nope'); res := res || 'V18 bad tab: FAIL' || E'\n';
  exception when others then res := res || 'V18 an unknown tab is refused: PASS' || E'\n'; end;
  begin perform public.stock_valuation('sku', null, null, null, null, 'ROCKET'); res := res || 'V19 bad status: FAIL' || E'\n';
  exception when others then res := res || 'V19 an unknown status filter is refused: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nocost,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.stock_valuation('sku'); res := res || 'V20 without receipts.cost: FAIL' || E'\n';
  exception when others then res := res || 'V20 a person without receipts.cost cannot open the valuation: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.stock_valuation('sku'); res := res || 'V21 no permission: FAIL' || E'\n';
  exception when others then res := res || 'V21 a person without stock.view cannot open the valuation: PASS' || E'\n'; end;
  reset role;

  raise exception E'STOCK VALUATION TEST RESULT\n%', res;
end $$;
