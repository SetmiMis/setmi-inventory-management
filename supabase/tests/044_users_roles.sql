-- Test 044: users and roles (migration 54). Rolled back at the end. Makes its own users, place, roles and invites.
do $$
declare
  adm uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); other uuid := gen_random_uuid(); newu uuid := gen_random_uuid();
  wh uuid; role_a uuid; role_b uuid; admin_role uuid; dept uuid; inv uuid; res text := ''; pg jsonb; r uuid;
begin
  insert into auth.users (id, email) values (adm,'adm@u.l'),(staff,'staff@u.l'),(other,'other@u.l');
  update public.profiles set is_active = true where id in (adm, staff, other);
  update public.profiles set is_admin = true where id = adm;
  insert into public.locations (code, name, type) values ('WHU', 'Warehouse UR', 'WAREHOUSE') returning id into wh;
  select id into admin_role from public.roles where is_system and grants_admin;

  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_save_role(null, 'Hacker role', null, array['items.view']); res := res || 'U1 staff makes a role: FAIL' || E'\n';
  exception when others then res := res || 'U1 a person who is not an administrator cannot make a role: PASS' || E'\n'; end;
  begin perform public.admin_invite_user('x@u.l', null, admin_role, null, null, null); res := res || 'U2 staff invites: FAIL' || E'\n';
  exception when others then res := res || 'U2 a person who is not an administrator cannot invite: PASS' || E'\n'; end;
  begin perform public.admin_apply_role(staff, admin_role); res := res || 'U3 staff makes himself admin: FAIL' || E'\n';
  exception when others then res := res || 'U3 a person cannot give himself the Admin role: PASS' || E'\n'; end;
  begin perform public.admin_users_page(); res := res || 'U4 staff opens the list: FAIL' || E'\n';
  exception when others then res := res || 'U4 a person who is not an administrator cannot open the user list: PASS' || E'\n'; end;
  begin perform public.admin_access_log(); res := res || 'U5 staff opens the log: FAIL' || E'\n';
  exception when others then res := res || 'U5 a person who is not an administrator cannot open the access log: PASS' || E'\n'; end;
  res := res || 'U6 staff sees no roles or invites: ' || case when (select count(*) from public.roles) = 0 and (select count(*) from public.user_invites) = 0 and (select count(*) from public.departments) = 0 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  role_a := public.admin_save_role(null, '  Test Role A ', 'for the test', array['items.view', 'stock.view', 'stock.view']);
  res := res || 'U7 a role is made with its permissions (duplicates dropped): ' || case when (select count(*) from public.role_permissions where role_id = role_a) = 2 and (select name from public.roles where id = role_a) = 'Test Role A' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_save_role(null, 'test role a', null, array[]::text[]); res := res || 'U8 same name: FAIL' || E'\n';
  exception when others then res := res || 'U8 a role name cannot be used twice (case does not matter): PASS' || E'\n'; end;
  begin perform public.admin_save_role(null, 'Bad Role', null, array['no.such.permission']); res := res || 'U9 unknown permission: FAIL' || E'\n';
  exception when others then res := res || 'U9 an unknown permission is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_role(null, 'x', null, array[]::text[]); res := res || 'U10 short name: FAIL' || E'\n';
  exception when others then res := res || 'U10 a too short role name is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_role(admin_role, 'Admin', null, array['items.view']); res := res || 'U11 change Admin role: FAIL' || E'\n';
  exception when others then res := res || 'U11 the Admin role cannot be changed: PASS' || E'\n'; end;
  begin perform public.admin_set_role_active(admin_role, false); res := res || 'U12 switch off Admin: FAIL' || E'\n';
  exception when others then res := res || 'U12 the Admin role cannot be switched off: PASS' || E'\n'; end;
  perform public.admin_save_role(role_a, 'Test Role A2', 'changed', array['items.view', 'stock.view', 'reports.view']);
  res := res || 'U13 a role can be changed (3 permissions, new name): ' || case when (select count(*) from public.role_permissions where role_id = role_a) = 3 and (select name from public.roles where id = role_a) = 'Test Role A2' then 'PASS' else 'FAIL' end || E'\n';
  role_b := public.admin_save_role(null, 'Test Role B', null, array['items.view']);
  dept := public.admin_save_department(null, 'Test Dept', true);
  begin perform public.admin_save_department(null, 'test dept'); res := res || 'U14 same department: FAIL' || E'\n';
  exception when others then res := res || 'U14 a department name cannot be used twice: PASS' || E'\n'; end;
  perform public.admin_save_department(dept, 'Test Dept 2', false);
  res := res || 'U15 a department can be renamed and switched off: ' || case when (select name from public.departments where id = dept) = 'Test Dept 2' and not (select is_active from public.departments where id = dept) then 'PASS' else 'FAIL' end || E'\n';
  perform public.admin_save_department(dept, 'Test Dept 2', true);

  -- give a role: the permissions are COPIED
  perform public.admin_set_user_permissions(other, array['bills.view']);
  perform public.admin_apply_role(other, role_a);
  res := res || 'U16 giving a role replaces the permissions with the role''s 3 and sets the label: ' || case when (select count(*) from public.user_permissions where user_id = other) = 3
    and not exists (select 1 from public.user_permissions where user_id = other and permission_key = 'bills.view') and (select role_id from public.profiles where id = other) = role_a and not (select is_admin from public.profiles where id = other) then 'PASS' else 'FAIL' end || E'\n';
  perform public.admin_save_role(role_a, 'Test Role A2', 'changed again', array['items.view']);
  res := res || 'U17 changing the role later does not change the person who has it (still 3): ' || case when (select count(*) from public.user_permissions where user_id = other) = 3 then 'PASS' else 'FAIL' end || E'\n';
  perform public.admin_apply_role(other, admin_role);
  res := res || 'U18 the Admin role makes the person an administrator: ' || case when (select is_admin from public.profiles where id = other) then 'PASS' else 'FAIL' end || E'\n';
  perform public.admin_apply_role(other, role_b);
  begin perform public.admin_apply_role(adm, role_b); res := res || 'U19 admin removes own admin: FAIL' || E'\n';
  exception when others then res := res || 'U19 an administrator cannot take his own admin right away: PASS' || E'\n'; end;
  perform public.admin_set_role_active(role_b, false);
  begin perform public.admin_apply_role(other, role_b); res := res || 'U20 role switched off: FAIL' || E'\n';
  exception when others then res := res || 'U20 a switched off role cannot be given: PASS' || E'\n'; end;
  perform public.admin_set_user_profile(other, ' New Name ', role_a, dept);
  res := res || 'U21 name, role label and department are saved (permissions untouched): ' || case when (select full_name from public.profiles where id = other) = 'New Name' and (select department_id from public.profiles where id = other) = dept
    and (select count(*) from public.user_permissions where user_id = other) = 1 then 'PASS' else 'FAIL' end || E'\n';

  -- invites
  inv := public.admin_invite_user('  New.Person@U.L ', 'Newbie', role_a, dept, null, array[wh]);
  res := res || 'U22 an invite is saved with the email in lower case and the permissions of the role: ' || case when (select email from public.user_invites where id = inv) = 'new.person@u.l' and (select array_length(permission_keys, 1) from public.user_invites where id = inv) = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_invite_user('NEW.person@u.l', null, role_a, null, null, null); res := res || 'U23 same invite twice: FAIL' || E'\n';
  exception when others then res := res || 'U23 the same email cannot be invited twice: PASS' || E'\n'; end;
  begin perform public.admin_invite_user('staff@u.l', null, role_a, null, null, null); res := res || 'U24 invite existing user: FAIL' || E'\n';
  exception when others then res := res || 'U24 an email that already has a login cannot be invited: PASS' || E'\n'; end;
  begin perform public.admin_invite_user('not-an-email', null, role_a, null, null, null); res := res || 'U25 bad email: FAIL' || E'\n';
  exception when others then res := res || 'U25 a bad email is refused: PASS' || E'\n'; end;
  begin perform public.admin_invite_user('z@u.l', null, role_a, null, array['no.such'], null); res := res || 'U26 unknown permission in invite: FAIL' || E'\n';
  exception when others then res := res || 'U26 an unknown permission in an invite is refused: PASS' || E'\n'; end;
  pg := public.admin_users_page(null, null, null, 'INVITED', 10, 0);
  res := res || 'U27 the list shows the invite as Invited: ' || case when (pg->>'total')::int = 1 and pg->'rows'->0->>'status' = 'INVITED' and pg->'rows'->0->>'kind' = 'INVITE' and pg->'rows'->0->>'role_name' = 'Test Role A2' then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  -- first sign-in of the invited person (what the Supabase login does)
  insert into auth.users (id, email) values (newu, 'New.Person@U.L');
  res := res || 'U28 first sign-in: the person is active with role, department, permission and place: ' || case when (select is_active from public.profiles where id = newu) and (select role_id from public.profiles where id = newu) = role_a
    and (select department_id from public.profiles where id = newu) = dept and exists (select 1 from public.user_permissions where user_id = newu and permission_key = 'items.view')
    and exists (select 1 from public.user_locations where user_id = newu and location_id = wh) and (select full_name from public.profiles where id = newu) = 'Newbie' and not (select is_admin from public.profiles where id = newu) then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'U29 the invite is marked as used: ' || case when (select used_at from public.user_invites where id = inv) is not null then 'PASS' else 'FAIL' end || E'\n';
  insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@u.l');
  res := res || 'U30 a sign-in that was NOT invited stays inactive with nothing: ' || case when (select not is_active from public.profiles where email = 'stranger@u.l') and not exists (select 1 from public.user_permissions up join public.profiles p on p.id = up.user_id where p.email = 'stranger@u.l') then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  inv := public.admin_invite_user('cancel.me@u.l', null, role_a, null, null, null);
  perform public.admin_cancel_invite(inv);
  res := res || 'U31 an invite can be cancelled: ' || case when not exists (select 1 from public.user_invites where id = inv) then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_cancel_invite(gen_random_uuid()); res := res || 'U32 cancel unknown: FAIL' || E'\n';
  exception when others then res := res || 'U32 cancelling an unknown invite is refused: PASS' || E'\n'; end;
  pg := public.admin_users_page('New', role_a, null, null, 10, 0);
  res := res || 'U33 search and role filter find the new person, with the counts: ' || case when (pg->>'total')::int >= 1 and (pg->'kpi'->>'roles')::int >= 6 and (pg->'kpi'->>'departments')::int >= 6 and jsonb_array_length(pg->'roles') >= 7 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_users_page(null, null, null, 'NOPE'); res := res || 'U34 bad status: FAIL' || E'\n';
  exception when others then res := res || 'U34 an unknown status filter is refused: PASS' || E'\n'; end;
  pg := public.admin_access_log(50, 0);
  res := res || 'U35 the access log lists the changes with who did them: ' || case when (pg->>'total')::int >= 5 and exists (select 1 from jsonb_array_elements(pg->'rows') e where e->>'action' in ('SAVE_ROLE', 'APPLY_ROLE')) and exists (select 1 from jsonb_array_elements(pg->'rows') e where e->>'actor_name' is not null) then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'U36 the starting roles exist: Admin plus 5, each with permissions except Admin: ' || case when (select count(*) from public.roles) >= 7 and (select count(*) from public.roles r where not r.is_system and r.name in ('Operations Manager', 'Sales Executive', 'Warehouse Staff', 'Purchase Executive', 'Accountant')
    and exists (select 1 from public.role_permissions rp where rp.role_id = r.id)) = 5 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  raise exception E'USERS AND ROLES TEST RESULT\n%', res;
end $$;
