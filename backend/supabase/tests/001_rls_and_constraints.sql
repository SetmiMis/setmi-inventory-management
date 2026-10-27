-- Permission + constraint tests for foundation and item_master migrations.
-- HOW TO RUN: paste in the Supabase SQL editor (or execute_sql). It creates test users,
-- tests as different roles, then ALWAYS ends with an exception so everything is rolled back.
-- The "error" at the end is the report. Every line should say PASS.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  res text := '';
  n int; item1 uuid;
begin
  insert into auth.users (id, email) values
    (u1,'t1@test.local'),(u2,'t2@test.local'),(u3,'t3@test.local'),(u4,'t4@test.local');
  res := res || 'T0 new profiles active: ' || (select count(*) from public.profiles where is_active) || ' of ' || (select count(*) from public.profiles) || ' (want 0 active) ' || E'\n';
  update public.profiles set is_active = true, is_admin = true where id = u1;          -- u1 admin
  update public.profiles set is_active = true where id in (u2, u3);                    -- u2 none, u3 some
  insert into public.user_permissions (user_id, permission_key) values
    (u3,'items.view'),(u3,'items.create'),(u3,'items.edit');

  perform set_config('request.jwt.claims', json_build_object('sub',u1,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source)
    values ('ABC-1','Cable A','Cable A bill','LOCAL') returning id into item1;
  res := res || 'T1 admin insert item: PASS' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',u2,'role','authenticated')::text, true);
  select count(*) into n from public.items;
  res := res || 'T2 no-permission user sees items: ' || n || ' (want 0) ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('X1','x','x','LOCAL');
    res := res || 'T3 no-permission insert: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'T3 no-permission insert denied: PASS' || E'\n';
  end;
  begin
    perform public.admin_set_user_permissions(u2, array['items.view']);
    res := res || 'T4 non-admin calls admin fn: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'T4 non-admin calls admin fn denied: PASS' || E'\n';
  end;
  update public.profiles set is_admin = true where id = u2;
  get diagnostics n = row_count;
  res := res || 'T5 user self-promote rows updated: ' || n || ' (want 0) ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.audit_log;
  res := res || 'T6 no-permission user reads audit_log rows: ' || n || ' (want 0) ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',u3,'role','authenticated')::text, true);
  select count(*) into n from public.items;
  res := res || 'T7 permitted user sees items: ' || n || ' (want 1) ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  update public.items set remarks = 'ok' where id = item1;
  get diagnostics n = row_count;
  res := res || 'T8 edit remarks rows: ' || n || ' (want 1) ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  begin
    update public.items set selling_item_name = 'changed' where id = item1;
    res := res || 'T9 change selling name without permission: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'T9 selling name change denied: PASS' || E'\n';
  end;
  begin
    update public.items set is_active = false where id = item1;
    res := res || 'T10 archive without permission: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'T10 archive denied: PASS' || E'\n';
  end;
  delete from public.items where id = item1;
  get diagnostics n = row_count;
  res := res || 'T11 delete item rows: ' || n || ' (want 0) ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values (' abc-1 ','d','d','LOCAL');
    res := res || 'T12 duplicate code (case/space): FAIL (allowed)' || E'\n';
  exception when unique_violation then res := res || 'T12 duplicate internal code denied: PASS' || E'\n';
  end;
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, import_item_code) values ('I-1','a','a','IMPORT','IMP-1');
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('I-2','b','b','LOCAL');
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('I-3','c','c','LOCAL');
  res := res || 'T13 several items without import code: PASS' || E'\n';
  begin
    insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, import_item_code) values ('I-4','d','d','IMPORT','imp-1');
    res := res || 'T14 duplicate import code: FAIL (allowed)' || E'\n';
  exception when unique_violation then res := res || 'T14 duplicate import code denied: PASS' || E'\n';
  end;
  begin
    insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('I-5','  ','e','LOCAL');
    res := res || 'T15 blank item_name: FAIL (allowed)' || E'\n';
  exception when check_violation then res := res || 'T15 blank item_name denied: PASS' || E'\n';
  end;
  begin
    insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source, image_paths) values ('I-6','f','f','LOCAL', array['1','2','3','4','5']);
    res := res || 'T16 5 images: FAIL (allowed)' || E'\n';
  exception when check_violation then res := res || 'T16 more than 4 images denied: PASS' || E'\n';
  end;
  insert into public.item_barcodes (item_id, barcode) values (item1, '8901234567890');
  begin
    insert into public.item_barcodes (item_id, barcode) select id, '8901234567890' from public.items where internal_item_code = 'I-2';
    res := res || 'T17 same barcode on 2 items: FAIL (allowed)' || E'\n';
  exception when unique_violation then res := res || 'T17 barcode reuse on another item denied: PASS' || E'\n';
  end;

  reset role;
  insert into public.user_permissions (user_id, permission_key) values (u4,'items.view');
  perform set_config('request.jwt.claims', json_build_object('sub',u4,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.items;
  res := res || 'T18 inactive user (has permission) sees items: ' || n || ' (want 0) ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    select count(*) into n from public.items;
    res := res || 'T19 anon sees items: ' || n || ' (want 0) ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  exception when others then res := res || 'T19 anon denied: PASS' || E'\n';
  end;
  reset role;
  select count(*) into n from public.audit_log where entity = 'items';
  res := res || 'T20 audit rows for items: ' || n || ' (want >0) ' || case when n>0 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
