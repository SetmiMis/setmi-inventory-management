-- Tests for 20261025000017 (purchase orders and receipts against them). Ends with a deliberate exception (rollback).
-- Every line should say PASS.
do $$
declare
  adm uuid := gen_random_uuid(); b uuid := gen_random_uuid(); bn uuid := gen_random_uuid(); rcv uuid := gen_random_uuid();
  vw uuid := gen_random_uuid(); o uuid := gen_random_uuid(); nn uuid := gen_random_uuid();
  wh uuid; oth uuid; s1 uuid; s2 uuid; ia uuid; ib uuid; ic uuid;
  v_po uuid; v_po2 uuid; v_po3 uuid; v_po4 uuid; v_r1 uuid; v_r2 uuid; v_r3 uuid; v_r4 uuid; v_r5 uuid; x jsonb;
  res text := ''; cnt int; q numeric; st text; txt text; ts timestamptz;
  hdr jsonb;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(b,'b@t.l'),(bn,'bn@t.l'),(rcv,'r@t.l'),(vw,'v@t.l'),(o,'o@t.l'),(nn,'n@t.l');
  update public.profiles set is_active = true where id in (adm,b,bn,rcv,vw,o,nn);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (b,'purchase.create'),(b,'purchase.approve'),(b,'purchase.view'),(b,'receipts.cost'),(b,'items.view'),
    (bn,'purchase.create'),(bn,'purchase.view'),
    (rcv,'receipts.create'),(rcv,'receipts.post'),(rcv,'receipts.view'),(rcv,'stock.view'),
    (vw,'purchase.view'),
    (o,'purchase.create'),(o,'purchase.approve'),(o,'purchase.view');
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('OTH','Other','WAREHOUSE') returning id into oth;
  insert into public.user_locations values (b, wh), (bn, wh), (rcv, wh), (vw, wh), (o, oth);
  insert into public.suppliers (name, supplier_type) values ('Supplier One','LOCAL') returning id into s1;
  insert into public.suppliers (name, supplier_type) values ('Supplier Two','LOCAL') returning id into s2;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('IA','a','A','LOCAL','PCS') returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('IB','b','B','LOCAL','MTR') returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('IC','c','C','LOCAL','PCS') returning id into ic;

  -- P1: a buyer saves a draft
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh,'order_date','2026-10-25','notes','first'),
        jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',10,'unit_cost',5), jsonb_build_object('item_id',ib,'quantity',5.5,'unit_cost',20)));
  v_po := (x->>'id')::uuid; txt := x->>'po_no';
  select status::text into st from public.purchase_orders where id = v_po;
  res := res || 'P1 draft saved as ' || coalesce(txt,'?') || ' (' || coalesce(st,'?') || '): ' || case when (x->>'ok')::boolean and txt ~ '^PO-[0-9]{6}$' and st = 'DRAFT' then 'PASS' else 'FAIL' end || E'\n';

  -- P4: prices are visible only with receipts.cost
  select count(*) into cnt from public.purchase_order_costs;
  res := res || 'P4a buyer with receipts.cost sees ' || cnt || ' price rows (want 2): ' || case when cnt = 2 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',vw,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.purchase_orders;
  res := res || 'P4b viewer sees the order (' || cnt || ' = 1): ' || case when cnt = 1 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.purchase_order_costs;
  res := res || 'P4c viewer without receipts.cost sees ' || cnt || ' price rows (want 0): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P2 viewer saves an order: FAIL' || E'\n';
  exception when others then res := res || 'P2 without purchase.create the save is refused (' || sqlerrm || '): ' || case when sqlerrm like 'missing permission%' then 'PASS' else 'FAIL' end || E'\n'; end;
  reset role;

  -- P3: another place cannot see or edit it
  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.purchase_orders;
  res := res || 'P3a user of another place sees ' || cnt || ' orders (want 0): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_purchase_order(v_po, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P3b other place edits: FAIL' || E'\n';
  exception when others then res := res || 'P3b other place cannot edit (' || sqlerrm || '): PASS' || E'\n'; end;
  begin perform public.send_purchase_order(v_po);
    res := res || 'P3c other place sends: FAIL' || E'\n';
  exception when others then res := res || 'P3c other place cannot send: PASS' || E'\n'; end;
  reset role;

  -- P5: bad lines
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1.5)));
  res := res || 'P5a decimal quantity for a PCS item refused: ' || case when not (x->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1), jsonb_build_object('item_id',ia,'quantity',2)));
  res := res || 'P5b same item twice refused: ' || case when not (x->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh,'order_date','2026-10-25','expected_date','2026-10-01'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P5c expected date before order date: FAIL' || E'\n';
  exception when others then res := res || 'P5c expected date before the order date refused: PASS' || E'\n'; end;
  reset role;

  -- P6: a person without receipts.cost edits the draft: prices are kept
  perform set_config('request.jwt.claims', json_build_object('sub',bn,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_purchase_order(v_po, jsonb_build_object('supplier_id',s1,'location_id',wh,'order_date','2026-10-25','notes','edited'),
        jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',10), jsonb_build_object('item_id',ib,'quantity',5.5)));
  reset role;
  select count(*) into cnt from public.purchase_order_costs c join public.purchase_order_lines l on l.id = c.line_id where l.po_id = v_po;
  res := res || 'P6 editing without receipts.cost kept the prices (' || cnt || ' = 2): ' || case when (x->>'ok')::boolean and cnt = 2 then 'PASS' else 'FAIL' end || E'\n';

  -- P7: send needs purchase.approve
  perform set_config('request.jwt.claims', json_build_object('sub',bn,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.send_purchase_order(v_po); res := res || 'P7a send without approve: FAIL' || E'\n';
  exception when others then res := res || 'P7a without purchase.approve the send is refused: ' || case when sqlerrm like 'missing permission%' then 'PASS' else 'FAIL' end || E'\n'; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.send_purchase_order(v_po);
  select status::text, sent_at into st, ts from public.purchase_orders where id = v_po;
  res := res || 'P7b sent: status ' || st || ': ' || case when st = 'SENT' and ts is not null then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.send_purchase_order(v_po); res := res || 'P7c send twice: FAIL' || E'\n';
  exception when others then res := res || 'P7c sending twice is refused: PASS' || E'\n'; end;
  -- P8: a sent order is frozen
  begin perform public.save_purchase_order(v_po, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P8a edit sent order: FAIL' || E'\n';
  exception when others then res := res || 'P8a a sent order cannot be edited: PASS' || E'\n'; end;
  reset role;
  begin update public.purchase_order_lines set quantity = 1 where po_id = v_po; res := res || 'P8b direct line update: FAIL' || E'\n';
  exception when others then res := res || 'P8b a line of a sent order cannot be changed even directly: PASS' || E'\n'; end;
  begin delete from public.purchase_orders where id = v_po; res := res || 'P8c delete: FAIL' || E'\n';
  exception when others then res := res || 'P8c purchase orders cannot be deleted: PASS' || E'\n'; end;
  begin update public.purchase_orders set status = 'DRAFT' where id = v_po; res := res || 'P8d status back to draft: FAIL' || E'\n';
  exception when others then res := res || 'P8d status cannot go back to draft: PASS' || E'\n'; end;

  -- P9: receipts against the order
  hdr := jsonb_build_object('supplier_id',s1,'location_id',wh,'receipt_date','2026-10-26','purchase_order_id',v_po);
  perform set_config('request.jwt.claims', json_build_object('sub',rcv,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',11)));
  res := res || 'P9a more than ordered refused: ' || case when not (x->>'ok')::boolean and x->'errors'->0->>'message' like 'More than still open%' then 'PASS' else 'FAIL' end || E'\n';
  x := public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ic,'quantity',1)));
  res := res || 'P9b an item that is not on the order refused: ' || case when not (x->>'ok')::boolean and x->'errors'->0->>'message' like 'This item is not on%' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_goods_receipt(null, jsonb_build_object('supplier_id',s2,'location_id',wh,'purchase_order_id',v_po), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P9c other supplier: FAIL' || E'\n';
  exception when others then res := res || 'P9c a different supplier is refused: PASS' || E'\n'; end;
  x := public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',4)));
  v_r1 := (x->>'id')::uuid;
  res := res || 'P9d receipt of 4 saved: ' || case when (x->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  x := public.post_goods_receipt(v_r1);
  reset role;
  select status::text into st from public.purchase_orders where id = v_po;
  select received_qty into q from public.purchase_order_lines where po_id = v_po and item_id = ia;
  select quantity into cnt from public.stock_balances where item_id = ia and location_id = wh;
  res := res || 'P10 after posting: order ' || st || ' (want PARTIAL), received ' || q || ' (want 4), stock ' || coalesce(cnt::text,'?') || ' (want 4): ' || case when st = 'PARTIAL' and q = 4 and cnt = 4 then 'PASS' else 'FAIL' end || E'\n';

  -- P11: the rest completes the order
  perform set_config('request.jwt.claims', json_build_object('sub',rcv,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',6), jsonb_build_object('item_id',ib,'quantity',5.5)));
  v_r2 := (x->>'id')::uuid;
  perform public.post_goods_receipt(v_r2);
  reset role;
  select status::text, closed_at into st, ts from public.purchase_orders where id = v_po;
  res := res || 'P11 everything received: order ' || st || ' (want COMPLETED): ' || case when st = 'COMPLETED' and ts is not null then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',rcv,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P12 receipt against a completed order: FAIL' || E'\n';
  exception when others then res := res || 'P12 a completed order takes no more receipts: PASS' || E'\n'; end;
  reset role;

  -- P13: two drafts together would receive too much: the second post is refused
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',5)));
  v_po2 := (x->>'id')::uuid; perform public.send_purchase_order(v_po2);
  reset role;
  hdr := jsonb_build_object('supplier_id',s1,'location_id',wh,'purchase_order_id',v_po2);
  perform set_config('request.jwt.claims', json_build_object('sub',rcv,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',3))); v_r3 := (x->>'id')::uuid;
  x := public.save_goods_receipt(null, hdr, jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',3))); v_r4 := (x->>'id')::uuid;
  perform public.post_goods_receipt(v_r3);
  begin perform public.post_goods_receipt(v_r4); res := res || 'P13a second draft over-receives: FAIL' || E'\n';
  exception when others then res := res || 'P13a the second draft is refused at posting (' || left(sqlerrm, 60) || '): ' || case when sqlerrm like 'More than still open%' then 'PASS' else 'FAIL' end || E'\n'; end;
  reset role;
  select quantity into q from public.purchase_order_lines where po_id = v_po2 and item_id = ia;
  select received_qty into cnt from public.purchase_order_lines where po_id = v_po2 and item_id = ia;
  select status::text into st from public.goods_receipts where id = v_r4;
  res := res || 'P13b order received ' || cnt || ' of ' || q || ', the refused receipt is still ' || st || ': ' || case when cnt = 3 and st = 'DRAFT' then 'PASS' else 'FAIL' end || E'\n';

  -- P14: cancel rules
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.cancel_purchase_order(v_po2); res := res || 'P14a cancel a partly received order: FAIL' || E'\n';
  exception when others then res := res || 'P14a a partly received order cannot be cancelled: PASS' || E'\n'; end;
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',2)));
  v_po3 := (x->>'id')::uuid;
  perform public.cancel_purchase_order(v_po3);
  select status::text into st from public.purchase_orders where id = v_po3;
  res := res || 'P14b a draft order can be cancelled (' || st || '): ' || case when st = 'CANCELLED' then 'PASS' else 'FAIL' end || E'\n';
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',2)));
  v_po4 := (x->>'id')::uuid; perform public.send_purchase_order(v_po4);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',rcv,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_goods_receipt(null, jsonb_build_object('supplier_id',s1,'location_id',wh,'purchase_order_id',v_po4), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1))); v_r5 := (x->>'id')::uuid;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.cancel_purchase_order(v_po4); res := res || 'P14c cancel with a draft receipt: FAIL' || E'\n';
  exception when others then res := res || 'P14c cannot cancel while a receipt exists against it: PASS' || E'\n'; end;

  -- P15: close short
  begin perform public.close_purchase_order(v_po2, '  '); res := res || 'P15a close without a reason: FAIL' || E'\n';
  exception when others then res := res || 'P15a closing needs a reason: PASS' || E'\n'; end;
  begin perform public.close_purchase_order(v_po4, 'x'); res := res || 'P15b close a sent order: FAIL' || E'\n';
  exception when others then res := res || 'P15b only a partly received order can be closed: PASS' || E'\n'; end;
  perform public.close_purchase_order(v_po2, 'Supplier will not send the rest');
  reset role;
  select status::text, close_note into st, txt from public.purchase_orders where id = v_po2;
  res := res || 'P15c closed with the reason kept (' || st || '): ' || case when st = 'COMPLETED' and txt like 'Supplier%' then 'PASS' else 'FAIL' end || E'\n';

  -- P17: a receipt without an order still works
  perform set_config('request.jwt.claims', json_build_object('sub',rcv,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_goods_receipt(null, jsonb_build_object('supplier_id',s2,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ic,'quantity',7)));
  perform public.post_goods_receipt((x->>'id')::uuid);
  reset role;
  select quantity into q from public.stock_balances where item_id = ic and location_id = wh;
  res := res || 'P17 a receipt without a purchase order still adds stock (' || coalesce(q::text,'?') || ' = 7): ' || case when q = 7 then 'PASS' else 'FAIL' end || E'\n';

  -- P18: audit and anonymous
  select count(*) into cnt from public.audit_log where entity = 'purchase_orders' and action in ('SEND_PO','CANCEL_PO','CLOSE_PO');
  res := res || 'P18 audit rows for send/cancel/close (' || cnt || ' >= 3): ' || case when cnt >= 3 then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin perform public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'P19 anonymous: FAIL' || E'\n';
  exception when others then res := res || 'P19 anonymous cannot save an order: PASS' || E'\n'; end;
  reset role;

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
