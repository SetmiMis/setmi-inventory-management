-- Test 047: the menu step (migration 60). Rolled back at the end.
do $$
declare adm uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); res text := ''; s int;
begin
  insert into auth.users (id, email) values (adm,'adm47@c.l'),(staff,'staff47@c.l');
  update public.profiles set is_active = true where id in (adm, staff);
  update public.profiles set is_admin = true where id = adm;

  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  s := public.menu_step();
  res := res || 'M1 anybody signed in reads the step, default 4 (everything): ' || case when s = 4 then 'PASS' else 'FAIL ' || s end || E'\n';
  begin perform public.admin_set_menu_step(1); res := res || 'M2 staff sets the step: FAIL' || E'\n';
  exception when others then res := res || 'M2 a person who is not an administrator cannot set the step: PASS' || E'\n'; end;
  begin insert into public.app_settings (key, value) values ('menu_step', to_jsonb(1)) on conflict (key) do update set value = excluded.value;
    res := res || 'M3 direct write: FAIL' || E'\n';
  exception when others then res := res || 'M3 no direct writes to the settings table: PASS' || E'\n'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.admin_set_menu_step(1);
  res := res || 'M4 the administrator sets step 1: ' || case when public.menu_step() = 1 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_set_menu_step(5); res := res || 'M5 step 5: FAIL' || E'\n';
  exception when others then res := res || 'M5 a step outside 1 to 4 is refused: PASS' || E'\n'; end;
  begin perform public.admin_set_menu_step(null); res := res || 'M6 empty step: FAIL' || E'\n';
  exception when others then res := res || 'M6 an empty step is refused: PASS' || E'\n'; end;
  res := res || 'M7 the step is still 1 after the refused values: ' || case when public.menu_step() = 1 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  res := res || 'M8 staff now reads step 1: ' || case when public.menu_step() = 1 then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  set local role anon;
  begin perform public.menu_step(); res := res || 'M9 anonymous reads the step: FAIL' || E'\n';
  exception when others then res := res || 'M9 anonymous cannot read the step: PASS' || E'\n'; end;
  reset role;

  raise exception E'MENU STEP TEST RESULT\n%', res;
end $$;
