-- Tests for 20261025000011/12 (transfers). Ends with a deliberate exception (rollback); every line should say PASS.
-- NOTE: the in-transit system place is only readable by admins, so those balances are read with the admin identity.
-- Tests 006-009 count rows; run them on a database WITHOUT demo data (or expect different counts).
do $$
declare
  adm uuid := gen_random_uuid(); w uuid := gen_random_uuid(); s uuid := gen_random_uuid(); o uuid := gen_random_uuid(); v uuid := gen_random_uuid();
  wh uuid; sh uuid; oth uuid; tr uuid; pc uuid; mt uuid; t1 uuid; t2 uuid; t3 uuid; t4 uuid;
  res text := ''; r jsonb; n int; q numeric; qt numeric; st text; cnt int; txt text; flag boolean;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(w,'w@t.l'),(s,'s@t.l'),(o,'o@t.l'),(v,'v@t.l');
  update public.profiles set is_active = true where id in (adm,w,s,o,v);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (w,'transfers.view'),(w,'transfers.create'),(w,'transfers.send'),(w,'stock.view'),
    (s,'transfers.view'),(s,'transfers.receive'),(s,'stock.view'),
    (o,'transfers.view'),(o,'transfers.create'),(o,'transfers.send'),(o,'transfers.receive'),
    (v,'transfers.view');
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.locations (code, name, type) values ('OTH','Other shop','SHOP') returning id into oth;
  select id into tr from public.locations where type = 'TRANSIT';
  insert into public.user_locations values (w, wh), (s, sh), (o, oth), (v, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('PC','pc','pc','LOCAL','PCS') returning id into pc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('MT','mt','mt','LOCAL','MTR') returning id into mt;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values (pc, wh, 20, 'OPENING'), (mt, wh, 10, 'OPENING');

  perform set_config('request.jwt.claims', json_build_object('sub',w,'role','authenticated')::text, true);
  set local role authenticated;

  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh,'notes','refill'),
        jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',12), jsonb_build_object('item_id',mt,'quantity',2.5)));
  t1 := (r->>'id')::uuid;
  select to_name, transfer_no into txt, st from public.stock_transfers where id = t1;
  res := res || 'T1 draft saved (' || st || ', destination name copied: ' || txt || '): ' || case when (r->>'ok')::boolean and st ~ '^TRF-[0-9]{6}$' and txt = 'Shop' then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.transfer_destinations();
  select count(*) into n from public.transfer_destinations() where type = 'TRANSIT';
  res := res || 'T2 sender sees all real destinations (' || cnt || ' >= 3) and never the system place: ' || case when cnt >= 3 and n = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.stock_movements where reference = st;
  res := res || 'T3 a draft does not touch stock (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',wh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'T3b from = to: FAIL' || E'\n';
  exception when others then res := res || 'T3b sending place and receiving place must differ: PASS' || E'\n';
  end;
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',2.5)));
  res := res || 'T3c pieces cannot be fractions: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.save_stock_transfer(null, jsonb_build_object('from_location_id',sh,'to_location_id',wh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'T3d sending from a place you do not work in: FAIL' || E'\n';
  exception when others then res := res || 'T3d cannot prepare a transfer from another place: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  begin
    perform public.send_stock_transfer(t1);
    res := res || 'T4 send without transfers.send: FAIL' || E'\n';
  exception when others then res := res || 'T4 sending needs transfers.send: PASS' || E'\n';
  end;
  select count(*) into cnt from public.stock_transfers;
  res := res || 'T4b receiving place can already see the draft sent to it (' || cnt || '): ' || case when cnt = 1 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',w,'role','authenticated')::text, true);
  r := public.send_stock_transfer(t1);
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  select status::text into st from public.stock_transfers where id = t1;
  res := res || 'T5 send: warehouse pc ' || q || ' (want 8), status ' || st || ': ' || case when q = 8 and st = 'SENT' then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.send_stock_transfer(t1);
    res := res || 'T6 send twice: FAIL' || E'\n';
  exception when others then res := res || 'T6 sending twice refused: PASS' || E'\n';
  end;
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  res := res || 'T6b stock unchanged after the second attempt (' || q || '): ' || case when q = 8 then 'PASS' else 'FAIL' end || E'\n';

  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',50)));
  t2 := (r->>'id')::uuid;
  begin
    perform public.send_stock_transfer(t2);
    res := res || 'T7 send more than the place has: FAIL' || E'\n';
  exception when others then res := res || 'T7 not enough stock blocks sending (' || left(sqlerrm, 60) || '): ' || case when sqlerrm like 'Not enough stock to send%' then 'PASS' else 'FAIL' end || E'\n';
  end;
  perform public.cancel_stock_transfer(t2);

  begin
    perform public.save_stock_transfer(t1, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'T8 edit a sent transfer: FAIL' || E'\n';
  exception when others then res := res || 'T8 a sent transfer cannot be edited: PASS' || E'\n';
  end;
  begin
    perform public.receive_stock_transfer(t1, '[]'::jsonb, null);
    res := res || 'T9 receive without transfers.receive: FAIL' || E'\n';
  exception when others then res := res || 'T9 receiving needs transfers.receive: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  begin
    perform public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id',pc,'received',12), jsonb_build_object('item_id',mt,'received',2.5)), null);
    res := res || 'T10 receive at a place you do not work in: FAIL' || E'\n';
  exception when others then res := res || 'T10 only the receiving place can receive: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  r := public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id',pc,'received',13), jsonb_build_object('item_id',mt,'received',2.5)), null);
  res := res || 'T11 receiving more than was sent refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id',pc,'received',10), jsonb_build_object('item_id',mt,'received',2.5)), '  ');
  res := res || 'T12 shortage without a note refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id',pc,'received',10)), 'x');
  res := res || 'T12b missing line in the list refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id',pc,'received',10), jsonb_build_object('item_id',mt,'received',2.5)), '2 pieces damaged in the van');
  select quantity into q from public.stock_balances where item_id = pc and location_id = sh;
  select has_shortage, status::text into flag, st from public.stock_transfers where id = t1;
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  select coalesce(quantity, -1) into qt from public.stock_balances where item_id = pc and location_id = tr;
  select count(*) into cnt from public.stock_movements where movement_type = 'TRANSFER_SHORTAGE' and quantity = 2 and from_location_id = tr and to_location_id is null;
  res := res || 'T13 receive with shortage: shop pc ' || q || ' (want 10), still in transit ' || coalesce(qt::text,'none') || ' (want 0), shortage movement ' || cnt || ', flag ' || flag || ', ' || st || ': ' ||
    case when (r->>'ok')::boolean and q = 10 and qt = 0 and cnt = 1 and flag and st = 'RECEIVED' then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  begin
    perform public.receive_stock_transfer(t1, jsonb_build_array(jsonb_build_object('item_id',pc,'received',10), jsonb_build_object('item_id',mt,'received',2.5)), 'again');
    res := res || 'T14 receive twice: FAIL' || E'\n';
  exception when others then res := res || 'T14 receiving twice refused: PASS' || E'\n';
  end;
  select quantity into q from public.stock_balances where item_id = pc and location_id = sh;
  res := res || 'T14b shop stock unchanged after second attempt (' || q || '): ' || case when q = 10 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',w,'role','authenticated')::text, true);
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',3)));
  t3 := (r->>'id')::uuid;
  perform public.send_stock_transfer(t3);
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  perform public.recall_stock_transfer(t3);
  select quantity into qt from public.stock_balances where item_id = pc and location_id = wh;
  select status::text into st from public.stock_transfers where id = t3;
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  select coalesce(quantity, -1) into n from public.stock_balances where item_id = pc and location_id = tr;
  res := res || 'T15 recall: warehouse ' || q || ' -> ' || qt || ' (want 5 -> 8), in transit ' || n || ' (want 0), ' || st || ': ' || case when q = 5 and qt = 8 and n = 0 and st = 'CANCELLED' then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',w,'role','authenticated')::text, true);
  begin
    perform public.recall_stock_transfer(t1);
    res := res || 'T15b recall a received transfer: FAIL' || E'\n';
  exception when others then res := res || 'T15b a received transfer cannot be recalled: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  r := public.save_stock_transfer(null, jsonb_build_object('from_location_id',oth,'to_location_id',wh), jsonb_build_array(jsonb_build_object('item_id',mt,'quantity',1)));
  t4 := (r->>'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  select count(*) into cnt from public.stock_transfers where id = t4;
  res := res || 'T16 shop user cannot see a transfer between two other places (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',v,'role','authenticated')::text, true);
  select count(*) into cnt from public.stock_transfers;
  select count(*) into n from public.stock_transfer_lines;
  res := res || 'T17 viewer at the shop sees transfers touching the shop, with lines (' || cnt || ' transfers, ' || n || ' lines): ' || case when cnt >= 1 and n >= 2 then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.stock_transfers (from_location_id, to_location_id, from_code, from_name, to_code, to_name) values (wh, sh, 'a','a','b','b');
    res := res || 'T18 direct insert into transfers: FAIL' || E'\n';
  exception when others then res := res || 'T18 no direct insert into transfers: PASS' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (mt, sh, 5, 8);
  perform set_config('request.jwt.claims', json_build_object('sub',w,'role','authenticated')::text, true);
  set local role authenticated;
  select suggested into q from public.suggest_transfer_lines(wh, sh) where item_id = mt;
  res := res || 'T19 suggestion fills up to the maximum (8 - 2.5 at the shop = 5.5), capped by what the source has (7.5): got ' || coalesce(q::text,'none') || ': ' || case when q = 5.5 then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  select count(*) into cnt from public.suggest_transfer_lines(wh, sh);
  res := res || 'T19b user who may not prepare transfers gets no suggestions (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  begin
    update public.locations set name = 'hacked' where id = tr;
    res := res || 'T20 edit the system place: FAIL' || E'\n';
  exception when others then res := res || 'T20 the in-transit place cannot be edited: PASS' || E'\n';
  end;
  begin
    insert into public.locations (code, name, type) values ('T2','second transit','TRANSIT');
    res := res || 'T20b second system place: FAIL' || E'\n';
  exception when others then res := res || 'T20b a second in-transit place cannot be created: PASS' || E'\n';
  end;
  begin
    perform public.admin_set_user_locations(w, array[wh, tr]);
    res := res || 'T20c assign the system place to a user: FAIL' || E'\n';
  exception when others then res := res || 'T20c the in-transit place cannot be given to a user: PASS' || E'\n';
  end;
  select count(*) into cnt from public.stock_overview where location_id = tr;
  res := res || 'T20d stock list never shows the system place (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values (pc, tr, 5, 'ADJUSTMENT');
    res := res || 'T21 non-transfer movement into transit: FAIL' || E'\n';
  exception when others then res := res || 'T21 only transfers may use the in-transit place: PASS' || E'\n';
  end;
  begin
    insert into public.stock_movements (item_id, from_location_id, quantity, movement_type) values (pc, wh, 1, 'TRANSFER_SHORTAGE');
    res := res || 'T21b shortage that does not leave transit: FAIL' || E'\n';
  exception when others then res := res || 'T21b a shortage must leave the in-transit place: PASS' || E'\n';
  end;
  begin
    update public.stock_transfer_lines set quantity_sent = 999 where transfer_id = t1;
    res := res || 'T22 change the sent quantity of a finished transfer: FAIL' || E'\n';
  exception when others then res := res || 'T22 lines of a finished transfer are locked: PASS' || E'\n';
  end;
  begin
    delete from public.stock_transfers where id = t1;
    res := res || 'T22b delete transfer: FAIL' || E'\n';
  exception when others then res := res || 'T22b transfers cannot be deleted: PASS' || E'\n';
  end;
  select count(*) into n from public.audit_log where action in ('SEND_TRANSFER','RECEIVE_TRANSFER','RECALL_TRANSFER');
  res := res || 'T23 audit rows for send/receive/recall (' || n || ', want 4): ' || case when n = 4 then 'PASS' else 'FAIL' end || E'\n';

  set local role anon;
  select count(*) into n from public.stock_transfers;
  res := res || 'T24 anonymous sees no transfers (' || n || '): ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
