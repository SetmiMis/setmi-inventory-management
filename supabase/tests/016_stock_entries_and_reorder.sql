-- Tests for 20261025000023/24 (G1 quick Stock In/Out, G2 reorder suggestions). Ends with a deliberate exception (rollback).
-- Every line should say PASS.
do $$
declare
  adm uuid := gen_random_uuid(); e uuid := gen_random_uuid(); v uuid := gen_random_uuid(); o uuid := gen_random_uuid();
  sh uuid; wh uuid; oth uuid; s1 uuid; ia uuid; im uuid; ib uuid; ic uuid; id_ uuid; x jsonb; r record;
  res text := ''; q numeric; cnt int; txt text;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(e,'e@t.l'),(v,'v@t.l'),(o,'o@t.l');
  update public.profiles set is_active = true where id in (adm,e,v,o);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (e,'stock.entry'),(e,'stock.view'),(e,'items.view'),
    (v,'stock.view'),
    (o,'stock.entry'),(o,'stock.view'),(o,'items.view');
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('OTH','Other','SHOP') returning id into oth;
  insert into public.user_locations values (e, sh), (v, sh), (o, oth);
  insert into public.suppliers (name, supplier_type) values ('Sup','LOCAL') returning id into s1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('IA','a','A','LOCAL','PCS') returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('IM','m','M','LOCAL','MTR') returning id into im;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, lead_time_days, safety_factor, moq) values ('IB','b','B','LOCAL','PCS',10,1.5,20) returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, lead_time_days) values ('IC','c','C','LOCAL','PCS',10) returning id into ic;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('ID','d','D','LOCAL','PCS') returning id into id_;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values
    (ia, sh, 10, 'OPENING'), (im, sh, 5.5, 'OPENING'), (ib, sh, 100, 'OPENING'), (ic, sh, 100, 'OPENING'), (id_, sh, 2, 'OPENING');
  insert into public.reorder_levels (item_id, location_id, min_qty, max_qty) values (id_, sh, 0, 10);

  -- ---------- G1 ----------
  perform set_config('request.jwt.claims', json_build_object('sub',e,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SOLD_OUTSIDE','reference','ZOHO-123'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',3)));
  txt := x->>'entry_no';
  select quantity into q from public.stock_balances where item_id = ia and location_id = sh;
  select count(*) into cnt from public.stock_movements where reference = txt and movement_type = 'STOCK_OUT' and from_location_id = sh and to_location_id is null;
  res := res || 'S1 stock out (sold in Zoho) ' || coalesce(txt,'?') || ': stock ' || coalesce(q::text,'?') || ' (want 7), STOCK_OUT movements ' || cnt || ': ' ||
    case when (x->>'ok')::boolean and txt ~ '^SE-[0-9]{6}$' and q = 7 and cnt = 1 then 'PASS' else 'FAIL' end || E'\n';
  x := public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','DAMAGED'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',20)));
  res := res || 'S2 more than in stock is refused (' || coalesce(x->'errors'->0->>'message','?') || '): ' ||
    case when not (x->>'ok')::boolean and x->'errors'->0->>'message' like 'Only 7%' then 'PASS' else 'FAIL' end || E'\n';
  x := public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','IN','reason','CUSTOMER_RETURN'), jsonb_build_array(jsonb_build_object('item_id',im,'quantity',1.25)));
  select quantity into q from public.stock_balances where item_id = im and location_id = sh;
  res := res || 'S3 stock in (customer return) of 1.25 m: stock ' || coalesce(q::text,'?') || ' (want 6.75): ' || case when (x->>'ok')::boolean and q = 6.75 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','IN','reason','SAMPLE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'S4 IN with an OUT reason: FAIL' || E'\n';
  exception when others then res := res || 'S4 a reason that does not fit the direction is refused: PASS' || E'\n'; end;
  begin perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','OTHER_OUT'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'S5 other without remark: FAIL' || E'\n';
  exception when others then res := res || 'S5 "other" needs a remark: PASS' || E'\n'; end;
  x := public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SAMPLE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1.5)));
  res := res || 'S6 decimals for a PCS item refused: ' || case when not (x->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',v,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SAMPLE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'S7a without stock.entry: FAIL' || E'\n';
  exception when others then res := res || 'S7a without stock.entry the entry is refused: ' || case when sqlerrm like 'missing permission%' then 'PASS' else 'FAIL' end || E'\n'; end;
  select count(*) into cnt from public.stock_entries;
  res := res || 'S9a stock.view sees the entries of its place (' || cnt || ' = 2): ' || case when cnt = 2 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SAMPLE'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
    res := res || 'S7b other place: FAIL' || E'\n';
  exception when others then res := res || 'S7b a user of another place cannot make an entry here: PASS' || E'\n'; end;
  select count(*) into cnt from public.stock_entries where location_id = sh;
  res := res || 'S9b another place sees none of these entries (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into cnt from public.reorder_suggestions(null, 30) where location_code = 'SH';
  res := res || 'R7 reorder rows of a place the user is not in (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  begin update public.stock_entries set remarks = 'x'; res := res || 'S8a edit entry: FAIL' || E'\n';
  exception when others then res := res || 'S8a entries cannot be edited, even directly: PASS' || E'\n'; end;
  begin delete from public.stock_entry_lines; res := res || 'S8b delete lines: FAIL' || E'\n';
  exception when others then res := res || 'S8b entry lines cannot be deleted: PASS' || E'\n'; end;
  select count(*) into cnt from public.audit_log where action = 'STOCK_ENTRY';
  res := res || 'S11 audit rows for entries (' || cnt || ' >= 2): ' || case when cnt >= 2 then 'PASS' else 'FAIL' end || E'\n';

  -- ---------- G2 ----------
  -- consumption: 90 of IB and 90 of IC sold in Zoho in the last 30 days; one open purchase order of 4 x IC
  perform set_config('request.jwt.claims', json_build_object('sub',e,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.create_stock_entry(jsonb_build_object('location_id',sh,'direction','OUT','reason','SOLD_OUTSIDE'),
    jsonb_build_array(jsonb_build_object('item_id',ib,'quantity',90), jsonb_build_object('item_id',ic,'quantity',90)));
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',sh), jsonb_build_array(jsonb_build_object('item_id',ic,'quantity',4)));
  perform public.send_purchase_order((x->>'id')::uuid);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',e,'role','authenticated')::text, true);
  set local role authenticated;
  select * into r from public.reorder_suggestions(sh, 30) s where s.internal_item_code = 'IC';
  res := res || 'R1 IC: used 3/day x 10 days x 1.5 = target ' || coalesce(r.target::text,'?') || ' (want 45), in stock ' || coalesce(r.on_hand::text,'?') || ', on order ' || coalesce(r.incoming_po::text,'?') ||
    ' (want 0: no purchase permission), suggest ' || coalesce(r.suggested::text,'?') || ' (want 35): ' ||
    case when r.target = 45 and r.on_hand = 10 and r.avg_daily = 3 and r.target_source = 'formula' and r.incoming_po = 0 and r.suggested = 35 then 'PASS' else 'FAIL' end || E'\n';
  select * into r from public.reorder_suggestions(sh, 30) s where s.internal_item_code = 'IB';
  res := res || 'R2 IB: need 35, MOQ 20 -> suggest ' || coalesce(r.suggested::text,'?') || ' (want 40): ' || case when r.suggested = 40 then 'PASS' else 'FAIL' end || E'\n';
  select * into r from public.reorder_suggestions(sh, 30) s where s.internal_item_code = 'ID';
  res := res || 'R3 ID: no lead time, manual max 10, stock 2 -> target source ' || coalesce(r.target_source,'?') || ', suggest ' || coalesce(r.suggested::text,'?') || ' (want 8): ' ||
    case when r.target_source = 'max level' and r.suggested = 8 then 'PASS' else 'FAIL' end || E'\n';
  select * into r from public.reorder_suggestions(sh, 30) s where s.internal_item_code = 'IA';
  res := res || 'R4 IA: consumption but no lead time or max -> listed with no suggestion (' || coalesce(r.suggested::text,'?') || '): ' ||
    case when r.suggested = 0 and r.target is null and r.consumed = 3 then 'PASS' else 'FAIL' end || E'\n';
  begin perform * from public.reorder_suggestions(sh, 3); res := res || 'R6 three days: FAIL' || E'\n';
  exception when others then res := res || 'R6 fewer than 7 days is refused: PASS' || E'\n'; end;
  reset role;

  -- the admin sees the open purchase order and the suggestion drops by it
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  select * into r from public.reorder_suggestions(sh, 30) s where s.internal_item_code = 'IC';
  res := res || 'R1b with purchase rights the 4 on order count: suggest ' || coalesce(r.suggested::text,'?') || ' (want 31): ' ||
    case when r.incoming_po = 4 and r.suggested = 31 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',v,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform * from public.reorder_suggestions(sh, 30); res := res || 'R5 without items.view: FAIL' || E'\n';
  exception when others then res := res || 'R5 suggestions need stock.view and items.view: PASS' || E'\n'; end;
  reset role;

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
