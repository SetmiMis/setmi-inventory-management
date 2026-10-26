-- Test 035: physical counts with approval (migration 45). Rolled back at the end. Makes its own users, place, supplier, category and items.
-- Searches use the item code prefix PCX.
do $$
declare
  adm uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; sup uuid; cat uuid; ia uuid; ib uuid; ic uuid; r jsonb; res text := ''; pg jsonb; c1 uuid; c2 uuid; c3 uuid; c4 uuid; bal numeric; n int;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(staff,'s@t.l'),(mgr,'m@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, staff, mgr, viewer, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (staff, 'stock.adjust'), (staff, 'stock.view'), (staff, 'items.view'),
    (mgr, 'stock.adjust'), (mgr, 'stock.view'), (mgr, 'items.view'), (mgr, 'stock.approve'), (mgr, 'stock.entry'),
    (viewer, 'stock.view'), (viewer, 'items.view');
  insert into public.locations (code, name, type) values ('WHP', 'Warehouse PC', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (staff, wh), (mgr, wh), (viewer, wh);
  insert into public.suppliers (name, supplier_type) values ('TEST COUNT SUP', 'LOCAL') returning id into sup;
  insert into public.categories (name) values ('TEST COUNT CAT') returning id into cat;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price, category_id) values ('PCX-A','pcx a','pcx a','LOCAL','PCS',10,cat) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PCX-B','pcx b','pcx b','LOCAL','PCS',10) returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PCX-C','pcx c','pcx c','LOCAL','PCS',10) returning id into ic;
  insert into public.reorder_levels (item_id, location_id, min_qty) values (ic, wh, 2);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh),
        jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 10, 'unit_cost', 5), jsonb_build_object('item_id', ib, 'quantity', 5, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  reset role;

  -- the staff member makes a full count
  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_physical_count(jsonb_build_object('location_id', wh, 'count_type', 'FULL'));
  c1 := (r->>'id')::uuid;
  res := res || 'P1 a full count lists the three products of the place (' || (r->>'items') || '): ' || case when (r->>'items')::int = 3 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P2 the number looks like PC-year-number (' || (r->>'count_no') || '): ' || case when (r->>'count_no') ~ '^PC-[0-9]{4}-[0-9]{3,}$' then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P3 system quantities are frozen on the sheet (A 10, B 5, C 0): ' || case when
    (select string_agg(i.internal_item_code || '=' || l.expected::int, ',' order by i.internal_item_code) from public.physical_count_lines l join public.items i on i.id = l.item_id where l.count_id = c1) = 'PCX-A=10,PCX-B=5,PCX-C=0' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_physical_count(jsonb_build_object('location_id', wh, 'count_type', 'LOCATION', 'rack', 'ZZ')); res := res || 'P4 empty scope: FAIL' || E'\n';
  exception when others then res := res || 'P4 a count with nothing in its scope is refused: PASS' || E'\n'; end;
  r := public.create_physical_count(jsonb_build_object('location_id', wh, 'count_type', 'CYCLE', 'category_id', cat));
  res := res || 'P5 a category count holds only that category (' || (r->>'items') || ' item): ' || case when (r->>'items')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  c4 := (r->>'id')::uuid;
  perform public.cancel_physical_count(c4);

  -- stock moves AFTER the freeze: 20 more of A arrive
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 20, 'unit_cost', 5)));
  perform public.post_goods_receipt((r->>'id')::uuid);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.save_physical_count_progress(c1, jsonb_build_array(jsonb_build_object('item_id', ia, 'counted', 8, 'reason', 'MISSING')));
  res := res || 'P6 saving progress moves the status to In Progress: ' || case when (select status from public.physical_counts where id = c1) = 'IN_PROGRESS' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.submit_physical_count(c1); res := res || 'P7 submit with items not counted: FAIL' || E'\n';
  exception when others then res := res || 'P7 submit needs every item counted: PASS' || E'\n'; end;
  perform public.save_physical_count_progress(c1, jsonb_build_array(jsonb_build_object('item_id', ib, 'counted', 6), jsonb_build_object('item_id', ic, 'counted', 0)));
  begin perform public.submit_physical_count(c1); res := res || 'P8 difference without reason: FAIL' || E'\n';
  exception when others then res := res || 'P8 a difference needs a reason: PASS' || E'\n'; end;
  perform public.save_physical_count_progress(c1, jsonb_build_array(jsonb_build_object('item_id', ib, 'counted', 6, 'reason', 'EXTRA')));
  r := public.submit_physical_count(c1);
  res := res || 'P9 a staff submit waits for approval and stock is unchanged: ' ||
    case when (r->>'status') = 'WAITING_APPROVAL' and (select quantity from public.stock_balances where item_id = ia and location_id = wh) = 30 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_physical_count_progress(c1, jsonb_build_array(jsonb_build_object('item_id', ia, 'counted', 9))); res := res || 'P10 edit while waiting: FAIL' || E'\n';
  exception when others then res := res || 'P10 a count that waits cannot be edited: PASS' || E'\n'; end;
  begin perform public.approve_physical_count(c1, null); res := res || 'P11 staff approves: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'P11 staff cannot approve: PASS' || E'\n'; end;
  reset role;

  -- the manager sends it back once, then approves
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.reject_physical_count(c1, ' '); res := res || 'P12 send back without a note: FAIL' || E'\n';
  exception when others then res := res || 'P12 sending back needs a note: PASS' || E'\n'; end;
  perform public.reject_physical_count(c1, 'count A again');
  res := res || 'P13 sent back goes to In Progress with the note: ' || case when (select status from public.physical_counts where id = c1) = 'IN_PROGRESS' and (select decision_note from public.physical_counts where id = c1) = 'count A again' then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.submit_physical_count(c1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.approve_physical_count(c1, 'ok');
  select quantity into bal from public.stock_balances where item_id = ia and location_id = wh;
  res := res || 'P14 approval applies only the difference: A 30 - 2 = 28 (' || bal || '): ' || case when bal = 28 then 'PASS' else 'FAIL' end || E'\n';
  select quantity into bal from public.stock_balances where item_id = ib and location_id = wh;
  res := res || 'P15 B 5 + 1 = 6 (' || bal || '): ' || case when bal = 6 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P16 movements are ADJUSTMENT with the count number: ' || case when (select count(*) from public.stock_movements m where m.reference = (select count_no from public.physical_counts where id = c1) and m.movement_type::text = 'ADJUSTMENT') = 2 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.approve_physical_count(c1, null); res := res || 'P17 approve twice: FAIL' || E'\n';
  exception when others then res := res || 'P17 a count cannot be approved twice: PASS' || E'\n'; end;

  -- the manager's own count is applied at once; and a later stock-out can make an approval impossible
  r := public.create_physical_count(jsonb_build_object('location_id', wh, 'count_type', 'CYCLE', 'category_id', cat));
  c2 := (r->>'id')::uuid;
  perform public.save_physical_count_progress(c2, jsonb_build_array(jsonb_build_object('item_id', ia, 'counted', 25, 'reason', 'DAMAGE_EXPIRY')));
  r := public.submit_physical_count(c2);
  select quantity into bal from public.stock_balances where item_id = ia and location_id = wh;
  res := res || 'P18 the manager''s own count is applied at once: 28 - 3 = 25 (' || bal || '): ' || case when (r->>'status') = 'COMPLETED' and bal = 25 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.create_physical_count(jsonb_build_object('location_id', wh, 'count_type', 'CYCLE', 'category_id', cat));
  c3 := (r->>'id')::uuid;
  perform public.save_physical_count_progress(c3, jsonb_build_array(jsonb_build_object('item_id', ia, 'counted', 0, 'reason', 'MISSING')));
  perform public.submit_physical_count(c3);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.create_stock_entry(jsonb_build_object('location_id', wh, 'direction', 'OUT', 'reason', 'LOST'), jsonb_build_array(jsonb_build_object('item_id', ia, 'quantity', 5)));
  -- stock is now 20, the count says 25 -> 0 (change -25): would go below zero
  begin perform public.approve_physical_count(c3, null); res := res || 'P19 approval that would make stock negative: FAIL' || E'\n';
  exception when others then res := res || 'P19 an approval that would make stock negative is refused: PASS' || E'\n'; end;
  perform public.cancel_physical_count(c3);
  res := res || 'P20 a waiting count can be cancelled: ' || case when (select status from public.physical_counts where id = c3) = 'CANCELLED' then 'PASS' else 'FAIL' end || E'\n';

  -- the screen
  pg := public.physical_counts_page('pcx', null, null, null, null, null, 50, 0);
  res := res || 'P21 the screen finds the four counts by item search (' || (pg->>'total') || '): ' || case when (pg->>'total')::int = 4 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.physical_counts_page(null, wh, 'CYCLE', 'COMPLETED', null, null, 50, 0);
  res := res || 'P22 filter place + type + status finds the manager''s count: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = c2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.physical_counts_page(null, null, null, null, null, null, 5, 0);
  res := res || 'P23 numbers, reasons and a 30-day trend are there: ' ||
    case when pg->'kpi' ?& array['total','completed','in_progress','pending','waiting','variance_qty','variance_value','new_month'] and jsonb_array_length(pg->'trend') = 30
      and (pg->'kpi'->>'completed')::int >= 2 and (pg->'kpi'->>'variance_qty')::numeric >= 6 and jsonb_array_length(pg->'reasons') >= 1 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  pg := public.physical_counts_page('%', null, null, null, null, null, 5, 0);
  res := res || 'P24 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.physical_counts_page(null, null, 'SIDEWAYS', null, null, null, 5, 0); res := res || 'P25 bad type: FAIL' || E'\n';
  exception when others then res := res || 'P25 bad type refused: PASS' || E'\n'; end;
  begin insert into public.physical_count_lines (count_id, item_id, expected) values (c1, ib, 1); res := res || 'P26 direct write: FAIL' || E'\n';
  exception when others then res := res || 'P26 no direct table writes: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.physical_counts_page('pcx', null, null, null, null, null, 50, 0);
  res := res || 'P27 a viewer sees the counts but no values: ' || case when (pg->>'total')::int = 4 and pg->'kpi'->'variance_value' = 'null'::jsonb then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_physical_count(jsonb_build_object('location_id', wh, 'count_type', 'FULL')); res := res || 'P28 viewer makes a count: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'P28 a viewer cannot make a count: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.physical_counts_page(null, null, null, null, null, null, 10, 0); res := res || 'P29 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'P29 a user without stock rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.approve_physical_count(c1, null); res := res || 'P30 anonymous approves: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'P30 anonymous cannot approve: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 035 RESULTS (rolled back):\n%', res;
end $$;
