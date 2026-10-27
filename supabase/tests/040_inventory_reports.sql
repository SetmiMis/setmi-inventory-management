-- Test 040: inventory reports (migration 50). Rolled back at the end. Makes its own users, place, items and movements. Item codes start with IRX.
do $$
declare
  adm uuid := gen_random_uuid(); sv uuid := gen_random_uuid(); svc uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; wh2 uuid; sup uuid; cu uuid; ia uuid; ib uuid; ic uuid; id_ uuid; cat uuid; r jsonb; res text := ''; pg jsonb; o1 uuid;
begin
  insert into auth.users (id, email) values (adm,'a@i.l'),(sv,'s@i.l'),(svc,'c@i.l'),(nobody,'n@i.l');
  update public.profiles set is_active = true where id in (adm, sv, svc, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (sv, 'stock.view'), (sv, 'items.view'), (sv, 'sales_orders.view'),
    (svc, 'stock.view'), (svc, 'items.view'), (svc, 'sales_orders.view'), (svc, 'receipts.view'), (svc, 'receipts.cost');
  insert into public.locations (code, name, type) values ('WHI', 'Warehouse IR', 'WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('WHJ', 'Warehouse IS', 'WAREHOUSE') returning id into wh2;
  insert into public.user_locations values (sv, wh), (svc, wh), (adm, wh), (adm, wh2);
  insert into public.suppliers (name, supplier_type) values ('TEST IR SUP', 'LOCAL') returning id into sup;
  insert into public.customers (name, customer_type) values ('TEST IR CUSTOMER', 'DEALER') returning id into cu;
  insert into public.categories (name) values ('IRX CAT') returning id into cat;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('IRX-A','irx a','irx a','LOCAL','PCS',10,cat) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('IRX-B','irx b','irx b','LOCAL','PCS',10,cat) returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('IRX-C','irx c','irx c','LOCAL','PCS',10,cat) returning id into ic;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('IRX-D','irx d','irx d','LOCAL','PCS',10,cat) returning id into id_;
  insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (ib, wh, 5, 50);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 20, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 3, 'unit_cost', 10),
                          jsonb_build_object('item_id', ic, 'quantity', 20, 'unit_cost', 2), jsonb_build_object('item_id', id_, 'quantity', 1, 'unit_cost', 4)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', wh, 'channel', 'AMAZON'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 4, 'rate', 10)));
  o1 := (r->>'id')::uuid; perform public.confirm_sales_order(o1);
  reset role;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type, reason) values (ia, wh, null, 6, 'SALE', 'test sale'), (id_, wh, null, 1, 'SALE', 'test sale');

  perform set_config('request.jwt.claims', json_build_object('sub',sv,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.inventory_report('current', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I1 the numbers count the four lines (items 4, quantity 14+3+20+0=37): ' || case when (pg->'kpi'->>'items')::int = 4 and (pg->'kpi'->>'qty')::numeric = 37 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'I2 low = 1 (IRX-B), out = 1 (IRX-D), slow = 2 (B and C; A sold 6): ' || case when (pg->'kpi'->>'low')::int = 1 and (pg->'kpi'->>'out')::int = 1 and (pg->'kpi'->>'slow')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'I3 value is hidden without receipts.cost: ' || case when pg->'kpi'->'value' = 'null'::jsonb and (select bool_and(e->'value' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'I4 reserved and available from the open order (A: 14 in stock, 4 reserved, 10 available): ' || case when (select (e->>'reserved')::numeric = 4 and (e->>'available')::numeric = 10 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'IRX-A') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('low', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I5 low tab holds IRX-B only: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'code' = 'IRX-B' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('out', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I6 out tab holds IRX-D only: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'code' = 'IRX-D' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('slow', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I7 slow tab has B and C, not A, not the empty D: ' || case when (pg->>'total')::int = 2 and not exists (select 1 from jsonb_array_elements(pg->'rows') e where e->>'code' in ('IRX-A', 'IRX-D')) then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('fast', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I8 fast tab: A first with 6 sold, then D with 1: ' || case when (pg->>'total')::int = 2 and pg->'rows'->0->>'code' = 'IRX-A' and (pg->'rows'->0->>'sold_qty')::numeric = 6 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('fast', 'IRX', cat, wh, null, null, current_date + 1, current_date + 5, 50, 0);
  res := res || 'I9 fast tab follows the date range (nothing sold in the future range): ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('ageing', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I10 ageing lists lines with stock (A, B, C) and the age is 0 days: ' || case when (pg->>'total')::int = 3 and (select bool_and((e->>'age_days')::int = 0) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('movement', 'IRX', cat, wh, null, 'SALE', null, null, 50, 0);
  res := res || 'I11 movement tab filtered to sales: 2 lines, all negative: ' || case when (pg->>'total')::int = 2 and (select bool_and((e->>'delta')::numeric < 0) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('movement', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I12 movement tab with all types: 4 receipt lines + 2 sales = 6: ' || case when (pg->>'total')::int = 6 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('location', null, cat, null, null, null, null, null, 50, 0);
  res := res || 'I13 location tab has a line per visible place and Warehouse IR holds 37: ' || case when (pg->>'total')::int >= 1 and (select (e->>'qty')::numeric = 37 and (e->>'items')::int = 4 from jsonb_array_elements(pg->'rows') e where e->>'place_name' = 'Warehouse IR') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('current', 'IRX', cat, wh, 'LOW', null, null, null, 50, 0);
  res := res || 'I14 status filter on the current tab: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.inventory_report('current', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I15 charts: movement trend has 30 days, status counts add up to 4: ' || case when jsonb_array_length(pg->'movement_trend') = 30
    and (pg->'status_dist'->>'out')::int + (pg->'status_dist'->>'low')::int + (pg->'status_dist'->>'slow')::int + (pg->'status_dist'->>'in')::int = 4 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'I16 low top 5 and recent activity are filled: ' || case when jsonb_array_length(pg->'low_top') = 1 and jsonb_array_length(pg->'recent') > 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.inventory_report('nope'); res := res || 'I17 bad tab: FAIL' || E'\n';
  exception when others then res := res || 'I17 an unknown tab is refused: PASS' || E'\n'; end;
  begin perform public.inventory_report('movement', null, null, null, null, 'ROCKET'); res := res || 'I18 bad type: FAIL' || E'\n';
  exception when others then res := res || 'I18 an unknown movement type is refused: PASS' || E'\n'; end;
  begin perform public.inventory_report('movement', null, null, null, null, null, current_date, current_date - 3); res := res || 'I19 end before start: FAIL' || E'\n';
  exception when others then res := res || 'I19 an end date before the start date is refused: PASS' || E'\n'; end;
  perform public.inventory_report('movement', null, null, null, null, 'STOCK_OUT');
  res := res || 'I19b the Stock in / Stock out types are accepted: PASS' || E'
';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',svc,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.inventory_report('current', 'IRX', cat, wh, null, null, null, null, 50, 0);
  res := res || 'I20 with receipts.cost the value shows (A 14x5 + B 3x10 + C 20x2 + D 0 = 140): ' || case when (pg->'kpi'->>'value')::numeric = 140 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.inventory_report('current'); res := res || 'I21 no permission: FAIL' || E'\n';
  exception when others then res := res || 'I21 a person without stock.view cannot open the report: PASS' || E'\n'; end;
  reset role;

  raise exception E'INVENTORY REPORT TEST RESULT\n%', res;
end $$;
