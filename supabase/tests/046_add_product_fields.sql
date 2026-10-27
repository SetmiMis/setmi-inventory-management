-- Test 046: Add Product fields and the three switches (migration 56). Rolled back at the end.
do $$
declare adm uuid := gen_random_uuid(); res text := ''; it_on uuid; it_off uuid; loc uuid; cu uuid; su uuid; r jsonb; v_low boolean; n int;
begin
  insert into auth.users (id, email) values (adm,'adm@c.l');
  update public.profiles set is_active = true, is_admin = true where id = adm;
  select id into loc from public.locations where is_active and type <> 'TRANSIT' limit 1;
  insert into public.customers (name, customer_type) values ('TEST P CUST', 'DEALER') returning id into cu;
  insert into public.suppliers (name) values ('TEST P SUP') returning id into su;
  insert into public.items (internal_item_code, item_name, selling_item_name, unit, purchase_source, brand, tags, hsn_code)
    values ('TESTP-ON', 'Test on', 'Test on', 'PCS', 'LOCAL', 'Brand', array['a','b'], '8501') returning id into it_on;
  insert into public.items (internal_item_code, item_name, selling_item_name, unit, purchase_source, show_in_sales, show_in_purchase, low_stock_alert)
    values ('TESTP-OFF', 'Test off', 'Test off', 'PCS', 'LOCAL', false, false, false) returning id into it_off;
  insert into public.reorder_levels (item_id, location_id, min_qty) values (it_on, loc, 5), (it_off, loc, 5);

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;

  res := res || 'P1 new fields are stored: ' || case when (select brand = 'Brand' and tags = array['a','b'] and hsn_code = '8501' from public.items where id = it_on) then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'P2 defaults: all three switches are ON: ' || case when (select show_in_sales and show_in_purchase and low_stock_alert from public.items where id = it_on) then 'PASS' else 'FAIL' end || E'\n';
  begin update public.items set image_paths = array['1','2','3','4','5','6'] where id = it_on; res := res || 'P3 six images allowed: PASS' || E'\n';
  exception when others then res := res || 'P3 six images allowed: FAIL' || E'\n'; end;
  begin update public.items set image_paths = array['1','2','3','4','5','6','7'] where id = it_on; res := res || 'P4 seven images: FAIL' || E'\n';
  exception when others then res := res || 'P4 seven images refused: PASS' || E'\n'; end;
  begin update public.items set short_description = repeat('x', 501) where id = it_on; res := res || 'P5 long description: FAIL' || E'\n';
  exception when others then res := res || 'P5 a short description over 500 letters is refused: PASS' || E'\n'; end;
  begin update public.items set weight_unit = 'tonne' where id = it_on; res := res || 'P6 bad weight unit: FAIL' || E'\n';
  exception when others then res := res || 'P6 a bad weight unit is refused: PASS' || E'\n'; end;

  begin
    r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', loc, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', it_on, 'quantity', 1, 'rate', 10)));
    res := res || 'P7 order with a normal item saves: PASS' || E'\n';
  exception when others then res := res || 'P7 order with a normal item saves: FAIL ' || sqlerrm || E'\n'; end;
  begin
    r := public.save_sales_order(null, jsonb_build_object('customer_id', cu, 'location_id', loc, 'channel', 'DIRECT'), jsonb_build_array(jsonb_build_object('item_id', it_off, 'quantity', 1, 'rate', 10)));
    res := res || 'P8 sales order with a switched-off item: FAIL' || E'\n';
  exception when others then res := res || 'P8 sales order refuses an item switched off for sales: ' || case when sqlerrm like '%switched off for sales%' then 'PASS' else 'FAIL ' || sqlerrm end || E'\n'; end;
  begin
    r := public.save_purchase_order(null, jsonb_build_object('supplier_id', su, 'location_id', loc), jsonb_build_array(jsonb_build_object('item_id', it_off, 'quantity', 1)));
    res := res || 'P9 purchase order with a switched-off item: ' || case when r->>'ok' = 'false' and r::text like '%switched off for purchase%' then 'PASS' else 'FAIL ' || r::text end || E'\n';
  exception when others then res := res || 'P9 purchase order: FAIL ' || sqlerrm || E'\n'; end;
  begin
    r := public.save_purchase_order(null, jsonb_build_object('supplier_id', su, 'location_id', loc), jsonb_build_array(jsonb_build_object('item_id', it_on, 'quantity', 1)));
    res := res || 'P10 purchase order with a normal item saves: ' || case when r->>'ok' = 'true' then 'PASS' else 'FAIL ' || r::text end || E'\n';
  exception when others then res := res || 'P10 purchase order normal: FAIL ' || sqlerrm || E'\n'; end;

  select is_low into v_low from public.stock_overview where item_id = it_on and location_id = loc;
  res := res || 'P11 normal item under its minimum is low: ' || case when v_low then 'PASS' else 'FAIL' end || E'\n';
  select is_low into v_low from public.stock_overview where item_id = it_off and location_id = loc;
  res := res || 'P12 item with the low stock alert off is never low: ' || case when v_low = false then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.reorder_suggestions(loc, 30) where item_id = it_off;
  res := res || 'P13 reorder list leaves out the alert-off item: ' || case when n = 0 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  raise exception E'\n%', res;
end $$;
