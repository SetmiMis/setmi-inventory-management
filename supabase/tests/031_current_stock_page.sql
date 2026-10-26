-- Test 031: current_stock_page (migration 41). Rolled back at the end. Makes its own users, places, supplier, category, items and receipts.
-- Searches use the code prefix STX so other data in the database does not disturb the counts.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; wh2 uuid; sup uuid; ia uuid; ib uuid; ic uuid; id_ uuid; cat uuid; r jsonb; res text := ''; pg jsonb;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'stock.view'), (viewer, 'items.view');
  insert into public.locations (code, name, type) values ('WHS1', 'Warehouse S1', 'WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('WHS2', 'Warehouse S2', 'WAREHOUSE') returning id into wh2;
  insert into public.user_locations values (viewer, wh);
  insert into public.suppliers (name, supplier_type) values ('TEST STOCK SUP', 'LOCAL') returning id into sup;
  insert into public.categories (name) values ('TEST STOCK CAT') returning id into cat;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('STX-A','stock a','stock a','LOCAL','PCS',10,cat) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('STX-B','stock b','stock b','LOCAL','PCS',10) returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('STX-C','stock c','stock c','LOCAL','PCS',10) returning id into ic;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('STX-D','stock d','stock d','LOCAL','PCS',10) returning id into id_;
  insert into public.item_barcodes (item_id, barcode) values (ia, 'BARSTXA123');
  insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (ia, wh, 20, null), (ib, wh, 5, 40), (ic, wh, 5, null);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 50, 'unit_cost', 10), jsonb_build_object('item_id', id_, 'quantity', 30, 'unit_cost', 2)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh2),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 7)));
  perform public.post_goods_receipt((r->>'id')::uuid);

  pg := public.current_stock_page('stx', null, wh, null, 50, 0);
  res := res || 'C1 four lines in the first place (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 4 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'C2 statuses LOW / OVER / OUT / IN: ' || case when
    (select string_agg(e->>'code' || '=' || (e->>'status'), ',' order by e->>'code') from jsonb_array_elements(pg->'rows') e) = 'STX-A=LOW,STX-B=OVER,STX-C=OUT,STX-D=IN' then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'C3 average cost of A is the weighted 5 and 7 = 6 and value 60 (' || coalesce((select e->>'avg_cost' from jsonb_array_elements(pg->'rows') e where e->>'code' = 'STX-A'), '?') || '): ' ||
    case when (select (e->>'avg_cost')::numeric = 6 and (e->>'value')::numeric = 60 from jsonb_array_elements(pg->'rows') e where e->>'code' = 'STX-A') then 'PASS' else 'FAIL' end || E'\n';
  pg := public.current_stock_page('stx', null, null, 'LOW', 50, 0);
  res := res || 'C4 status filter LOW finds only A in the first place (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'code') = 'STX-A' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.current_stock_page(null, cat, null, null, 50, 0);
  res := res || 'C5 category filter gives A in both places (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.current_stock_page('barstxa', null, null, null, 50, 0);
  res := res || 'C6 search by barcode: ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.current_stock_page('%', null, null, null, 50, 0);
  res := res || 'C7 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.current_stock_page(null, null, null, null, 50, 0);
  res := res || 'C8 numbers present: ' || case when pg->'kpi' ?& array['items','qty','value','low','out','over'] and (pg->'kpi'->>'low')::int >= 1 and (pg->'kpi'->>'out')::int >= 1 and (pg->'kpi'->>'over')::int >= 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.current_stock_page(null, null, null, 'BOGUS', 10, 0); res := res || 'C9 bad status: FAIL' || E'\n';
  exception when others then res := res || 'C9 bad status refused: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.current_stock_page('stx', null, null, null, 50, 0);
  res := res || 'C10 viewer sees only the place he works in (' || (pg->>'total') || ' lines) and no cost: ' ||
    case when (pg->>'total')::int = 4 and (select bool_and(e->'avg_cost' = 'null'::jsonb and e->'value' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) and pg->'kpi'->'value' = 'null'::jsonb then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.current_stock_page(null, null, null, null, 10, 0); res := res || 'C11 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'C11 a user without stock rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.current_stock_page(null, null, null, null, 10, 0); res := res || 'C12 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'C12 anonymous is denied: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 031 RESULTS (rolled back):\n%', res;
end $$;
