-- Test 024: locations_page and the new place columns (migration 34). Rolled back at the end.
-- Checks: admin gets rows and numbers (the hidden in-transit place is left out), capacity and utilization,
-- filters, bad filters refused, a place with no access is invisible, anonymous denied.
do $$
declare v_admin uuid; v_r jsonb; v_out text := ''; v_loc uuid; v_other uuid;
begin
  select id into v_admin from public.profiles where is_admin and is_active limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_r := public.locations_page(null, null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int >= 1 and v_r->'kpi' ?& array['total','warehouses','shops','active','capacity','products','avg_utilization','new_month'] then E'\nPASS rows and numbers' else E'\nFAIL rows or numbers' end;
  v_out := v_out || case when not exists (select 1 from jsonb_array_elements(v_r->'rows') e where e->>'type' = 'TRANSIT') then E'\nPASS in-transit place is left out' else E'\nFAIL transit shown' end;

  insert into public.locations (code, name, type, city, capacity, contact_person, phone) values ('TST-WH', 'TEST WAREHOUSE', 'WAREHOUSE', 'Testville', 10, 'Tester', '123') returning id into v_loc;
  v_r := public.locations_page('testville', 'WAREHOUSE', 'active', 'Testville', 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 1 and (v_r->'rows'->0->>'utilization')::int = 0 then E'\nPASS filters, capacity and 0% use' else E'\nFAIL filters ' || v_r::text end;
  begin insert into public.locations (code, name, type, capacity) values ('TST-2', 'TEST TWO', 'SHOP', -5); v_out := v_out || E'\nFAIL negative capacity accepted';
  exception when check_violation then v_out := v_out || E'\nPASS negative capacity refused'; end;
  v_r := public.locations_page('%', null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 0 then E'\nPASS percent sign is text' else E'\nFAIL percent matched' end;
  begin perform public.locations_page(null, 'TRANSIT', null, null, 10, 0); v_out := v_out || E'\nFAIL transit type accepted';
  exception when others then v_out := v_out || E'\nPASS transit type refused'; end;
  begin perform public.locations_page(null, null, 'bogus', null, 10, 0); v_out := v_out || E'\nFAIL bad status';
  exception when others then v_out := v_out || E'\nPASS bad status refused'; end;
  reset role;

  -- a signed-in account with no places sees none
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.locations_page(null, null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 0 then E'\nPASS stranger sees no places' else E'\nFAIL stranger sees places' end;
  reset role;
  set local role anon;
  begin perform public.locations_page(null, null, null, null, 10, 0); v_out := v_out || E'\nFAIL anon';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS anon denied'; end;
  reset role;
  raise exception 'TEST 024 RESULT:%', v_out;
end $$;
