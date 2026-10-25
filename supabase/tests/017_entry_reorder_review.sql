-- Tests for 20261025000026 (review fixes of quick stock entry and reorder). Ends with a deliberate exception (rollback).
-- Run 016_stock_entries_and_reorder.sql as well: it is the regression for the unchanged behaviour.
do $$
declare
  adm uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  sh uuid; wh uuid; ia uuid; ib uuid; x jsonb; r record; t1 uuid;
  res text := ''; txt text; cnt int;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(e,'e@t.l');
  update public.profiles set is_active = true where id in (adm,e);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (e,'stock.entry'),(e,'stock.view'),(e,'items.view');
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.user_locations values (e, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, lead_time_days) values ('IA','a','A','LOCAL','PCS',10) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, lead_time_days) values ('IB','b','B','LOCAL','PCS',10) returning id into ib;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values
    (ia, sh, 1000, 'OPENING'), (ib, wh, 1000, 'OPENING');

  perform set_config('request.jwt.claims', json_build_object('sub',e,'role','authenticated')::text, true);
  set local role authenticated;
  -- 1. a 450-character remark no longer fails the whole entry
  x := public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','DAMAGED','remarks',repeat('x',450)),
         jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',10)));
  res := res || 'T1 a 450-character remark is accepted: ' || case when (x->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  select char_length(reason) into cnt from public.stock_movements where reference = x->>'entry_no';
  res := res || 'T1b the movement reason was cut to ' || cnt || ' characters (max 300): ' || case when cnt = 300 then 'PASS' else 'FAIL' end || E'\n';

  -- 2. only sold stock outs count as demand: 20 sold + 50 damaged + 5 sample + 7 own use -> consumed = 20
  perform set_config('request.jwt.claims', json_build_object('sub',e,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SOLD_OUTSIDE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',20)));
  perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','DAMAGED'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',50)));
  perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SAMPLE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',5)));
  perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','OWN_USE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',7)));
  select * into r from public.reorder_suggestions(sh, 30) s where s.internal_item_code = 'IA';
  res := res || 'T2 demand counts only the sold stock out: consumed ' || coalesce(r.consumed::text,'?') || ' (want 20, not 82): ' || case when r.consumed = 20 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- 3. a recalled transfer is not demand at the sending warehouse: send 100, recall it, send 30 that is received
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',ib,'quantity',100)));
  t1 := (x->>'id')::uuid; perform public.send_stock_transfer(t1); perform public.recall_stock_transfer(t1);
  select * into r from public.reorder_suggestions(wh, 30) s where s.internal_item_code = 'IB';
  res := res || 'T3a send 100 and recall: the warehouse consumed ' || coalesce(r.consumed::text,'0') || ' (want 0): ' || case when coalesce(r.consumed,0) = 0 then 'PASS' else 'FAIL' end || E'\n';
  x := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',ib,'quantity',30)));
  t1 := (x->>'id')::uuid; perform public.send_stock_transfer(t1);
  select * into r from public.reorder_suggestions(wh, 30) s where s.internal_item_code = 'IB';
  res := res || 'T3b a real transfer of 30 counts: consumed ' || coalesce(r.consumed::text,'?') || ' (want 30): ' || case when r.consumed = 30 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
