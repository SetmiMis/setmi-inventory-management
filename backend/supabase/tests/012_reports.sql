-- Tests for 20261025000015 (reports). Ends with a deliberate exception (rollback). Every line should say PASS.
-- Assumes billing_enabled is OFF at the start; the test switches it ON inside the rolled-back transaction.
do $$
declare
  adm uuid := gen_random_uuid(); r1 uuid := gen_random_uuid(); nr uuid := gen_random_uuid(); ns uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  sh uuid; oth uuid; wh uuid; pc uuid; mt uuid; dd uuid; vd uuid; b1 uuid; b2 uuid; t1 uuid; x jsonb;
  res text := ''; cnt int; q numeric; tot numeric; n2 numeric; v_cash numeric; v_upi numeric; bl bigint; lastd date;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(r1,'r1@t.l'),(nr,'nr@t.l'),(ns,'ns@t.l'),(o,'o@t.l');
  update public.profiles set is_active = true where id in (adm,r1,nr,ns,o);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (r1,'reports.view'),(r1,'stock.view'),(r1,'bills.view'),(r1,'items.view'),(r1,'transfers.view'),
    (nr,'stock.view'),(nr,'bills.view'),
    (ns,'reports.view'),
    (o,'reports.view'),(o,'stock.view'),(o,'bills.view');
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.locations (code, name, type) values ('OTH','Other shop','SHOP') returning id into oth;
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.user_locations values (r1, sh), (r1, wh), (nr, sh), (ns, sh), (o, oth);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PC','pc','Bill PC','LOCAL','PCS',100) returning id into pc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('MT','mt','Wire per metre','LOCAL','MTR',40) returning id into mt;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('DD','dd','Dead item','LOCAL','PCS',10) returning id into dd;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('VD','vd','Voided sale item','LOCAL','PCS',5) returning id into vd;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values
    (vd, sh, 4, 'OPENING'), (pc, sh, 10, 'OPENING'), (mt, sh, 20, 'OPENING'), (dd, sh, 7, 'OPENING'), (pc, oth, 3, 'OPENING'), (pc, wh, 50, 'OPENING');
  insert into public.reorder_levels (item_id, location_id, min_qty) values (pc, sh, 20);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  perform public.admin_set_billing_enabled(true);
  -- a transfer that is SENT (stock on its way) from the warehouse to the shop
  set local role authenticated;
  x := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',5)));
  t1 := (x->>'id')::uuid;
  perform public.send_stock_transfer(t1);
  -- two bills at the shop: one cash 200 (2 x PC), one UPI 80 (2 x MT) that is voided later; plus one more UPI 100
  x := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',2)));
  b1 := (x->>'id')::uuid;
  x := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','UPI'), jsonb_build_array(jsonb_build_object('item_id',mt,'quantity',2)));
  b2 := (x->>'id')::uuid;
  x := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','UPI'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
  perform public.void_bill(b2, 'test void');
  x := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',vd,'quantity',1)));
  perform public.void_bill((x->>'id')::uuid, 'void vd');
  reset role;

  -- R1: no reports.view => every report refuses, even with stock.view and bills.view
  perform set_config('request.jwt.claims', json_build_object('sub',nr,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.report_stock_by_place(null); res := res || 'R1a no reports.view: FAIL' || E'\n';
  exception when others then res := res || 'R1a stock report refused without reports.view (' || sqlerrm || '): ' || case when sqlerrm like 'You do not have access%' then 'PASS' else 'FAIL' end || E'\n'; end;
  begin perform * from public.report_sales_by_day(current_date - 1, current_date, null); res := res || 'R1b: FAIL' || E'\n';
  exception when others then res := res || 'R1b sales report refused without reports.view: PASS' || E'\n'; end;
  begin perform * from public.report_low_stock(null); res := res || 'R1c: FAIL' || E'\n';
  exception when others then res := res || 'R1c low stock refused without reports.view: PASS' || E'\n'; end;
  reset role;

  -- R2: stock by place, only own places, quantity and in-transit
  perform set_config('request.jwt.claims', json_build_object('sub',r1,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.report_stock_by_place(null) where location_code = 'OTH';
  res := res || 'R2a rows of a place the user is not in (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  select quantity, in_transit_to_here into q, n2 from public.report_stock_by_place(sh) where item_id = pc;
  res := res || 'R2b shop PC stock ' || coalesce(q::text,'?') || ' (want 7 = 10 - 2 - 1) and on the way ' || coalesce(n2::text,'?') || ' (want 5): ' || case when q = 7 and n2 = 5 then 'PASS' else 'FAIL' end || E'\n';
  select count(distinct location_code) into cnt from public.report_stock_by_place(null);
  res := res || 'R2c all places lists SH and WH only (' || cnt || '): ' || case when cnt = 2 then 'PASS' else 'FAIL' end || E'\n';

  -- R3: low stock
  select shortfall into q from public.report_low_stock(null) where internal_item_code = 'PC' and location_code = 'SH';
  res := res || 'R3 PC at shop is below minimum 20 with 7: shortfall ' || coalesce(q::text,'?') || ' (want 13): ' || case when q = 13 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.report_low_stock(null) where internal_item_code = 'MT';
  res := res || 'R3b an item without a minimum is not listed (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';

  -- R4: sales by day, voided bill not counted
  select rs.bills, rs.total, rs.cash, rs.upi into bl, tot, v_cash, v_upi from public.report_sales_by_day(current_date - 1, current_date + 1, null) rs where rs.location_code = 'SH' limit 1;
  res := res || 'R4 bills ' || coalesce(bl::text,'?') || ' (want 2, the voided one is out), total ' || coalesce(tot::text,'?') || ' (want 300), cash ' || coalesce(v_cash::text,'?') || ' (want 200), upi ' || coalesce(v_upi::text,'?') || ' (want 100): ' ||
    case when bl = 2 and tot = 300 and v_cash = 200 and v_upi = 100 then 'PASS' else 'FAIL' end || E'\n';

  -- R5: sales by item
  select quantity, amount into q, tot from public.report_sales_by_item(current_date - 1, current_date + 1, null) where item_code = 'PC';
  select count(*) into cnt from public.report_sales_by_item(current_date - 1, current_date + 1, null) where item_code = 'MT';
  res := res || 'R5 PC sold ' || coalesce(q::text,'?') || ' for ' || coalesce(tot::text,'?') || ' (want 3 for 300); voided MT not listed (' || cnt || '): ' || case when q = 3 and tot = 300 and cnt = 0 then 'PASS' else 'FAIL' end || E'\n';

  -- R6: dead stock
  select count(*) into cnt from public.report_dead_stock(30, sh) where internal_item_code = 'DD';
  select count(*) into n2 from public.report_dead_stock(30, sh) where internal_item_code = 'PC';
  res := res || 'R6 DD never sold is listed (' || cnt || '), PC sold today is not (' || n2 || '): ' || case when cnt = 1 and n2 = 0 then 'PASS' else 'FAIL' end || E'\n';

  select count(*) into cnt from public.report_dead_stock(30, sh) where internal_item_code = 'VD';
  res := res || 'R6b VD whose only sale was voided is still listed as slow (' || cnt || '): ' || case when cnt = 1 then 'PASS' else 'FAIL' end || E'\n';

  -- R7: input limits
  begin perform * from public.report_sales_by_day(current_date - 400, current_date, null); res := res || 'R7a range over a year: FAIL' || E'\n';
  exception when others then res := res || 'R7a a range over one year is refused: PASS' || E'\n'; end;
  begin perform * from public.report_dead_stock(0, null); res := res || 'R7b zero days: FAIL' || E'\n';
  exception when others then res := res || 'R7b zero days is refused: PASS' || E'\n'; end;
  reset role;

  -- R8: reports.view alone shows nothing (row security still applies)
  perform set_config('request.jwt.claims', json_build_object('sub',ns,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.report_stock_by_place(null); res := res || 'R8a reports.view without stock.view: FAIL' || E'\n';
  exception when others then res := res || 'R8a stock report says it needs stock.view (' || sqlerrm || '): ' || case when sqlerrm like '%stock.view%' then 'PASS' else 'FAIL' end || E'\n'; end;
  begin perform * from public.report_sales_by_day(current_date - 1, current_date + 1, null); res := res || 'R8b reports.view without bills.view: FAIL' || E'\n';
  exception when others then res := res || 'R8b sales report says it needs bills.view (' || sqlerrm || '): ' || case when sqlerrm like '%bills.view%' then 'PASS' else 'FAIL' end || E'\n'; end;
  reset role;

  -- R9: a user of another place sees nothing of the shop
  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.report_sales_by_day(current_date - 1, current_date + 1, null);
  select count(*) into n2 from public.report_stock_by_place(null) where location_code <> 'OTH';
  res := res || 'R9 other place: sales rows ' || cnt || ', stock rows of other places ' || n2 || ' (want 0 and 0): ' || case when cnt = 0 and n2 = 0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- R10: anonymous
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin perform * from public.report_low_stock(null); res := res || 'R10 anonymous: FAIL' || E'\n';
  exception when others then res := res || 'R10 anonymous cannot run a report: PASS' || E'\n'; end;
  reset role;

  -- R11: admin sees all places
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  select count(distinct location_code) into cnt from public.report_stock_by_place(null) where location_code in ('SH','OTH','WH');
  res := res || 'R11 admin sees all three places (' || cnt || '): ' || case when cnt = 3 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
