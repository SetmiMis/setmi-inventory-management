-- Tests for 20261024000003_item_guards.sql. Same method as 001: ends with a deliberate
-- exception so everything is rolled back. Every line should say PASS.
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  res text := ''; n int; item1 uuid; cb uuid; ub uuid;
begin
  insert into auth.users (id, email) values (a,'a@test.local'),(b,'b@test.local'),(c,'c@test.local');
  update public.profiles set is_active = true where id in (a, b, c);
  -- a: creator (view/create/edit). b: archive-only. c: other editor.
  insert into public.user_permissions (user_id, permission_key) values
    (a,'items.view'),(a,'items.create'),(a,'items.edit'),
    (b,'items.view'),(b,'items.archive'),
    (c,'items.view'),(c,'items.edit');

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  -- created_by supplied by the client is ignored? Try to fake it: it must be accepted as given
  -- only if it equals the caller, otherwise default fills. We test the default fill here.
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source)
    values ('G-1','n','s','LOCAL') returning id, created_by into item1, cb;
  res := res || 'G1 created_by filled with caller: ' || case when cb = a then 'PASS' else 'FAIL' end || E'\n';

  -- c edits: updated_by must be c, even if c tries to write someone else.
  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  update public.items set remarks = 'x', updated_by = a, created_by = c where id = item1;
  select updated_by, created_by into ub, cb from public.items where id = item1;
  res := res || 'G2 updated_by forced to caller: ' || case when ub = c then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'G3 created_by cannot be rewritten: ' || case when cb = a then 'PASS' else 'FAIL' end || E'\n';

  -- b (archive-only)
  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  begin
    update public.items set remarks = 'hacked' where id = item1;
    res := res || 'G4 archive-only user edits remarks: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'G4 archive-only user cannot edit fields: PASS' || E'\n';
  end;
  update public.items set is_active = false where id = item1;
  get diagnostics n = row_count;
  res := res || 'G5 archive-only user can archive, rows: ' || n || ' ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  update public.items set is_active = true where id = item1;
  get diagnostics n = row_count;
  res := res || 'G6 archive-only user can restore, rows: ' || n || ' ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';

  -- barcode created_by
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  insert into public.item_barcodes (item_id, barcode) values (item1, 'BC-1') returning created_by into cb;
  res := res || 'G7 barcode created_by filled: ' || case when cb = a then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
