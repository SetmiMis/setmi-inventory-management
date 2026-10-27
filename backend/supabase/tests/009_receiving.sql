-- Tests for 20261025000010_receiving.sql. Ends with a deliberate exception (rollback).
-- Every line should say PASS (R1 ... R25). The GRN number shown is not reused after the rollback,
-- so numbers can have gaps (sequences never roll back).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); v uuid := gen_random_uuid(); s uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  wh uuid; sh uuid; pc uuid; mt uuid; sup uuid; sup2 uuid;
  res text := ''; r jsonb; rid uuid; rid2 uuid; rno text; n int; q numeric; c numeric; st text; cnt int;
begin
  insert into auth.users (id, email) values (a,'a@t.l'),(b,'b@t.l'),(v,'v@t.l'),(s,'s@t.l'),(m,'m@t.l');
  update public.profiles set is_active = true where id in (a,b,v,s,m);
  insert into public.user_permissions (user_id, permission_key) values
    (a,'receipts.create'),(a,'receipts.post'),(a,'receipts.cost'),(a,'receipts.view'),(a,'stock.view'),
    (b,'receipts.create'),(b,'receipts.view'),
    (v,'receipts.view'),
    (s,'stock.view'),(s,'receipts.view'),
    (m,'suppliers.manage'),(m,'suppliers.view');
  insert into public.locations (code, name, type) values ('WH','W','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('SH','S','SHOP') returning id into sh;
  insert into public.user_locations values (a, wh), (b, wh), (v, wh), (s, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('PC','pc','pc','LOCAL','PCS') returning id into pc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('MT','mt','mt','LOCAL','MTR') returning id into mt;
  insert into public.suppliers (name, supplier_type) values ('Sup One','LOCAL') returning id into sup;
  insert into public.suppliers (name, supplier_type, is_active) values ('Old Sup','LOCAL', false) returning id into sup2;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;

  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',wh,'supplier_invoice_no','INV-1'),
        jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',10,'unit_cost',12.5), jsonb_build_object('item_id',mt,'quantity',2.5,'unit_cost',40)));
  rid := (r->>'id')::uuid; rno := r->>'receipt_no';
  res := res || 'R1 draft saved, number ' || rno || ': ' || case when (r->>'ok')::boolean and rno ~ '^GRN-[0-9]{6}$' then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.stock_movements where reference = rno;
  res := res || 'R2 a draft does not touch stock (' || cnt || ' movements): ' || case when cnt=0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  select count(*) into cnt from public.goods_receipt_costs;
  res := res || 'R3a user without receipts.cost sees no prices (' || cnt || '): ' || case when cnt=0 then 'PASS' else 'FAIL' end || E'\n';
  r := public.save_goods_receipt(rid, jsonb_build_object('supplier_id',sup,'location_id',wh,'supplier_invoice_no','INV-1'),
        jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',12), jsonb_build_object('item_id',mt,'quantity',2.5,'unit_cost',999)));
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select c1.unit_cost into c from public.goods_receipt_costs c1 join public.goods_receipt_lines l on l.id = c1.line_id where l.receipt_id = rid and l.item_id = pc;
  select c1.unit_cost into q from public.goods_receipt_costs c1 join public.goods_receipt_lines l on l.id = c1.line_id where l.receipt_id = rid and l.item_id = mt;
  res := res || 'R3b editor without cost right keeps old prices and cannot set new ones (pc ' || c || ', mt ' || q || '): ' || case when c = 12.5 and q = 40 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  begin
    perform public.post_goods_receipt(rid);
    res := res || 'R4 post without receipts.post: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'R4 post needs receipts.post: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  r := public.post_goods_receipt(rid);
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  select count(*) into cnt from public.stock_movements where reference = rno and movement_type = 'RECEIPT' and from_location_id is null and to_location_id = wh;
  res := res || 'R5 posting adds stock (pc=' || q || ' want 12) and 2 RECEIPT movements (' || cnt || '): ' || case when q=12 and cnt=2 then 'PASS' else 'FAIL' end || E'\n';

  begin
    perform public.post_goods_receipt(rid);
    res := res || 'R6 post twice: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'R6 posting twice refused: PASS' || E'\n';
  end;
  select quantity into q from public.stock_balances where item_id = pc and location_id = wh;
  res := res || 'R6b stock unchanged after second attempt (' || q || '): ' || case when q=12 then 'PASS' else 'FAIL' end || E'\n';

  begin
    perform public.save_goods_receipt(rid, jsonb_build_object('supplier_id',sup,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'R7a edit posted receipt: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'R7a posted receipt cannot be edited: PASS' || E'\n';
  end;
  begin
    perform public.cancel_goods_receipt(rid);
    res := res || 'R7b cancel posted: FAIL' || E'\n';
  exception when others then res := res || 'R7b posted receipt cannot be cancelled: PASS' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    update public.goods_receipt_lines set quantity = 1000 where receipt_id = rid;
    res := res || 'R8a line of posted receipt changed: FAIL' || E'\n';
  exception when others then res := res || 'R8a lines of a posted receipt are locked, even for the owner: PASS' || E'\n';
  end;
  begin
    update public.goods_receipt_costs set unit_cost = 1;
    res := res || 'R8b price of posted receipt changed: FAIL' || E'\n';
  exception when others then res := res || 'R8b prices of a posted receipt are locked: PASS' || E'\n';
  end;
  begin
    delete from public.goods_receipts where id = rid;
    res := res || 'R8c delete receipt: FAIL' || E'\n';
  exception when others then res := res || 'R8c receipts cannot be deleted: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',2.5)));
  res := res || 'R9 pieces cannot be fractions: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1), jsonb_build_object('item_id',pc,'quantity',2)));
  res := res || 'R10 same item twice refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',sh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'R11 receipt into a place you do not work in: FAIL' || E'\n';
  exception when others then res := res || 'R11 cannot receive into another place: PASS' || E'\n';
  end;
  begin
    perform public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup2,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'R12 archived supplier: FAIL' || E'\n';
  exception when others then res := res || 'R12 archived supplier refused: PASS' || E'\n';
  end;
  begin
    perform public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',wh,'supplier_invoice_no','  inv-1 '), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'R13 same supplier invoice twice: FAIL (allowed)' || E'\n';
  exception when unique_violation then res := res || 'R13 same supplier invoice cannot be received twice: PASS' || E'\n';
  end;

  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',wh,'supplier_invoice_no','INV-2'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',3)));
  rid2 := (r->>'id')::uuid;
  perform public.cancel_goods_receipt(rid2);
  select status::text into st from public.goods_receipts where id = rid2;
  res := res || 'R14a cancel draft -> ' || st || ': ' || case when st='CANCELLED' then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.post_goods_receipt(rid2);
    res := res || 'R14b post cancelled: FAIL' || E'\n';
  exception when others then res := res || 'R14b cancelled receipt cannot be posted: PASS' || E'\n';
  end;
  r := public.save_goods_receipt(null, jsonb_build_object('supplier_id',sup,'location_id',wh,'supplier_invoice_no','INV-2'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',3)));
  res := res || 'R14c invoice number reusable after cancel: ' || case when (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  rid2 := (r->>'id')::uuid;

  begin
    insert into public.goods_receipts (supplier_id, location_id) values (sup, wh);
    res := res || 'R15 direct insert into receipts: FAIL' || E'\n';
  exception when others then res := res || 'R15 no direct insert into receipts: PASS' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  update public.items set is_active = false where id = pc;
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.post_goods_receipt(rid2);
    res := res || 'R16 post with an archived item: FAIL' || E'\n';
  exception when others then res := res || 'R16 archived item blocks posting: PASS' || E'\n';
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  update public.items set is_active = true where id = pc;

  perform set_config('request.jwt.claims', json_build_object('sub',v,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.goods_receipts;
  select count(*) into cnt from public.goods_receipt_lines;
  res := res || 'R17 viewer sees receipts and lines of their place (' || n || ' receipts, ' || cnt || ' lines): ' || case when n >= 2 and cnt >= 2 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.goods_receipt_costs;
  res := res || 'R17b viewer cannot see prices (' || cnt || '): ' || case when cnt=0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  select count(*) into n from public.goods_receipts;
  res := res || 'R18 shop user sees no warehouse receipts (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select count(*) into cnt from public.goods_receipt_costs;
  res := res || 'R19 user with receipts.cost sees prices (' || cnt || ' > 0): ' || case when cnt>0 then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.suppliers (name) values ('Hack Sup');
    res := res || 'R20 supplier insert without suppliers.manage: FAIL' || E'\n';
  exception when others then res := res || 'R20 suppliers need suppliers.manage: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  insert into public.suppliers (name, gstin) values ('Good Sup','22AAAAA0000A1Z5');
  res := res || 'R21 manager creates a supplier with a valid GSTIN: PASS' || E'\n';
  begin
    insert into public.suppliers (name, gstin) values ('Bad Sup','22aaaaa0000a1z5');
    res := res || 'R22 lower-case GSTIN: FAIL' || E'\n';
  exception when check_violation then res := res || 'R22 invalid GSTIN refused: PASS' || E'\n';
  end;
  begin
    insert into public.suppliers (name) values (' sup one ');
    res := res || 'R23 duplicate supplier name: FAIL' || E'\n';
  exception when unique_violation then res := res || 'R23 duplicate supplier name refused: PASS' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from public.goods_receipts;
  res := res || 'R24 anonymous sees no receipts (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  select count(*) into n from public.audit_log where action = 'POST_RECEIPT';
  res := res || 'R25 post is in the audit log (' || n || '): ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
