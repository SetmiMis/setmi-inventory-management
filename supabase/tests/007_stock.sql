-- Tests for 20261025000007_stock.sql. Ends with a deliberate exception (rollback).
-- Every line should say PASS (S1 ... S28).
do $$
declare
  adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); shp uuid := gen_random_uuid(); nop uuid := gen_random_uuid();
  wh uuid; sh uuid; pc uuid; mt uuid;
  res text := ''; r jsonb; n int; q numeric; cnt int;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(mgr,'m@t.l'),(shp,'s@t.l'),(nop,'n@t.l');
  update public.profiles set is_active = true where id in (adm, mgr, shp, nop);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (mgr,'stock.view'),(mgr,'stock.adjust'),(mgr,'stock.min_levels'),
    (shp,'stock.view'),
    (nop,'stock.view'),(nop,'stock.adjust');
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.user_locations (user_id, location_id) values (mgr, wh), (shp, sh), (nop, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('PC-1','pc','pc','LOCAL','PCS') returning id into pc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('MT-1','mt','mt','LOCAL','MTR') returning id into mt;

  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  set local role authenticated;

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',10), jsonb_build_object('item_id',mt,'counted',25.5)), null, 'OPENING');
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  res := res || 'S1 opening stock: changed=' || (r->>'changed') || ', pc=' || q || ': ' || case when (r->>'ok')::boolean and (r->>'changed')::int=2 and q=10 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.stock_movements where item_id = pc and from_location_id is null and to_location_id = wh and movement_type = 'OPENING' and quantity = 10;
  res := res || 'S2 ledger row written (from outside to warehouse): ' || case when cnt=1 then 'PASS' else 'FAIL' end || E'\n';

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',7)), 'damaged in store', 'ADJUSTMENT');
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  select count(*) into cnt from public.stock_movements where item_id = pc and from_location_id = wh and to_location_id is null and quantity = 3 and movement_type = 'ADJUSTMENT';
  res := res || 'S3 adjustment down 10 -> 7 writes a loss of 3: ' || case when q=7 and cnt=1 then 'PASS' else 'FAIL' end || E'\n';

  select count(*) into n from public.stock_movements;
  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',7)), 'same count', 'ADJUSTMENT');
  select count(*) into cnt from public.stock_movements;
  res := res || 'S4 same count writes nothing (changed=' || (r->>'changed') || '): ' || case when (r->>'changed')::int=0 and cnt=n then 'PASS' else 'FAIL' end || E'\n';

  begin
    perform public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',8)), '  ', 'ADJUSTMENT');
    res := res || 'S5 blank reason: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S5 reason is required: PASS' || E'\n';
  end;

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',2.5)), 'bad decimals', 'ADJUSTMENT');
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  res := res || 'S6 pieces cannot be fractions (ok=' || (r->>'ok') || ', pc still ' || q || '): ' || case when not (r->>'ok')::boolean and q=7 then 'PASS' else 'FAIL' end || E'\n';

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',mt,'counted',2.5555)), 'too many decimals', 'ADJUSTMENT');
  res := res || 'S7a metres max 3 decimals, 2.5555 refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',mt,'counted',30.125)), 'metre count', 'ADJUSTMENT');
  select quantity into q from public.stock_balances where item_id = mt and location_id = wh;
  res := res || 'S7b metres accept 30.125 (balance ' || q || '): ' || case when (r->>'ok')::boolean and q=30.125 then 'PASS' else 'FAIL' end || E'\n';

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',-1)), 'negative', 'ADJUSTMENT');
  res := res || 'S8 negative count refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',1), jsonb_build_object('item_id',mt,'counted',-5)), 'mixed', 'ADJUSTMENT');
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  res := res || 'S9 one bad row -> nothing written (pc still ' || q || '): ' || case when not (r->>'ok')::boolean and q=7 then 'PASS' else 'FAIL' end || E'\n';

  r := public.apply_stock_count(wh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',50)), 'again', 'OPENING');
  res := res || 'S10 opening stock twice refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';

  begin
    perform public.apply_stock_count(sh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',5)), 'not my shop', 'ADJUSTMENT');
    res := res || 'S11 counting in a location not assigned: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S11 cannot count in a location you do not work in: PASS' || E'\n';
  end;

  begin
    insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values (pc, wh, 100, 'ADJUSTMENT');
    res := res || 'S12 direct insert into the ledger: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S12 direct insert into the ledger refused: PASS' || E'\n';
  end;
  begin
    update public.stock_balances set quantity = 999 where item_id = pc;
    get diagnostics n = row_count;
    res := res || 'S13 direct balance edit rows ' || n || ' (want 0): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  exception when others then res := res || 'S13 direct balance edit refused: PASS' || E'\n';
  end;

  insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (pc, wh, 5, 20);
  res := res || 'S14 manager sets min/max for own place: PASS' || E'\n';
  begin
    insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (mt, wh, 10, 5);
    res := res || 'S15 max below min: FAIL' || E'\n';
  exception when check_violation then res := res || 'S15 max below min refused: PASS' || E'\n';
  end;
  begin
    insert into public.reorder_levels (item_id, location_id, min_qty) values (pc, sh, 5);
    res := res || 'S16 level for a place not assigned: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S16 level for another place refused: PASS' || E'\n';
  end;

  reset role;
  begin
    update public.stock_movements set quantity = 1 where item_id = pc;
    res := res || 'S17 ledger update: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S17 ledger is append-only (update refused): PASS' || E'\n';
  end;
  begin
    delete from public.stock_movements where item_id = pc;
    res := res || 'S18 ledger delete: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S18 ledger is append-only (delete refused): PASS' || E'\n';
  end;
  insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type) values (pc, wh, sh, 3, 'TRANSFER');
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  select quantity into n from public.stock_balances where item_id = pc and location_id = sh;
  res := res || 'S19 transfer moves stock: warehouse ' || q || ' (want 4), shop ' || n || ' (want 3): ' || case when q=4 and n=3 then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.stock_movements (item_id, from_location_id, to_location_id, quantity, movement_type) values (pc, wh, sh, 5, 'TRANSFER');
    res := res || 'S20 moving more than exists: FAIL (allowed)' || E'\n';
  exception when check_violation then res := res || 'S20 stock can never go negative: PASS' || E'\n';
  end;
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  res := res || 'S21 failed movement left the balance alone (' || q || '): ' || case when q=4 then 'PASS' else 'FAIL' end || E'\n';
  begin
    update public.items set unit = 'MTR' where id = pc;
    res := res || 'S22 unit change with history: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S22 unit cannot change once stock exists: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',shp,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.stock_balances;
  select count(*) into cnt from public.stock_balances where location_id = wh;
  res := res || 'S23 shop user sees only shop balances (' || n || ' rows, ' || cnt || ' from the warehouse): ' || case when n=1 and cnt=0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.stock_movements;
  res := res || 'S24 shop user sees movements that touch the shop (' || n || ', want 1): ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.apply_stock_count(sh, jsonb_build_array(jsonb_build_object('item_id',pc,'counted',9)), 'view only', 'ADJUSTMENT');
    res := res || 'S25 view-only user counts: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S25 user without stock.adjust refused: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  select count(*) into n from public.stock_balances;
  res := res || 'S26 admin sees all balances (' || n || ', want 3): ' || case when n=3 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from public.stock_balances;
  res := res || 'S27 anonymous sees no stock (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  select count(*) into n from public.audit_log where action = 'STOCK_COUNT';
  res := res || 'S28 audit rows for counts (' || n || ', want 4): ' || case when n=4 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
