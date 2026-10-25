-- Tests for 20261025000013/14 (billing switch, selling price, bills). Ends with a deliberate exception (rollback).
-- Every line should say PASS. Stock numbers are read with the admin identity where the user has no stock.view.
-- Assumes billing_enabled is OFF at the start (the default) and that the audit counts start from this run.
do $$
declare
  adm uuid := gen_random_uuid(); c uuid := gen_random_uuid(); m uuid := gen_random_uuid(); n uuid := gen_random_uuid(); o uuid := gen_random_uuid(); e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
  sh uuid; oth uuid; pc uuid; mt uuid; np uuid; b1 uuid; b2 uuid;
  res text := ''; r jsonb; cnt int; q numeric; st text; txt text; tot numeric; nm text; pr numeric; en boolean; nb int;
begin
  insert into auth.users (id, email) values (adm,'a@t.l'),(c,'c@t.l'),(m,'m@t.l'),(n,'n@t.l'),(o,'o@t.l'),(e1,'e1@t.l'),(e2,'e2@t.l');
  update public.profiles set is_active = true where id in (adm,c,m,n,o,e1,e2);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values
    (c,'bills.create'),(c,'bills.view'),(c,'items.view'),(c,'stock.view'),
    (m,'bills.create'),(m,'bills.view'),(m,'bills.void'),(m,'bills.override_price'),(m,'items.view'),
    (n,'items.view'),
    (o,'bills.create'),(o,'bills.view'),(o,'items.view'),
    (e1,'items.view'),(e1,'items.edit'),
    (e2,'items.view'),(e2,'items.edit_price');
  insert into public.locations (code, name, type) values ('SH','Shop','SHOP') returning id into sh;
  insert into public.locations (code, name, type) values ('OTH','Other','SHOP') returning id into oth;
  insert into public.user_locations values (c, sh), (m, sh), (n, sh), (o, oth), (e1, sh), (e2, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('PC','pc internal','Bill name PC','LOCAL','PCS',100) returning id into pc;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit, selling_price) values ('MT','mt','Wire per metre','LOCAL','MTR',40.5) returning id into mt;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, unit) values ('NP','no price','No price item','LOCAL','PCS') returning id into np;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values (pc, sh, 10, 'OPENING'), (mt, sh, 5, 'OPENING'), (np, sh, 5, 'OPENING'), (pc, oth, 3, 'OPENING');

  select value = 'false'::jsonb into en from public.app_settings where key = 'billing_enabled';
  res := res || 'B0 the switch is OFF by default: ' || case when en then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B1 billing while switched OFF: FAIL' || E'\n';
  exception when others then res := res || 'B1 the database refuses bills while billing is OFF (' || sqlerrm || '): ' || case when sqlerrm = 'Billing is switched off' then 'PASS' else 'FAIL' end || E'\n';
  end;
  begin
    perform public.admin_set_billing_enabled(true);
    res := res || 'B2 non-admin switches billing on: FAIL' || E'\n';
  exception when others then res := res || 'B2 only an admin can switch billing: PASS' || E'\n';
  end;
  begin
    update public.app_settings set value = 'true'::jsonb;
    get diagnostics nb = row_count;
    res := res || 'B2b direct update of the setting rows ' || nb || ' (want 0): ' || case when nb = 0 then 'PASS' else 'FAIL' end || E'\n';
  exception when others then res := res || 'B2b direct update of the setting refused: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  perform public.admin_set_billing_enabled(true);
  res := res || 'B2c admin switches billing ON: ' || case when public.billing_enabled() then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','cash','customer_name','Ramesh','discount','10'),
         jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',2), jsonb_build_object('item_id',mt,'quantity',1.5)));
  b1 := (r->>'id')::uuid;
  select total, bill_no into tot, txt from public.bills where id = b1;
  select quantity into q from public.stock_balances where item_id = pc and location_id = sh;
  select count(*) into cnt from public.stock_movements where reference = txt and movement_type = 'SALE' and from_location_id = sh and to_location_id is null;
  res := res || 'B3 bill ' || coalesce(txt,'?') || ': total ' || coalesce(tot::text,'?') || ' (want 250.75), pc stock ' || coalesce(q::text,'?') || ' (want 8), SALE movements ' || cnt || ': ' ||
    case when (r->>'ok')::boolean and tot = 250.75 and q = 8 and cnt = 2 and txt ~ '^BILL-[0-9]{6}$' then 'PASS' else 'FAIL' end || E'\n';
  select item_name, unit_price into nm, pr from public.bill_lines where bill_id = b1 and item_id = pc;
  res := res || 'B3b the bill keeps the printed name and price (' || coalesce(nm,'?') || ', ' || coalesce(pr::text,'?') || '): ' || case when nm = 'Bill name PC' and pr = 100 then 'PASS' else 'FAIL' end || E'\n';

  select count(*) into nb from public.bills;
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',20)));
    res := res || 'B4 sell more than in stock: FAIL' || E'\n';
  exception when others then res := res || 'B4 not enough stock blocks the bill (' || left(sqlerrm, 50) || '): ' || case when sqlerrm like 'Not enough stock%' then 'PASS' else 'FAIL' end || E'\n';
  end;
  select count(*) into cnt from public.bills;
  select quantity into q from public.stock_balances where item_id = pc and location_id = sh;
  res := res || 'B4b nothing was written (bills ' || cnt || ' = ' || nb || ', stock ' || q || '): ' || case when cnt = nb and q = 8 then 'PASS' else 'FAIL' end || E'\n';

  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',np,'quantity',1)));
  res := res || 'B5 item without a selling price: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1,'unit_price',10)));
  res := res || 'B5b cashier cannot change the price: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1.5)));
  res := res || 'B6 pieces cannot be fractions: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',mt,'quantity',1.2345)));
  res := res || 'B6b metres allow at most 3 decimals: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1), jsonb_build_object('item_id',pc,'quantity',1)));
  res := res || 'B6c same item twice refused: ' || case when not (r->>'ok')::boolean then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH','discount','500'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B7 discount bigger than the bill: FAIL' || E'\n';
  exception when others then res := res || 'B7 discount bigger than the bill refused: PASS' || E'\n';
  end;
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH','discount','-5'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B7b negative discount: FAIL' || E'\n';
  exception when others then res := res || 'B7b negative discount refused: PASS' || E'\n';
  end;
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','BARTER'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B8 unknown payment mode: FAIL' || E'\n';
  exception when others then res := res || 'B8 unknown payment mode refused: PASS' || E'\n';
  end;
  begin
    perform public.create_bill(jsonb_build_object('location_id',oth,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B9 bill at a place you do not work in: FAIL' || E'\n';
  exception when others then res := res || 'B9 cannot bill at another place: PASS' || E'\n';
  end;
  begin
    insert into public.bills (location_id, location_code, location_name, payment_mode, subtotal, total) values (sh, 'SH', 'Shop', 'CASH', 5, 5);
    res := res || 'B9b direct insert into bills: FAIL' || E'\n';
  exception when others then res := res || 'B9b no direct insert into bills: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',n,'role','authenticated')::text, true);
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B10 user without bills.create: FAIL' || E'\n';
  exception when others then res := res || 'B10 billing needs bills.create: PASS' || E'\n';
  end;
  select count(*) into cnt from public.bills;
  res := res || 'B10b user without bill permissions sees no bills (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  r := public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','UPI'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1,'unit_price',90)));
  b2 := (r->>'id')::uuid;
  select unit_price into pr from public.bill_lines where bill_id = b2;
  res := res || 'B11 a user with the override right can change the price (' || coalesce(pr::text,'?') || '): ' || case when (r->>'ok')::boolean and pr = 90 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  begin
    perform public.void_bill(b1, 'customer returned');
    res := res || 'B12 void without bills.void: FAIL' || E'\n';
  exception when others then res := res || 'B12 voiding needs bills.void: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  begin
    perform public.void_bill(b1, '  ');
    res := res || 'B12b void without a reason: FAIL' || E'\n';
  exception when others then res := res || 'B12b a reason is required to void: PASS' || E'\n';
  end;
  perform public.void_bill(b1, 'customer returned the goods');
  select status::text into st from public.bills where id = b1;
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  select quantity into q from public.stock_balances where item_id = pc and location_id = sh;
  select count(*) into cnt from public.stock_movements where reference = txt and movement_type = 'SALE_RETURN' and to_location_id = sh;
  res := res || 'B13 void: status ' || st || ', pc stock ' || coalesce(q::text,'?') || ' (want 9 = 10 - 2 sold - 1 sold + 2 returned), return movements ' || cnt || ': ' || case when st = 'VOIDED' and cnt = 2 and q = 9 then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  begin
    perform public.void_bill(b1, 'again');
    res := res || 'B13b void twice: FAIL' || E'\n';
  exception when others then res := res || 'B13b voiding twice refused: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  perform public.admin_set_billing_enabled(false);
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  begin
    perform public.create_bill(jsonb_build_object('location_id',sh,'payment_mode','CASH'), jsonb_build_array(jsonb_build_object('item_id',pc,'quantity',1)));
    res := res || 'B14 bill after switching OFF: FAIL' || E'\n';
  exception when others then res := res || 'B14 switching OFF stops new bills again: PASS' || E'\n';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub',m,'role','authenticated')::text, true);
  perform public.void_bill(b2, 'wrong price');
  select status::text into st from public.bills where id = b2;
  res := res || 'B14b voiding still works while billing is OFF (' || coalesce(st,'?') || '): ' || case when st = 'VOIDED' then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  select count(*) into cnt from public.bills;
  res := res || 'B15 a cashier at another place sees none of these bills (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  select count(*) into cnt from public.bill_lines;
  res := res || 'B15b cashier sees bills and lines of their place (lines ' || cnt || ' >= 3): ' || case when cnt >= 3 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    update public.bill_lines set unit_price = 1 where bill_id = b1;
    res := res || 'B16 change a bill line: FAIL' || E'\n';
  exception when others then res := res || 'B16 bill lines can never be changed: PASS' || E'\n';
  end;
  begin
    update public.bills set total = 1, subtotal = 1, discount = 0 where id = b1;
    res := res || 'B16b change a bill amount: FAIL' || E'\n';
  exception when others then res := res || 'B16b a bill amount can never be changed: PASS' || E'\n';
  end;
  begin
    delete from public.bills where id = b1;
    res := res || 'B16c delete a bill: FAIL' || E'\n';
  exception when others then res := res || 'B16c bills cannot be deleted: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',e1,'role','authenticated')::text, true);
  set local role authenticated;
  begin
    update public.items set selling_price = 1 where id = pc;
    res := res || 'B17 price change by a user with only items.edit: FAIL' || E'\n';
  exception when others then res := res || 'B17 changing a price needs items.edit_price: PASS' || E'\n';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub',e2,'role','authenticated')::text, true);
  update public.items set selling_price = 120 where id = pc;
  get diagnostics nb = row_count;
  begin
    update public.items set item_name = 'renamed' where id = pc;
    get diagnostics cnt = row_count;
    res := res || 'B17b price-only user edits the name: FAIL (rows ' || cnt || ')' || E'\n';
  exception when others then res := res || 'B17b a price-only user can change the price (rows ' || nb || ') but nothing else: ' || case when nb = 1 then 'PASS' else 'FAIL' end || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    select count(*) into cnt from public.bills;
    res := res || 'B18 anonymous sees no bills (' || cnt || '): ' || case when cnt = 0 then 'PASS' else 'FAIL' end || E'
';
  exception when insufficient_privilege then
    -- since migration 28 the anonymous role has no table rights at all, which is stricter than seeing nothing
    res := res || 'B18 anonymous has no access to bills at all: PASS' || E'
';
  end;
  reset role;
  select count(*) into cnt from public.audit_log where entity = 'bills';
  select count(*) into nb from public.audit_log where entity = 'app_settings' and action = 'UPDATE';
  res := res || 'B19 audit rows for bills ' || cnt || ' (> 0) and for the switch ' || nb || ' (want 2): ' || case when cnt > 0 and nb = 2 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', coalesce(res, 'RES IS NULL');
end $$;
