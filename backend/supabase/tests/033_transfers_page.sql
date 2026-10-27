-- Test 033: transfers_page (migration 43). Rolled back at the end. Makes its own users, places, supplier and items.
-- Searches use the place name prefix "TRX" so other data in the database does not disturb the counts.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wa uuid; wb uuid; wc uuid; sup uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; t1 uuid; t2 uuid; t3 uuid; t4 uuid;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true, full_name = 'Rohit Sharma' where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'transfers.view'), (viewer, 'stock.view');
  insert into public.locations (code, name, type) values ('TRXA', 'TRX Warehouse A', 'WAREHOUSE') returning id into wa;
  insert into public.locations (code, name, type) values ('TRXB', 'TRX Warehouse B', 'WAREHOUSE') returning id into wb;
  insert into public.locations (code, name, type) values ('TRXC', 'TRX Warehouse C', 'WAREHOUSE') returning id into wc;
  insert into public.user_locations values (viewer, wb);
  insert into public.suppliers (name, supplier_type) values ('TEST TRX SUP', 'LOCAL') returning id into sup;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('TRX-A','trx a','trx a','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('TRX-B','trx b','trx b','LOCAL','PCS',10) returning id into ib;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wa),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 100, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 50, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  -- t1: sent and fully received (Completed)
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id', wa, 'to_location_id', wb, 'notes', 'first'),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10), jsonb_build_object('item_id', ib, 'quantity', 5)));
  t1 := (r->>'id')::uuid; perform public.send_stock_transfer(t1);
  perform public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id', ia, 'received', 10), jsonb_build_object('item_id', ib, 'received', 5)), null);
  -- t2: sent, on the way
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id', wa, 'to_location_id', wb), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 20)));
  t2 := (r->>'id')::uuid; perform public.send_stock_transfer(t2);
  -- t3: draft to another place
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id', wa, 'to_location_id', wc), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 4)));
  t3 := (r->>'id')::uuid;
  -- t4: cancelled draft
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id', wa, 'to_location_id', wc), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 1)));
  t4 := (r->>'id')::uuid; perform public.cancel_stock_transfer(t4);

  pg := public.transfers_page('trx', null, null, null, null, null, 50, 0);
  res := res || 'T1 admin sees the four transfers (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 4 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page(null, wa, wb, 'RECEIVED', null, null, 10, 0);
  res := res || 'T2 filters together: from A, to B, completed (items ' || coalesce(pg->'rows'->0->>'items', '?') || ', qty ' || coalesce(pg->'rows'->0->>'qty', '?') || '): ' ||
    case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'items')::int = 2 and (pg->'rows'->0->>'qty')::numeric = 15 and (pg->'rows'->0->>'id')::uuid = t1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('trx', null, null, 'SENT', null, null, 10, 0);
  res := res || 'T3 in transit filter: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = t2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('trx', null, null, 'DRAFT', null, null, 10, 0);
  res := res || 'T4 draft filter: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = t3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('trx', null, null, 'CANCELLED', null, null, 10, 0);
  res := res || 'T5 cancelled filter: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = t4 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('trx-b', null, null, null, null, null, 10, 0);
  res := res || 'T6 search by an item on the transfer (' || (pg->>'total') || ', want 3: t1, t3, t4): ' || case when (pg->>'total')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('trx', null, null, null, current_date + 1, null, 10, 0);
  res := res || 'T7 date from tomorrow finds nothing: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('%', null, null, null, null, null, 10, 0);
  res := res || 'T8 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page('trx', null, null, null, null, null, 10, 0);
  res := res || 'T9 requested by shows first name and initial (' || coalesce(pg->'rows'->0->>'requested_by', '?') || '): ' || case when pg->'rows'->0->>'requested_by' = 'Rohit S.' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.transfers_page(null, null, null, null, null, null, 10, 0);
  res := res || 'T10 numbers and place lists: ' || case when pg->'kpi' ?& array['total','completed','in_transit','cancelled','draft','new_month']
    and (pg->'kpi'->>'completed')::int >= 1 and (pg->'kpi'->>'in_transit')::int >= 1 and jsonb_array_length(pg->'places') >= 3 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  begin perform public.transfers_page(null, null, null, 'BOGUS', null, null, 10, 0); res := res || 'T11 bad status: FAIL' || E'\n';
  exception when others then res := res || 'T11 bad status refused: PASS' || E'\n'; end;
  reset role;

  -- the viewer works at place B only: sees the transfers that end there (t1, t2) but not the ones between A and C
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.transfers_page('trx', null, null, null, null, null, 50, 0);
  res := res || 'T12 viewer sees only transfers of his place (' || (pg->>'total') || ', want 2): ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.transfers_page(null, null, null, null, null, null, 10, 0); res := res || 'T13 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'T13 a user without transfer rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.transfers_page(null, null, null, null, null, null, 10, 0); res := res || 'T14 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'T14 anonymous is denied: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 033 RESULTS (rolled back):\n%', res;
end $$;
