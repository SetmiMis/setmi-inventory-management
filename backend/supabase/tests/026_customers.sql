-- Test 026: customers, the optional customer on a bill, and customers_page (migration 36). Rolled back at the end.
-- Makes its own users, shop and product, so it does not depend on the demo data. Billing is switched on inside the test.
do $$
declare
  adm uuid := gen_random_uuid(); cashier uuid := gen_random_uuid(); viewer uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  sh uuid; pc uuid; c1 uuid; c2 uuid; code1 text; r jsonb; res text := ''; cnt int; nm text; ph text; cid uuid; page jsonb;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(cashier,'c@t.l'),(viewer,'v@t.l'),(nobody,'n@t.l');
  update public.profiles set is_active = true where id in (adm, cashier, viewer, nobody);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (cashier,'bills.create'),(cashier,'bills.view'),(cashier,'items.view'),
    (viewer,'customers.view');
  insert into public.locations (code, name, type) values ('SHX','Shop X','SHOP') returning id into sh;
  insert into public.user_locations values (cashier, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PCX','pcx','Bill name PCX','LOCAL','PCS',100) returning id into pc;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values (pc, sh, 20, 'OPENING');

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_billing_enabled(true);
  insert into public.customers (name, customer_type, city, state, phone, gstin, credit_limit, payment_terms)
    values ('TEST CUST ONE', 'DEALER', 'Delhi', 'Delhi', '+91 98765 43210', '07ABCDE1234F1Z5', 500000, '30 Days') returning id, code into c1, code1;
  insert into public.customers (name, is_active) values ('TEST CUST OFF', false) returning id into c2;
  res := res || 'C1 code is made automatically (' || code1 || '): ' || case when code1 ~ '^CUST-[0-9]{3,}$' then 'PASS' else 'FAIL' end || E'\n';
  begin insert into public.customers (name, customer_type) values ('X', 'ALIEN'); res := res || 'C2 bad type accepted: FAIL' || E'\n';
  exception when check_violation then res := res || 'C2 bad customer type refused: PASS' || E'\n'; end;
  begin insert into public.customers (name, gstin) values ('X', 'short'); res := res || 'C3 bad GSTIN accepted: FAIL' || E'\n';
  exception when check_violation then res := res || 'C3 bad GSTIN refused: PASS' || E'\n'; end;
  update public.customers set code = 'HACKED', name = 'TEST CUST ONE B' where id = c1;
  select code, name into nm, ph from public.customers where id = c1;
  res := res || 'C4 the code never changes (' || nm || '): ' || case when nm = code1 and ph = 'TEST CUST ONE B' then 'PASS' else 'FAIL' end || E'\n';
  update public.customers set name = 'TEST CUST ONE' where id = c1;

  perform set_config('request.jwt.claims', json_build_object('sub',cashier,'role','authenticated')::text, true);
  select count(*) into cnt from public.customers;
  res := res || 'C5 a cashier can read the customer list to pick one (' || cnt || '): ' || case when cnt >= 2 then 'PASS' else 'FAIL' end || E'\n';
  begin insert into public.customers (name) values ('CASHIER MADE'); res := res || 'C6 cashier adds a customer: FAIL' || E'\n';
  exception when others then res := res || 'C6 a cashier cannot add customers: PASS' || E'\n'; end;

  r := public.create_bill(jsonb_build_object('location_id', sh, 'payment_mode', 'CASH', 'customer_id', c1), jsonb_build_array(jsonb_build_object('item_id', pc, 'quantity', 3)));
  select customer_id, customer_name, customer_phone into cid, nm, ph from public.bills where id = (r->>'id')::uuid;
  res := res || 'C7 the bill points at the customer and copies name and phone (' || coalesce(nm,'?') || ', ' || coalesce(ph,'?') || '): ' || case when (r->>'ok')::boolean and cid = c1 and nm = 'TEST CUST ONE' and ph = '+91 98765 43210' then 'PASS' else 'FAIL' end || E'\n';
  r := public.create_bill(jsonb_build_object('location_id', sh, 'payment_mode', 'UPI', 'customer_id', c1, 'customer_name', 'Typed name'), jsonb_build_array(jsonb_build_object('item_id', pc, 'quantity', 2)));
  select customer_name into nm from public.bills where id = (r->>'id')::uuid;
  res := res || 'C8 a typed name wins over the customer name (' || coalesce(nm,'?') || '): ' || case when nm = 'Typed name' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.create_bill(jsonb_build_object('location_id', sh, 'payment_mode', 'CASH', 'customer_id', gen_random_uuid()), jsonb_build_array(jsonb_build_object('item_id', pc, 'quantity', 1)));
    res := res || 'C9 unknown customer on a bill: FAIL' || E'\n';
  exception when others then res := res || 'C9 an unknown customer is refused (' || sqlerrm || '): ' || case when sqlerrm like 'Customer not found%' then 'PASS' else 'FAIL' end || E'\n'; end;
  begin perform public.create_bill(jsonb_build_object('location_id', sh, 'payment_mode', 'CASH', 'customer_id', c2), jsonb_build_array(jsonb_build_object('item_id', pc, 'quantity', 1)));
    res := res || 'C10 switched-off customer on a bill: FAIL' || E'\n';
  exception when others then res := res || 'C10 a switched-off customer is refused: ' || case when sqlerrm like 'Customer not found%' then 'PASS' else 'FAIL' end || E'\n'; end;
  r := public.create_bill(jsonb_build_object('location_id', sh, 'payment_mode', 'CASH'), jsonb_build_array(jsonb_build_object('item_id', pc, 'quantity', 1)));
  res := res || 'C11 a bill without a customer still works: ' || case when (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.customers_page(null, null, null, null, 10, 0); res := res || 'C12 cashier opens the customers page data: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'C12 the customers page data needs customers.view: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  page := public.customers_page('cust one', 'DEALER', 'active', 'Delhi', 10, 0);
  res := res || 'C13 admin page: total ' || (page->>'total') || ', orders ' || (page->'rows'->0->>'orders') || ', sales ' || (page->'rows'->0->>'sales') || ' (want 1, 2, 500): ' ||
    case when (page->>'total')::int = 1 and (page->'rows'->0->>'orders')::int = 2 and (page->'rows'->0->>'sales')::numeric = 500 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'C14 numbers present: ' || case when (public.customers_page(null,null,null,null,10,0)->'kpi') ?& array['total','active','inactive','orders','sales','new_month'] then 'PASS' else 'FAIL' end || E'\n';
  page := public.customers_page('%', null, null, null, 10, 0);
  res := res || 'C15 percent sign is text: ' || case when (page->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.customers_page(null, 'ALIEN', null, null, 10, 0); res := res || 'C16 bad type filter: FAIL' || E'\n';
  exception when others then res := res || 'C16 bad type filter refused: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  set local role authenticated;
  page := public.customers_page(null, null, null, null, 10, 0);
  res := res || 'C17 a customers.view user sees the page data but no sales (bills are place-bound): ' || case when (page->>'total')::int >= 2 and (page->'kpi'->>'sales')::numeric = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin insert into public.customers (name) values ('VIEWER MADE'); res := res || 'C18 viewer adds a customer: FAIL' || E'\n';
  exception when others then res := res || 'C18 a viewer cannot add customers: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',nobody,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.customers;
  res := res || 'C19 an account with no rights sees no customers (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  set local role anon;
  begin perform 1 from public.customers limit 1; res := res || 'C20 anonymous reads customers: FAIL' || E'\n';
  exception when insufficient_privilege then res := res || 'C20 anonymous cannot read customers: PASS' || E'\n'; end;
  reset role;
  raise exception E'TEST 026 RESULTS (rolled back):\n%', res;
end $$;
