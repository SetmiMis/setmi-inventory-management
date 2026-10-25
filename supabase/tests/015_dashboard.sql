-- Tests for 20261025000021 and 22 (dashboard_data). Ends with a deliberate exception (rollback). Every line should say PASS.
-- Assumes billing_enabled may be ON or OFF; the test switches it ON inside the rolled-back transaction.
do $$
declare
  adm uuid := gen_random_uuid(); fu uuid := gen_random_uuid(); nu uuid := gen_random_uuid(); ou uuid := gen_random_uuid();
  sh uuid; wh uuid; oth uuid; ia uuid; ib uuid; ic uuid; s1 uuid; x jsonb; d jsonb; v_po uuid; v_t uuid; v_b uuid;
  res text := ''; td date := (now() at time zone 'Asia/Kolkata')::date;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(fu,'f@t.l'),(nu,'n@t.l'),(ou,'o@t.l');
  update public.profiles set is_active = true where id in (adm,fu,nu,ou);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key)
    select u, k from unnest(array[fu, ou]) u, unnest(array['bills.view','stock.view','items.view','purchase.view','receipts.view','transfers.view']) k;
  insert into public.user_permissions (user_id, permission_key) values (nu, 'stock.view');
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.locations (code, name, type) values ('WH','Warehouse','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('OTH','Other','SHOP') returning id into oth;
  insert into public.user_locations values (fu, sh), (fu, wh), (ou, oth);
  insert into public.suppliers (name, supplier_type) values ('Sup','LOCAL') returning id into s1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('IA','a','A','LOCAL','PCS',100) returning id into ia;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('IB','b','B','LOCAL','PCS',50) returning id into ib;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('IC','c','C','LOCAL','PCS') returning id into ic;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values
    (ia, sh, 10, 'OPENING'), (ib, sh, 3, 'OPENING'), (ia, wh, 20, 'OPENING');
  insert into public.reorder_levels (item_id, location_id, min_qty) values (ib, sh, 5), (ic, sh, 3);

  -- activity, made by the admin
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  perform public.admin_set_billing_enabled(true);
  set local role authenticated;
  perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',2)));
  perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','UPI'), jsonb_build_array(jsonb_build_object('item_id',ib,'quantity',1)));
  x := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',1)));
  v_b := (x->>'id')::uuid;
  perform public.void_bill(v_b, 'test');
  x := public.save_stock_transfer(null, jsonb_build_object('from_location_id',wh,'to_location_id',sh), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',5)));
  v_t := (x->>'id')::uuid; perform public.send_stock_transfer(v_t);
  x := public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh,'order_date',td - 3,'expected_date',td - 1), jsonb_build_array(jsonb_build_object('item_id',ia,'quantity',4)));
  v_po := (x->>'id')::uuid; perform public.send_purchase_order(v_po);
  perform public.save_purchase_order(null, jsonb_build_object('supplier_id',s1,'location_id',wh), jsonb_build_array(jsonb_build_object('item_id',ib,'quantity',4)));
  perform public.save_goods_receipt(null, jsonb_build_object('supplier_id',s1,'location_id',sh), jsonb_build_array(jsonb_build_object('item_id',ib,'quantity',1)));
  reset role;

  -- D1-D3: the full user
  perform set_config('request.jwt.claims', json_build_object('sub',fu,'role','authenticated')::text, true);
  set local role authenticated;
  d := public.dashboard_data(td, td, null);
  res := res || 'D1 sales today ' || (d->'sales'->>'total') || ' (want 250, voided bill out), bills ' || (d->'sales'->>'bills') || ' (want 2), cash ' || (d->'sales'->>'cash') || ', upi ' || (d->'sales'->>'upi') || ': ' ||
    case when (d->'sales'->>'total')::numeric = 250 and (d->'sales'->>'bills')::int = 2 and (d->'sales'->>'cash')::numeric = 200 and (d->'sales'->>'upi')::numeric = 50 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'D1b one day in the series with 250, top item IA 200: ' ||
    case when jsonb_array_length(d->'sales'->'by_day') = 1 and (d->'sales'->'by_day'->0->>'total')::numeric = 250
              and d->'sales'->'top_items'->0->>'code' = 'IA' and (d->'sales'->'top_items'->0->>'amount')::numeric = 200 then 'PASS' else 'FAIL' end || E'\n';
  d := public.dashboard_data(td, td, sh);
  res := res || 'D2 shop stock: low ' || (d->'stock'->>'low') || ' (want 2: IB below 5, IC empty), out ' || (d->'stock'->>'out') || ' (want 1), low list ' || jsonb_array_length(d->'stock'->'low_list') || ': ' ||
    case when (d->'stock'->>'low')::int = 2 and (d->'stock'->>'out')::int = 1 and jsonb_array_length(d->'stock'->'low_list') = 2 then 'PASS' else 'FAIL' end || E'\n';
  d := public.dashboard_data(td, td, null);
  res := res || 'D3 orders open ' || (d->'purchase'->>'open') || ' late ' || (d->'purchase'->>'late') || ' drafts ' || (d->'purchase'->>'drafts') || ', receipts to post ' || (d->'receipts'->>'drafts') ||
    ', transfers in ' || (d->'transfers'->>'incoming') || ' out ' || (d->'transfers'->>'outgoing') || ': ' ||
    case when (d->'purchase'->>'open')::int = 1 and (d->'purchase'->>'late')::int = 1 and (d->'purchase'->>'drafts')::int = 1
              and (d->'receipts'->>'drafts')::int = 1 and (d->'transfers'->>'incoming')::int = 1 and (d->'transfers'->>'outgoing')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'D3b recent activity is filled (' || jsonb_array_length(d->'stock'->'recent') || ' rows): ' || case when jsonb_array_length(d->'stock'->'recent') > 0 then 'PASS' else 'FAIL' end || E'\n';
  d := public.dashboard_data(td, td, wh);
  res := res || 'D7 filtered to the warehouse: bills ' || (d->'sales'->>'bills') || ' (want 0), orders open ' || (d->'purchase'->>'open') || ' (want 1): ' ||
    case when (d->'sales'->>'bills')::int = 0 and (d->'purchase'->>'open')::int = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.dashboard_data(td - 400, td, null); res := res || 'D6 range over a year: FAIL' || E'\n';
  exception when others then res := res || 'D6 a range over one year is refused: PASS' || E'\n'; end;
  reset role;

  -- D4: a user with only stock.view (no items.view) and nothing else gets no sections (not zeros)
  perform set_config('request.jwt.claims', json_build_object('sub',nu,'role','authenticated')::text, true);
  set local role authenticated;
  d := public.dashboard_data(td, td, null);
  res := res || 'D4 stock.view without items.view, nothing else: no sections at all: ' ||
    case when not (d ? 'sales' or d ? 'stock' or d ? 'purchase' or d ? 'receipts' or d ? 'transfers') then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- D5: a user of another place sees none of the shop or warehouse numbers
  perform set_config('request.jwt.claims', json_build_object('sub',ou,'role','authenticated')::text, true);
  set local role authenticated;
  d := public.dashboard_data(td, td, null);
  res := res || 'D5 other place: bills ' || (d->'sales'->>'bills') || ', low ' || (d->'stock'->>'low') || ', orders ' || (d->'purchase'->>'open') || ', receipts ' || (d->'receipts'->>'drafts') || ', incoming ' || (d->'transfers'->>'incoming') || ' (all want 0): ' ||
    case when (d->'sales'->>'bills')::int = 0 and (d->'stock'->>'low')::int = 0 and (d->'purchase'->>'open')::int = 0
              and (d->'receipts'->>'drafts')::int = 0 and (d->'transfers'->>'incoming')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- D8: anonymous cannot run it
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin perform public.dashboard_data(td, td, null); res := res || 'D8 anonymous: FAIL' || E'\n';
  exception when others then res := res || 'D8 anonymous cannot run the dashboard: PASS' || E'\n'; end;
  reset role;

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
