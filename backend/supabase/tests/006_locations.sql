-- Tests for locations (foundation + 20261025000006_location_guards.sql).
-- Ends with a deliberate exception (rollback). Every line should say PASS (L1 ... L17).
do $$
declare
  adm uuid := gen_random_uuid(); mg uuid := gen_random_uuid(); shopu uuid := gen_random_uuid(); nob uuid := gen_random_uuid();
  res text := ''; wh uuid; sh uuid; n int; ub uuid; cb uuid;
begin
  insert into auth.users (id, email) values (adm,'adm@t.local'),(mg,'mg@t.local'),(shopu,'shop@t.local'),(nob,'nob@t.local');
  update public.profiles set is_active = true where id in (adm, mg, shopu, nob);
  update public.profiles set is_admin = true where id = adm;
  insert into public.user_permissions (user_id, permission_key) values (mg,'locations.manage'),(shopu,'items.view'),(nob,'items.view');

  perform set_config('request.jwt.claims', json_build_object('sub',mg,'role','authenticated')::text, true);
  set local role authenticated;
  insert into public.locations (code, name, type, address) values ('WH-1','Main warehouse','WAREHOUSE','Addr 1') returning id, created_by into wh, cb;
  insert into public.locations (code, name, type) values ('SHOP-1','Shop one','SHOP') returning id into sh;
  res := res || 'L1 manager creates locations, created_by filled: ' || case when cb = mg then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.locations (code, name, type) values (' wh-1 ','dup','SHOP');
    res := res || 'L2 duplicate code: FAIL (allowed)' || E'\n';
  exception when unique_violation then res := res || 'L2 duplicate code (case/space) refused: PASS' || E'\n';
  end;
  begin
    insert into public.locations (code, name, type) values (repeat('x',21),'long','SHOP');
    res := res || 'L3 21-char code: FAIL (allowed)' || E'\n';
  exception when check_violation then res := res || 'L3 code longer than 20 refused: PASS' || E'\n';
  end;
  begin
    insert into public.locations (code, name, type) values ('B-1','  ','SHOP');
    res := res || 'L4 blank name: FAIL' || E'\n';
  exception when check_violation then res := res || 'L4 blank name refused: PASS' || E'\n';
  end;
  update public.locations set name = 'Main warehouse 2', updated_by = adm, created_by = adm where id = wh;
  select updated_by, created_by into ub, cb from public.locations where id = wh;
  res := res || 'L5 updated_by forced to caller, created_by kept: ' || case when ub = mg and cb = mg then 'PASS' else 'FAIL' end || E'\n';
  update public.locations set is_active = false where id = sh;
  get diagnostics n = row_count;
  res := res || 'L6 manager can archive, rows ' || n || ': ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  update public.locations set is_active = true where id = sh;
  select count(*) into n from public.locations;
  res := res || 'L7 manager sees all (' || n || ', want 2): ' || case when n=2 then 'PASS' else 'FAIL' end || E'\n';
  begin
    delete from public.locations where id = sh;
    get diagnostics n = row_count;
    res := res || 'L8 delete rows ' || n || ' (want 0): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  exception when others then res := res || 'L8 delete blocked: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  perform public.admin_set_user_locations(shopu, array[sh]);

  perform set_config('request.jwt.claims', json_build_object('sub',shopu,'role','authenticated')::text, true);
  select count(*) into n from public.locations;
  res := res || 'L9 shop user sees only the assigned location (' || n || ', want 1): ' || case when n=1 and exists (select 1 from public.locations where id = sh) then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into public.locations (code, name, type) values ('S-X','x','SHOP');
    res := res || 'L10 shop user creates a location: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'L10 shop user cannot create a location: PASS' || E'\n';
  end;
  update public.locations set name = 'hacked' where id = sh;
  get diagnostics n = row_count;
  res := res || 'L11 shop user edit rows ' || n || ' (want 0): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.user_locations;
  res := res || 'L12 shop user sees only own assignment rows (' || n || ', want 1): ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',nob,'role','authenticated')::text, true);
  select count(*) into n from public.locations;
  res := res || 'L13 unassigned user sees none (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  begin
    perform public.admin_set_user_locations(nob, array[wh]);
    res := res || 'L14 non-admin assigns locations: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'L14 non-admin cannot assign locations: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  select count(*) into n from public.locations;
  res := res || 'L15 admin sees all (' || n || ', want 2): ' || case when n=2 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from public.locations;
  res := res || 'L16 anonymous sees none (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;
  select count(*) into n from public.audit_log where entity = 'locations';
  res := res || 'L17 audit rows for locations (' || n || ' > 0): ' || case when n>0 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
