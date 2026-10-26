-- Test 034: stock entry approval, stock_adjustments_page and the ledger STOCK_IN filter (migration 44).
-- Rolled back at the end. Makes its own users, place, supplier and items. Searches use the item code prefix APX.
do $$
declare
  adm uuid := gen_random_uuid(); req uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; sup uuid; ia uuid; ib uuid; r jsonb; res text := ''; pg jsonb; e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid; bal numeric; n int;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(req,'r@t.l'),(mgr,'m@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, req, mgr, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (req, 'stock.entry'), (req, 'stock.view'), (req, 'items.view'),
    (mgr, 'stock.entry'), (mgr, 'stock.view'), (mgr, 'items.view'), (mgr, 'stock.approve');
  insert into public.locations (code, name, type) values ('WHA', 'Warehouse AP', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (req, wh), (mgr, wh);
  insert into public.suppliers (name, supplier_type) values ('TEST APPROVAL SUP', 'LOCAL') returning id into sup;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('APX-A','apx a','apx a','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('APX-B','apx b','apx b','LOCAL','PCS',10) returning id into ib;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 100, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 10, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  reset role;

  -- the requester makes an OUT entry: it must wait
  perform set_config('request.jwt.claims', json_build_object('sub',req,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_stock_entry(jsonb_build_object('location_id', wh, 'direction', 'OUT', 'reason', 'DAMAGED', 'remarks', 'broken'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 30)));
  e1 := (r->>'id')::uuid;
  res := res || 'A1 an entry by a person without stock.approve is PENDING: ' || case when (r->>'status') = 'PENDING' then 'PASS' else 'FAIL' end || E'\n';
  select quantity into bal from public.stock_balances where item_id = ia and location_id = wh;
  res := res || 'A2 pending entry does not change stock (' || bal || '): ' || case when bal = 100 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.stock_movements where reference = (r->>'entry_no');
  res := res || 'A3 pending entry writes no movement: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.approve_stock_entry(e1, null); res := res || 'A4 requester approves: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'A4 the requester cannot approve: PASS' || E'\n'; end;
  -- without an update policy a plain update changes no row (and the guard trigger refuses even the table owner)
  update public.stock_entries set reason = 'LOST', status = 'APPROVED' where id = e1;
  res := res || 'A5 a plain update by the requester changes nothing: ' || case when (select reason || status from public.stock_entries where id = e1) = 'DAMAGEDPENDING' then 'PASS' else 'FAIL' end || E'
';
';
  -- a second and third entry for later
  r := public.create_stock_entry(jsonb_build_object('location_id', wh, 'direction', 'OUT', 'reason', 'LOST'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 5)));
  e2 := (r->>'id')::uuid;
  r := public.create_stock_entry(jsonb_build_object('location_id', wh, 'direction', 'IN', 'reason', 'FOUND'), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 4)));
  e3 := (r->>'id')::uuid;
  r := public.create_stock_entry(jsonb_build_object('location_id', wh, 'direction', 'OUT', 'reason', 'SAMPLE'), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 8)));
  e4 := (r->>'id')::uuid;
  reset role;

  -- the manager decides
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.approve_stock_entry(e1, 'ok');
  select quantity into bal from public.stock_balances where item_id = ia and location_id = wh;
  res := res || 'A7 approving moves the stock (' || bal || ', want 70): ' || case when bal = 70 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'A8 the movement carries the entry number: ' || case when exists (select 1 from public.stock_movements m join public.stock_entries s on s.entry_no = m.reference where s.id = e1 and m.movement_type::text = 'STOCK_OUT' and m.quantity = 30) then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.approve_stock_entry(e1, null); res := res || 'A9 approve twice: FAIL' || E'\n';
  exception when others then res := res || 'A9 an entry cannot be approved twice: PASS' || E'\n'; end;
  begin perform public.reject_stock_entry(e2, '  '); res := res || 'A10 reject without a reason: FAIL' || E'\n';
  exception when others then res := res || 'A10 rejecting needs a reason: PASS' || E'\n'; end;
  perform public.reject_stock_entry(e2, 'not allowed to write off');
  select quantity into bal from public.stock_balances where item_id = ia and location_id = wh;
  res := res || 'A11 rejecting leaves stock as it is (' || bal || '): ' || case when bal = 70 then 'PASS' else 'FAIL' end || E'\n';
  -- stock for B drops before the manager decides: 10 on hand, entry wants 8; first make the manager take 5 out (own entry, approved at once)
  r := public.create_stock_entry(jsonb_build_object('location_id', wh, 'direction', 'OUT', 'reason', 'OWN_USE'), jsonb_build_array(jsonb_build_object('item_id', ib, 'quantity', 5)));
  e5 := (r->>'id')::uuid;
  res := res || 'A12 the manager''s own entry is approved at once: ' || case when (r->>'status') = 'APPROVED' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.approve_stock_entry(e4, null); res := res || 'A13 approving more than is there: FAIL' || E'\n';
  exception when others then res := res || 'A13 approval checks the stock again: PASS' || E'\n'; end;
  perform public.approve_stock_entry(e3, null);
  select quantity into bal from public.stock_balances where item_id = ib and location_id = wh;
  res := res || 'A14 stock in approved: 10 - 5 + 4 = 9 (' || bal || '): ' || case when bal = 9 then 'PASS' else 'FAIL' end || E'\n';

  -- the screen
  pg := public.stock_adjustments_page('apx', null, null, null, null, null, 50, 0);
  res := res || 'A15 the screen lists five entries (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 5 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_adjustments_page('apx', null, 'OUT', 'PENDING', null, null, 50, 0);
  res := res || 'A16 filter OUT + PENDING finds the sample entry only: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = e4 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_adjustments_page('apx', null, null, 'REJECTED', null, null, 50, 0);
  res := res || 'A17 rejected filter: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = e2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.stock_adjustments_page(null, null, null, null, null, null, 5, 0);
  res := res || 'A18 numbers, reasons and a 30-day trend are there: ' ||
    case when pg->'kpi' ?& array['total','increase','decrease','pending','approved','rejected','new_month'] and jsonb_array_length(pg->'trend') = 30
      and (pg->'kpi'->>'pending')::int >= 1 and (pg->'kpi'->>'increase')::numeric >= 4 and (pg->'kpi'->>'decrease')::numeric >= 35 and jsonb_array_length(pg->'reasons') >= 1 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  pg := public.stock_adjustments_page('%', null, null, null, null, null, 5, 0);
  res := res || 'A19 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.stock_adjustments_page(null, null, 'SIDEWAYS', null, null, null, 5, 0); res := res || 'A20 bad type: FAIL' || E'\n';
  exception when others then res := res || 'A20 bad type refused: PASS' || E'\n'; end;
  pg := public.stock_ledger_page('apx', null, null, 'STOCK_IN', null, null, 50, 0);
  res := res || 'A21 the ledger accepts the type STOCK_IN (' || (pg->>'total') || ' line): ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.stock_adjustments_page(null, null, null, null, null, null, 10, 0); res := res || 'A22 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'A22 a user without stock rights is refused: PASS' || E'\n'; end;
  begin perform public.approve_stock_entry(e4, null); res := res || 'A23 stranger approves: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'A23 a stranger cannot approve: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.approve_stock_entry(e4, null); res := res || 'A24 anonymous approves: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'A24 anonymous cannot approve: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 034 RESULTS (rolled back):\n%', res;
end $$;
