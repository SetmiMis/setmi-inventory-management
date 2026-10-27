-- Test 032: stock_ledger_page and person_name (migration 42). Rolled back at the end. Makes its own users, places, supplier and items.
-- Searches use the code prefix LGX so other data in the database does not disturb the counts.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; wh2 uuid; sup uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; nm text;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true, full_name = 'Amit Kumar Sharma' where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'stock.view'), (viewer, 'items.view');
  insert into public.locations (code, name, type) values ('WHL1', 'Warehouse L1', 'WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('WHL2', 'Warehouse L2', 'WAREHOUSE') returning id into wh2;
  insert into public.user_locations values (viewer, wh);
  insert into public.suppliers (name, supplier_type) values ('TEST LEDGER SUP', 'LOCAL') returning id into sup;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('LGX-A','ledger a','ledger a','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('LGX-B','ledger b','ledger b','LOCAL','PCS',10) returning id into ib;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  -- two receipts of item A in the first place: +10 then +5
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 5, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 3, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);

  pg := public.stock_ledger_page('lgx', null, wh, null, null, null, 50, 0);
  res := res || 'L1 three ledger lines in the first place (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'L2 running balance of item A is 10 then 15 (newest first): ' || case when
    (select string_agg(e->>'balance', ',' order by (e->>'id')::bigint) from jsonb_array_elements(pg->'rows') e where e->>'code' = 'LGX-A') = '10.000,15.000' then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'L3 in quantity is filled and out quantity empty for a receipt: ' || case when (select bool_and(e->'in_qty' <> 'null'::jsonb and e->'out_qty' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  nm := (pg->'rows'->0->>'user_name');
  res := res || 'L4 user shown as first name + initial of last name (' || coalesce(nm, '?') || '): ' || case when nm = 'Amit S.' then 'PASS' else 'FAIL' end || E'\n';
  -- a count correction of -2 on item A (stock count)
  perform public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id', ia, 'counted', 13)), 'test count', 'ADJUSTMENT');
  pg := public.stock_ledger_page('lgx', null, wh, 'ADJUSTMENT', null, null, 50, 0);
  res := res || 'L5 type filter ADJUSTMENT finds the count line with out 2 and balance 13: ' ||
    case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'out_qty')::numeric = 2 and (pg->'rows'->0->>'balance')::numeric = 13 then 'PASS' else 'FAIL ' || coalesce((pg->'rows'->0)::text, 'no row') end || E'\n';
  pg := public.stock_ledger_page('lgx', null, null, 'RECEIPT', current_date, current_date, 50, 0);
  res := res || 'L6 type and date filters together (' || (pg->>'total') || ', want 3): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_ledger_page('lgx', null, null, null, current_date + 1, null, 50, 0);
  res := res || 'L7 date from tomorrow finds nothing: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_ledger_page('%', null, null, null, null, null, 50, 0);
  res := res || 'L8 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_ledger_page(null, null, null, null, null, null, 5, 0);
  res := res || 'L9 numbers present: ' || case when pg->'kpi' ?& array['total','in','out','transfer','adjust','return'] and (pg->'kpi'->>'in')::numeric >= 18 and (pg->'kpi'->>'adjust')::numeric >= 2 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  begin perform public.stock_ledger_page(null, null, null, 'BOGUS', null, null, 10, 0); res := res || 'L10 bad type: FAIL' || E'\n';
  exception when others then res := res || 'L10 bad type refused: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.stock_ledger_page('lgx', null, null, null, null, null, 50, 0);
  res := res || 'L11 viewer sees the ledger of his own place only (' || (pg->>'total') || ' lines): ' || case when (pg->>'total')::int = 4 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.stock_ledger_page(null, null, null, null, null, null, 10, 0); res := res || 'L13 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'L13 a user without stock rights is refused: PASS' || E'\n'; end;
  res := res || 'L14 person_name is empty for a user without stock rights: ' || case when public.person_name(adm) is null then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  set local role anon;
  begin perform public.stock_ledger_page(null, null, null, null, null, null, 10, 0); res := res || 'L15 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'L15 anonymous is denied: PASS' || E'\n'; end;
  begin perform public.person_name(adm); res := res || 'L16 anonymous person_name: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'L16 anonymous cannot ask for a name: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 032 RESULTS (rolled back):\n%', res;
end $$;
