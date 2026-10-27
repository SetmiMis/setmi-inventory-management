-- Test 028: import shipments (migration 38). Rolled back at the end. Makes its own users, place, suppliers, items and orders.
do $$
declare
  adm uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  wh uuid; s_imp uuid; s_loc uuid; i1 uuid; i2 uuid; po_imp uuid; po_loc uuid; r jsonb; res text := ''; pg jsonb;
  l1 bigint; l2 bigint; sh1 uuid; sh2 uuid; n int;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, viewer, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (viewer, 'shipments.view'), (viewer, 'purchase.view');
  insert into public.locations (code, name, type) values ('WHY', 'Warehouse Y', 'WAREHOUSE') returning id into wh;
  insert into public.user_locations values (viewer, wh);
  insert into public.suppliers (name, supplier_type, country) values ('TEST IMPORT SUP', 'IMPORT', 'China') returning id into s_imp;
  insert into public.suppliers (name, supplier_type, country) values ('TEST LOCAL SUP', 'LOCAL', 'India') returning id into s_loc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('SHX1','shx one','shx one','LOCAL','PCS',10) returning id into i1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('SHX2','shx two','shx two','LOCAL','PCS',10) returning id into i2;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  r := public.save_purchase_order(null, jsonb_build_object('supplier_id', s_imp, 'location_id', wh, 'order_date', current_date - 20, 'expected_date', current_date + 5),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 100, 'unit_cost', 10), jsonb_build_object('item_id', i2, 'quantity', 50, 'unit_cost', 20)));
  po_imp := (r->>'id')::uuid; perform public.send_purchase_order(po_imp);
  r := public.save_purchase_order(null, jsonb_build_object('supplier_id', s_loc, 'location_id', wh, 'order_date', current_date),
        jsonb_build_array(jsonb_build_object('item_id', i1, 'quantity', 5, 'unit_cost', 10)));
  po_loc := (r->>'id')::uuid; perform public.send_purchase_order(po_loc);
  select id into l1 from public.purchase_order_lines where po_id = po_imp and item_id = i1;
  select id into l2 from public.purchase_order_lines where po_id = po_imp and item_id = i2;

  -- S1 create
  r := public.save_import_shipment(null, jsonb_build_object('po_id', po_imp, 'container_no', 'TCLU1', 'port_loading', 'Shenzhen (CN)', 'port_discharge', 'Nhava Sheva (IN)',
        'etd', current_date - 10, 'eta', current_date - 2, 'incoterms', 'fob'),
        jsonb_build_array(jsonb_build_object('po_line_id', l1, 'quantity', 60), jsonb_build_object('po_line_id', l2, 'quantity', 50)));
  sh1 := (r->>'id')::uuid;
  res := res || 'S1 create gives a number (' || (r->>'shipment_no') || '): ' || case when (r->>'shipment_no') ~ '^IMP-[0-9]{4}-[0-9]{3,}$' then 'PASS' else 'FAIL' end || E'\n';
  -- S2 status booked, one event
  res := res || 'S2 starts Booked with one event: ' || case when (select status from public.import_shipments where id = sh1) = 'BOOKED'
    and (select count(*) from public.import_shipment_events where shipment_id = sh1) = 1 then 'PASS' else 'FAIL' end || E'\n';
  -- S3 cannot ship more than open
  begin perform public.save_import_shipment(null, jsonb_build_object('po_id', po_imp), jsonb_build_array(jsonb_build_object('po_line_id', l1, 'quantity', 41)));
    res := res || 'S3 more than open: FAIL' || E'\n';
  exception when others then res := res || 'S3 more than is open is refused: PASS' || E'\n'; end;
  -- S4 second shipment with the rest is fine
  r := public.save_import_shipment(null, jsonb_build_object('po_id', po_imp), jsonb_build_array(jsonb_build_object('po_line_id', l1, 'quantity', 40)));
  sh2 := (r->>'id')::uuid;
  res := res || 'S4 second shipment takes the rest: PASS' || E'\n';
  -- S5 local supplier refused
  begin perform public.save_import_shipment(null, jsonb_build_object('po_id', po_loc), jsonb_build_array(jsonb_build_object('po_line_id', (select id from public.purchase_order_lines where po_id = po_loc), 'quantity', 1)));
    res := res || 'S5 local supplier: FAIL' || E'\n';
  exception when others then res := res || 'S5 local supplier order refused: PASS' || E'\n'; end;
  -- S6 bad eta
  begin perform public.save_import_shipment(sh2, jsonb_build_object('po_id', po_imp, 'etd', current_date, 'eta', current_date - 1), jsonb_build_array(jsonb_build_object('po_line_id', l1, 'quantity', 40)));
    res := res || 'S6 ETA before ETD: FAIL' || E'\n';
  exception when others then res := res || 'S6 ETA before ETD refused: PASS' || E'\n'; end;
  -- S7 edit changes quantities
  perform public.save_import_shipment(sh2, jsonb_build_object('po_id', po_imp), jsonb_build_array(jsonb_build_object('po_line_id', l1, 'quantity', 30)));
  res := res || 'S7 edit replaces lines: ' || case when (select sum(quantity) from public.import_shipment_lines where shipment_id = sh2) = 30 then 'PASS' else 'FAIL' end || E'\n';
  -- S8 status forward only
  perform public.set_import_shipment_status(sh1, 'IN_TRANSIT', current_date - 5);
  begin perform public.set_import_shipment_status(sh1, 'DISPATCHED', current_date); res := res || 'S8 backwards: FAIL' || E'\n';
  exception when others then res := res || 'S8 a step backwards is refused: PASS' || E'\n'; end;
  -- S9 future date refused
  begin perform public.set_import_shipment_status(sh1, 'ARRIVED', current_date + 10); res := res || 'S9 future date: FAIL' || E'\n';
  exception when others then res := res || 'S9 a future date is refused: PASS' || E'\n'; end;
  -- S10 page: delayed + filters + value
  pg := public.import_shipments_page(null, null, 'DELAYED', null, null, 10, 0);
  res := res || 'S10 delayed shipment found with items 2 and value 1600 (' || coalesce(pg->'rows'->0->>'value', '?') || '): ' ||
    case when (pg->>'total')::int = 1 and (pg->'rows'->0->>'items')::int = 2 and (pg->'rows'->0->>'value')::numeric = 1600 and (pg->'rows'->0->>'delayed')::boolean then 'PASS' else 'FAIL' end || E'\n';
  pg := public.import_shipments_page('tclu', s_imp, 'IN_TRANSIT', 'Shenzhen (CN)', 'Nhava Sheva (IN)', 10, 0);
  res := res || 'S11 search, supplier, status and ports together: ' || case when (pg->>'total')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.import_shipments_page('%', null, null, null, null, 10, 0);
  res := res || 'S12 percent sign is text: ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.import_shipments_page(null, null, null, null, null, 10, 0);
  res := res || 'S13 numbers: ' || case when (pg->'kpi'->>'total')::int = 2 and (pg->'kpi'->>'in_transit')::int = 1 and (pg->'kpi'->>'delayed')::int = 1 then 'PASS' else 'FAIL ' || (pg->'kpi')::text end || E'\n';
  begin perform public.import_shipments_page(null, null, 'BOGUS', null, null, 10, 0); res := res || 'S14 bad status: FAIL' || E'\n';
  exception when others then res := res || 'S14 bad status refused: PASS' || E'\n'; end;
  -- S15 charges
  perform public.add_import_shipment_charge(sh1, 'freight', 5000, 'sea freight');
  perform public.add_import_shipment_charge(sh1, 'CUSTOMS_DUTY', 1250.50, null);
  res := res || 'S15 two charges saved: ' || case when (select sum(amount) from public.import_shipment_charges where shipment_id = sh1) = 6250.50 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.add_import_shipment_charge(sh1, 'MAGIC', 1, null); res := res || 'S16 bad charge type: FAIL' || E'\n';
  exception when others then res := res || 'S16 unknown charge type refused: PASS' || E'\n'; end;
  -- S17 deliver, then final
  perform public.set_import_shipment_status(sh1, 'DELIVERED', current_date);
  begin perform public.set_import_shipment_status(sh1, 'CANCELLED', current_date); res := res || 'S17 delivered then cancel: FAIL' || E'\n';
  exception when others then res := res || 'S17 a delivered shipment is final: PASS' || E'\n'; end;
  -- S18 cancel frees the quantity
  perform public.set_import_shipment_status(sh2, 'CANCELLED', current_date);
  perform public.save_import_shipment(null, jsonb_build_object('po_id', po_imp), jsonb_build_array(jsonb_build_object('po_line_id', l1, 'quantity', 40)));
  res := res || 'S18 a cancelled shipment frees its quantity: PASS' || E'\n';
  -- S19 no direct writes
  begin insert into public.import_shipment_lines (shipment_id, po_line_id, quantity) values (sh1, l2, 1); res := res || 'S19 direct write: FAIL' || E'\n';
  exception when others then res := res || 'S19 no direct table writes: PASS' || E'\n'; end;
  reset role;

  -- viewer: sees shipments, no money, cannot write
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  pg := public.import_shipments_page(null, null, null, null, null, 50, 0);
  res := res || 'S20 a viewer without receipts.cost sees shipments but no value: ' ||
    case when (pg->>'total')::int >= 3 and (select bool_and(e->'value' = 'null'::jsonb) from jsonb_array_elements(pg->'rows') e) then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.import_shipment_charges;
  res := res || 'S21 a viewer sees no charges: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.save_import_shipment(null, jsonb_build_object('po_id', po_imp), jsonb_build_array(jsonb_build_object('po_line_id', l2, 'quantity', 1)));
    res := res || 'S22 viewer creates: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'S22 a viewer cannot create: PASS' || E'\n'; end;
  begin perform public.set_import_shipment_status(sh2, 'DELIVERED', current_date); res := res || 'S23 viewer changes status: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'S23 a viewer cannot change status: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.import_shipments_page(null, null, null, null, null, 10, 0); res := res || 'S24 stranger: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'S24 a user without shipment rights is refused: PASS' || E'\n'; end;
  reset role;
  set local role anon;
  begin perform public.import_shipments_page(null, null, null, null, null, 10, 0); res := res || 'S25 anonymous: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'S25 anonymous is denied: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 028 RESULTS (rolled back):\n%', res;
end $$;
