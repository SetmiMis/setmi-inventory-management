-- Test 023: suppliers_page and the new supplier columns (migration 33). Rolled back at the end.
do $$
declare v_admin uuid; v_r jsonb; v_out text := ''; v_code text;
begin
  select id into v_admin from public.profiles where is_admin and is_active limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.suppliers (name, supplier_type, country, city, website, payment_terms) values ('TEST SUP ONE', 'IMPORT', 'China', 'Shenzhen', 'www.example.cn', '30 Days') returning code into v_code;
  insert into public.suppliers (name, supplier_type, country, city) values ('TEST SUP TWO', 'LOCAL', 'India', 'Delhi');
  v_out := v_out || case when v_code ~ '^SUP-[0-9]{3,}$' then E'\nPASS code is made automatically: ' || v_code else E'\nFAIL code ' || coalesce(v_code, 'null') end;
  begin insert into public.suppliers (name, supplier_type, currency) values ('TEST SUP THREE', 'LOCAL', 'rupee'); v_out := v_out || E'\nFAIL bad currency accepted';
  exception when check_violation then v_out := v_out || E'\nPASS bad currency refused'; end;

  v_r := public.suppliers_page(null, null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int >= 2 and v_r->'kpi' ?& array['total','active','inactive','with_orders','import','new_month'] then E'\nPASS rows and numbers' else E'\nFAIL rows or numbers' end;
  v_out := v_out || case when v_r->'countries' @> '["China","India"]'::jsonb then E'\nPASS countries listed' else E'\nFAIL countries' end;
  v_r := public.suppliers_page('shenzhen', 'IMPORT', 'active', 'China', 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 1 then E'\nPASS filters together' else E'\nFAIL filters' end;
  v_r := public.suppliers_page('%', null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 0 then E'\nPASS percent sign is text' else E'\nFAIL percent matched' end;
  begin perform public.suppliers_page(null, 'ALIEN', null, null, 10, 0); v_out := v_out || E'\nFAIL bad type';
  exception when others then v_out := v_out || E'\nPASS bad type refused'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.suppliers_page(null, null, null, null, 10, 0); v_out := v_out || E'\nFAIL stranger got data';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS stranger refused'; end;
  reset role;
  set local role anon;
  begin perform public.suppliers_page(null, null, null, null, 10, 0); v_out := v_out || E'\nFAIL anon';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS anon denied'; end;
  reset role;
  raise exception 'TEST 023 RESULT:%', v_out;
end $$;
