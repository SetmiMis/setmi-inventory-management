-- Test 030: quality checks (migration 40). Rolled back at the end. Makes its own users, place, supplier, items and receipts.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; sup uuid; i1 uuid; i2 uuid; r jsonb; res text := ''; pg jsonb; g1 uuid; g2 uuid; gd uuid; q1 uuid; q2 uuid; n int; l1 bigint; l2 bigint; stock_before numeric; stock_after numeric;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true, full_name = 'Test Inspector' where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'qc.view'), (viewer, 'receipts.view');
  insert into public.locations (code, name, type) values ('WHQ', 'Warehouse Q', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (viewer, wh);
  insert into public.suppliers (name, supplier_type, country) values ('TEST QC SUP', 'LOCAL', 'India') returning id into sup;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('QCX1','qcx one','qcx one','LOCAL','PCS',10) returning id into i1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('QCX2','qcx two','qcx two','LOCAL','PCS',10) returning id into i2;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh, 'supplier_invoice_no', 'QC-INV-1'),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 10, 'unit_cost', 5), jsonb_build_object('item_id', i2, 'quantity', 4, 'unit_cost', 5)));
  g1 := (r->>'id')::uuid; perform public.post_goods_receipt(g1);
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh, 'supplier_invoice_no', 'QC-INV-2'),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 6, 'unit_cost', 5)));
  g2 := (r->>'id')::uuid; perform public.post_goods_receipt(g2);
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id', sup, 'location_id', wh, 'supplier_invoice_no', 'QC-INV-3'),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 1, 'unit_cost', 5)));
  gd := (r->>'id')::uuid;
  select id into l1 from public.goods_receipt_lines where receipt_id = g1 and item_id = i1;
  select id into l2 from public.goods_receipt_lines where receipt_id = g1 and item_id = i2;
  select coalesce(sum(quantity), 0) into stock_before from public.stock_balances where item_id = i1 and location_id = wh;

  -- Q1 create on a posted receipt
  r := public.create_quality_check(g1); q1 := (r->>'id')::uuid;
  res := res || 'Q1 start a check gives a number (' || (r->>'qc_no') || '): ' || case when (r->>'qc_no') ~ '^QC-[0-9]{4}-[0-9]{3,}$' then 'PASS' else 'FAIL' end || E'\n';
  pg := public.quality_checks_page(null, null, null, 'PENDING', null, null, 10, 0);
  res := res || 'Q2 a new check is Pending with one line per item: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'items')::int = 2 and (pg->'rows'->0->>'status') = 'PENDING' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_quality_check(g1); res := res || 'Q3 second check on the same receipt: FAIL' || E'\n';
  exception when others then res := res || 'Q3 one check per receipt: PASS' || E'\n'; end;
  begin perform public.create_quality_check(gd); res := res || 'Q4 draft receipt: FAIL' || E'\n';
  exception when others then res := res || 'Q4 a draft receipt cannot be checked: PASS' || E'\n'; end;
  -- Q5 results must add up
  begin perform public.save_quality_check_results(q1, current_date, null, jsonb_build_array(
      jsonb_build_object('receipt_line_id', l1, 'passed', 9, 'rejected', 0, 'rework', 0), jsonb_build_object('receipt_line_id', l2, 'passed', 4, 'rejected', 0, 'rework', 0)));
    res := res || 'Q5 numbers that do not add up: FAIL' || E'\n';
  exception when others then res := res || 'Q5 passed + rejected + rework must equal received: PASS' || E'\n'; end;
  -- Q6 reason needed
  begin perform public.save_quality_check_results(q1, current_date, null, jsonb_build_array(
      jsonb_build_object('receipt_line_id', l1, 'passed', 8, 'rejected', 2, 'rework', 0), jsonb_build_object('receipt_line_id', l2, 'passed', 4, 'rejected', 0, 'rework', 0)));
    res := res || 'Q6 rejected without reason: FAIL' || E'\n';
  exception when others then res := res || 'Q6 a reason is needed for rejected pieces: PASS' || E'\n'; end;
  -- Q7 future date
  begin perform public.save_quality_check_results(q1, current_date + 3, null, jsonb_build_array(
      jsonb_build_object('receipt_line_id', l1, 'passed', 10, 'rejected', 0, 'rework', 0), jsonb_build_object('receipt_line_id', l2, 'passed', 4, 'rejected', 0, 'rework', 0)));
    res := res || 'Q7 future date: FAIL' || E'\n';
  exception when others then res := res || 'Q7 a future QC date is refused: PASS' || E'\n'; end;
  -- Q8 good save with rejects -> Rejected, inspector name
  perform public.save_quality_check_results(q1, current_date, 'some damaged', jsonb_build_array(
      jsonb_build_object('receipt_line_id', l1, 'passed', 8, 'rejected', 2, 'rework', 0, 'reason', 'Physical damage'), jsonb_build_object('receipt_line_id', l2, 'passed', 4, 'rejected', 0, 'rework', 0)));
  pg := public.quality_checks_page(null, null, null, 'REJECTED', null, null, 10, 0);
  res := res || 'Q8 saved results give status Rejected with numbers 12 / 2 and inspector name: ' ||
    case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'passed')::numeric = 12 and (pg->'rows'->0->>'rejected')::numeric = 2 and (pg->'rows'->0->>'inspector_name') = 'Test Inspector' then 'PASS' else 'FAIL ' || coalesce((pg->'rows'->0)::text, '') end || E'\n';
  -- Q9 stock is NOT changed by QC
  select coalesce(sum(quantity), 0) into stock_after from public.stock_balances where item_id = i1 and location_id = wh;
  res := res || 'Q9 quality check does not change stock (' || stock_before || ' -> ' || stock_after || '): ' || case when stock_before = stock_after then 'PASS' else 'FAIL' end || E'\n';
  -- Q10 second check: rework, then passed
  r := public.create_quality_check(g2); q2 := (r->>'id')::uuid;
  perform public.save_quality_check_results(q2, current_date, null, jsonb_build_array(
      jsonb_build_object('receipt_line_id', (select id from public.goods_receipt_lines where receipt_id = g2), 'passed', 5, 'rejected', 0, 'rework', 1, 'reason', 'Wrong label')));
  pg := public.quality_checks_page(null, null, null, 'REWORK', null, null, 10, 0);
  res := res || 'Q10 only rework pieces give status Rework: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  perform public.save_quality_check_results(q2, current_date, null, jsonb_build_array(
      jsonb_build_object('receipt_line_id', (select id from public.goods_receipt_lines where receipt_id = g2), 'passed', 6, 'rejected', 0, 'rework', 0)));
  pg := public.quality_checks_page(null, null, null, 'PASSED', null, null, 10, 0);
  res := res || 'Q11 a recheck can change the result to Passed: ' || case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'id')::uuid = q2 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.quality_checks_page(null, null, null, null, null, null, 10, 0);
  res := res || 'Q12 numbers: ' || case when (pg->'kpi'->>'total')::int = 2 and (pg->'kpi'->>'passed')::int = 1 and (pg->'kpi'->>'rejected')::int = 1 and (pg->'kpi'->>'pending')::int = 0 and (pg->'kpi'->>'rework')::int = 0 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  pg := public.quality_checks_page('qcx2', null, null, null, null, null, 10, 0);
  res := res || 'Q13 search by item (' || (pg->>'total') || ', want 1): ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.quality_checks_page('%', null, null, null, null, null, 10, 0);
  res := res || 'Q14 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.quality_checks_page(null, null, null, 'BOGUS', null, null, 10, 0); res := res || 'Q15 bad status: FAIL' || E'\n';
  exception when others then res := res || 'Q15 bad status refused: PASS' || E'\n'; end;
  begin insert into public.quality_check_lines (qc_id, receipt_line_id) values (q1, l1); res := res || 'Q16 direct write: FAIL' || E'\n';
  exception when others then res := res || 'Q16 no direct table writes: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.quality_checks_page(null, null, null, null, null, null, 10, 0);
  res := res || 'Q17 a viewer sees the checks: ' || case when (pg->>'total')::int = 2 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_quality_check(g1); res := res || 'Q18 viewer starts a check: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'Q18 a viewer cannot start a check: PASS' || E'\n'; end;
  begin perform public.save_quality_check_results(q1, current_date, null, '[]'::jsonb); res := res || 'Q19 viewer saves results: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'Q19 a viewer cannot save results: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.quality_checks_page(null, null, null, null, null, null, 10, 0); res := res || 'Q20 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'Q20 a user without quality-check rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.quality_checks_page(null, null, null, null, null, null, 10, 0); res := res || 'Q21 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'Q21 anonymous is denied: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 030 RESULTS (rolled back):\n%', res;
end $$;
