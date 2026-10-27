-- Test 027: purchase_orders_page (migration 37). Rolled back at the end. Makes its own users, place, supplier and items.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; s_imp uuid; s_loc uuid; i1 uuid; i2 uuid; po1 uuid; po2 uuid; po3 uuid; r jsonb; res text := ''; pg jsonb;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'purchase.view');
  insert into public.locations (code, name, type) values ('WHX', 'Warehouse X', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (viewer, wh);
  insert into public.suppliers (name, supplier_type, country) values ('TEST IMPORT SUP', 'IMPORT', 'China') returning id into s_imp;
  insert into public.suppliers (name, supplier_type, country) values ('TEST LOCAL SUP', 'LOCAL', 'India') returning id into s_loc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('POX1','pox one','pox one','LOCAL','PCS',10) returning id into i1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('POX2','pox two','pox two','LOCAL','PCS',10) returning id into i2;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_purchase_order(null, jsonb_build_object('supplier_id', s_imp, 'location_id', wh, 'order_date', current_date - 20, 'expected_date', current_date - 5),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 10, 'unit_cost', 100), jsonb_build_object('item_id', i2, 'quantity', 5, 'unit_cost', 20)));
  po1 := (r->>'id')::uuid;
  perform public.send_purchase_order(po1);
  r := public.save_purchase_order(null, jsonb_build_object('supplier_id', s_loc, 'location_id', wh, 'order_date', current_date, 'expected_date', current_date + 10),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 3, 'unit_cost', 50)));
  po2 := (r->>'id')::uuid;
  r := public.save_purchase_order(null, jsonb_build_object('supplier_id', s_loc, 'location_id', wh, 'order_date', current_date), jsonb_build_array(jsonb_build_object('item_id', i2, 'quantity', 1, 'unit_cost', 5)));
  po3 := (r->>'id')::uuid;
  perform public.send_purchase_order(po3);
  perform public.cancel_purchase_order(po3);

  pg := public.purchase_orders_page(null, null, null, null, null, null, 50, 0);
  res := res || 'P1 admin sees the three orders (' || (pg->>'total') || '): ' || case when (pg->>'total')::int >= 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page(null, s_imp, 'IMPORT', 'OVERDUE', null, null, 10, 0);
  res := res || 'P2 filters together: supplier + import + overdue (' || (pg->>'total') || ', items ' || coalesce(pg->'rows'->0->>'items', '?') || ', value ' || coalesce(pg->'rows'->0->>'value', '?') || ', want 1, 2, 1100): ' ||
    case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'items')::int = 2 and (pg->'rows'->0->>'value')::numeric = 1100 and (pg->'rows'->0->>'overdue')::boolean then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page(null, null, 'LOCAL', 'DRAFT', null, null, 10, 0);
  res := res || 'P3 domestic draft (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'po_no' is not null and (pg->'rows'->0->>'id')::uuid = po2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page(null, null, null, 'CANCELLED', null, null, 10, 0);
  res := res || 'P4 cancelled filter: ' || case when (pg->>'total')::int >= 1 and not (pg->'rows'->0->>'overdue')::boolean then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page('pox1', null, null, null, null, null, 10, 0);
  res := res || 'P5 search by an item on the order (' || (pg->>'total') || ', want 2): ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page(null, null, null, null, current_date + 1, null, 10, 0);
  res := res || 'P6 date range from tomorrow finds nothing: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page(null, null, null, null, null, null, 10, 0);
  res := res || 'P7 numbers present: ' || case when pg->'kpi' ?& array['total','open','sent','partial','completed','overdue','new_month'] and (pg->'kpi'->>'overdue')::int >= 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.purchase_orders_page('%', null, null, null, null, null, 10, 0);
  res := res || 'P8 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.purchase_orders_page(null, null, null, 'BOGUS', null, null, 10, 0); res := res || 'P9 bad status: FAIL' || E'\n';
  exception when others then res := res || 'P9 bad status refused: PASS' || E'\n'; end;
  begin perform public.purchase_orders_page(null, null, 'ALIEN', null, null, null, 10, 0); res := res || 'P10 bad type: FAIL' || E'\n';
  exception when others then res := res || 'P10 bad type refused: PASS' || E'\n'; end;
  reset role;

  -- a purchase.view user (no buying prices) sees orders but no value
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.purchase_orders_page(null, null, null, null, null, null, 50, 0);
  res := res || 'P11 a user without receipts.cost sees the orders but the value is empty (' || coalesce(pg->'rows'->0->>'value', 'null') || '): ' ||
    case when (pg->>'total')::int >= 3 and (select bool_and(e->'value' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.purchase_orders_page(null, null, null, null, null, null, 10, 0); res := res || 'P12 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'P12 a user without purchase rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.purchase_orders_page(null, null, null, null, null, null, 10, 0); res := res || 'P13 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'P13 anonymous is denied: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 027 RESULTS (rolled back):\n%', res;
end $$;
