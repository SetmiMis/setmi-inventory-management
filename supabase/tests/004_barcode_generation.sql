-- Tests for 20261024000004_barcode_generation.sql. Ends with a deliberate exception (rollback).
-- Known real EAN-13 numbers used for the check digit: 4006381333931 and 5901234123457.
do $$
declare
  ed uuid := gen_random_uuid(); vw uuid := gen_random_uuid();
  res text := ''; i1 uuid; i2 uuid; b1 text; b1b text; b2 text; n int; gen boolean;
begin
  insert into auth.users (id, email) values (ed,'ed@test.local'),(vw,'vw@test.local');
  update public.profiles set is_active = true where id in (ed, vw);
  insert into public.user_permissions (user_id, permission_key) values
    (ed,'items.view'),(ed,'items.create'),(ed,'items.edit'),(vw,'items.view');

  res := res || 'B0 check digit 400638133393 -> ' || public.ean13_check_digit('400638133393') || ' (want 1): ' || case when public.ean13_check_digit('400638133393')=1 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'B0b check digit 590123412345 -> ' || public.ean13_check_digit('590123412345') || ' (want 7): ' || case when public.ean13_check_digit('590123412345')=7 then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.ean13_check_digit('12AB');
    res := res || 'B0c bad input accepted: FAIL' || E'\n';
  exception when others then res := res || 'B0c bad input refused: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',ed,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('B-1','a','a','LOCAL') returning id into i1;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('B-2','b','b','LOCAL') returning id into i2;

  b1 := public.generate_item_barcode(i1);
  res := res || 'B1 generated ' || b1 || ' (13 digits, starts with 2): ' || case when b1 ~ '^2[0-9]{12}$' then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'B2 check digit valid: ' || case when right(b1,1)::int = public.ean13_check_digit(left(b1,12)) then 'PASS' else 'FAIL' end || E'\n';
  b1b := public.generate_item_barcode(i1);
  res := res || 'B3 second call returns the same barcode: ' || case when b1 = b1b then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.item_barcodes where item_id = i1 and is_generated;
  res := res || 'B4 only one generated row for the item (' || n || '): ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  b2 := public.generate_item_barcode(i2);
  res := res || 'B5 second item gets a different barcode: ' || case when b2 <> b1 then 'PASS' else 'FAIL' end || E'\n';
  select is_generated into gen from public.item_barcodes where barcode = b1;
  res := res || 'B6 flagged is_generated: ' || case when gen then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.item_barcodes (item_id, barcode) values (i2, b1);
    res := res || 'B7 same barcode on another item: FAIL (allowed)' || E'\n';
  exception when unique_violation then res := res || 'B7 generated barcode cannot be reused on another item: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',vw,'role','authenticated')::text, true);
  begin
    perform public.generate_item_barcode(i1);
    res := res || 'B8 viewer generates: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'B8 viewer cannot generate: PASS' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform public.generate_item_barcode(i1);
    res := res || 'B9 anonymous generates: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'B9 anonymous cannot call it: PASS' || E'\n';
  end;
  reset role;

  select count(*) into n from public.audit_log where action = 'GENERATE_BARCODE';
  res := res || 'B10 audit rows for generation (' || n || ', want 2): ' || case when n=2 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
