-- Test 029: receipts_page (migration 39). Rolled back at the end. Makes its own users, place, suppliers, items, order and receipts.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; s_imp uuid; s_loc uuid; i1 uuid; i2 uuid; po uuid; r jsonb; res text := ''; pg jsonb; g1 uuid; g2 uuid; g3 uuid;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'receipts.view');
  insert into public.locations (code, name, type) values ('WHZ', 'Warehouse Z', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (viewer, wh);
  insert into public.suppliers (name, supplier_type, country) values ('TEST IMPORT SUP', 'IMPORT', 'China') returning id into s_imp;
  insert into public.suppliers (name, supplier_type, country) values ('TEST LOCAL SUP', 'LOCAL', 'India') returning id into s_loc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('GRX1','grx one','grx one','LOCAL','PCS',10) returning id into i1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('GRX2','grx two','grx two','LOCAL','PCS',10) returning id into i2;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_purchase_order(null, jsonb_build_object('supplier_id', s_imp, 'location_id', wh, 'order_date', current_date),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 100, 'unit_cost', 10), jsonb_build_object('item_id', i2, 'quantity', 50, 'unit_cost', 20)));
  po := (r->>'id')::uuid; perform public.send_purchase_order(po);
  -- G1: posted receipt against the order, part of the goods (order becomes partly received)
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', s_imp, 'location_id', wh, 'purchase_order_id', po, 'supplier_invoice_no', 'INV-GRX-1'),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 60, 'unit_cost', 10)));
  g1 := (r->>'id')::uuid; perform public.post_goods_receipt(g1);
  -- G2: draft, domestic
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', s_loc, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', i2, 'quantity', 7, 'unit_cost', 5)));
  g2 := (r->>'id')::uuid;
  -- G3: cancelled
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', s_loc, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 2, 'unit_cost', 5)));
  g3 := (r->>'id')::uuid; perform public.cancel_goods_receipt(g3);

  pg := public.receipts_page(null, null, null, null, null, null, null, 50, 0);
  res := res || 'G1 admin sees the three receipts (' || (pg->>'total') || '): ' || case when (pg->>'total')::int >= 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page(null, wh, s_imp, 'IMPORT', 'POSTED', null, null, 10, 0);
  res := res || 'G2 filters together (' || (pg->>'total') || ', items ' || coalesce(pg->'rows'->0->>'items', '?') || ', qty ' || coalesce(pg->'rows'->0->>'qty', '?') || ', po ' || coalesce(pg->'rows'->0->>'po_no', '?') || '): ' ||
    case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'items')::int = 1 and (pg->'rows'->0->>'qty')::numeric = 60 and (pg->'rows'->0->>'po_no') is not null then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page(null, null, null, null, 'PARTIAL', null, null, 10, 0);
  res := res || 'G3 partly received (posted, order still open): ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = g1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page(null, null, null, null, 'DRAFT', null, null, 10, 0);
  res := res || 'G4 draft filter: ' || case when (pg->>'total')::int >= 1 and (pg->'rows'->0->>'id')::uuid = g2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page(null, null, null, null, 'CANCELLED', null, null, 10, 0);
  res := res || 'G5 cancelled filter: ' || case when (pg->>'total')::int >= 1 and (pg->'rows'->0->>'id')::uuid = g3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page('grx1', null, null, null, null, null, null, 10, 0);
  res := res || 'G6 search by an item on the receipt (' || (pg->>'total') || ', want 2): ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page('inv-grx', null, null, null, null, null, null, 10, 0);
  res := res || 'G7 search by invoice number: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page(null, null, null, null, null, current_date + 1, null, 10, 0);
  res := res || 'G8 date range from tomorrow finds nothing: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.receipts_page(null, null, null, null, null, null, null, 10, 0);
  res := res || 'G9 numbers present: ' || case when pg->'kpi' ?& array['total','today','draft','posted','partial','cancelled','new_month'] and (pg->'kpi'->>'today')::int >= 1 and (pg->'kpi'->>'partial')::int >= 1 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  pg := public.receipts_page('%', null, null, null, null, null, null, 10, 0);
  res := res || 'G10 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.receipts_page(null, null, null, null, 'BOGUS', null, null, 10, 0); res := res || 'G11 bad status: FAIL' || E'\n';
  exception when others then res := res || 'G11 bad status refused: PASS' || E'\n'; end;
  begin perform public.receipts_page(null, null, null, 'ALIEN', null, null, null, 10, 0); res := res || 'G12 bad source: FAIL' || E'\n';
  exception when others then res := res || 'G12 bad source refused: PASS' || E'\n'; end;
  reset role;

  -- a receipts.view user without purchase rights: sees receipts, but the order number is empty
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.receipts_page(null, null, null, null, null, null, null, 50, 0);
  res := res || 'G13 viewer without purchase rights sees receipts but no order number: ' ||
    case when (pg->>'total')::int >= 3 and (select bool_and(e->'po_no' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.receipts_page(null, null, null, null, null, null, null, 10, 0); res := res || 'G14 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'G14 a user without receipt rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.receipts_page(null, null, null, null, null, null, null, 10, 0); res := res || 'G15 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'G15 anonymous is denied: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 029 RESULTS (rolled back):\n%', res;
end $$;
