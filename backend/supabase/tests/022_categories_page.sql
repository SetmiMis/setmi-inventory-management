-- Test 022: categories_page and the new code/description columns (migration 32). Rolled back at the end.
do $$
declare v_admin uuid; v_r jsonb; v_out text := ''; v_cat uuid;
begin
  select id into v_admin from public.profiles where is_admin and is_active limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_r := public.categories_page(null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int >= 1 and v_r->'kpi' ?& array['total','active','inactive','products','new_categories','new_products'] then E'\nPASS admin gets rows and the numbers' else E'\nFAIL rows or numbers' end;
  v_out := v_out || case when (v_r->'rows'->0) ? 'products' and (v_r->'rows'->0) ? 'image' then E'\nPASS rows carry product count and picture' else E'\nFAIL row shape' end;

  -- code and description can be saved; a code must look right and be unique
  insert into public.categories (name, code, description) values ('TEST CAT ONE', 'TC1', 'first') returning id into v_cat;
  begin insert into public.categories (name, code) values ('TEST CAT TWO', 'TC1'); v_out := v_out || E'\nFAIL duplicate code accepted';
  exception when unique_violation then v_out := v_out || E'\nPASS duplicate code refused'; end;
  begin insert into public.categories (name, code) values ('TEST CAT THREE', 'bad code!'); v_out := v_out || E'\nFAIL bad code accepted';
  exception when check_violation then v_out := v_out || E'\nPASS bad code refused'; end;
  begin insert into public.categories (name, description) values ('TEST CAT FOUR', repeat('x', 301)); v_out := v_out || E'\nFAIL long description accepted';
  exception when check_violation then v_out := v_out || E'\nPASS long description refused'; end;

  v_r := public.categories_page('tc1', 'active', 'products', 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 1 then E'\nPASS search by code' else E'\nFAIL search by code' end;
  v_r := public.categories_page('%', null, null, 100, 0);
  v_out := v_out || case when (v_r->>'total')::int = 0 then E'\nPASS percent sign is text' else E'\nFAIL percent matched' end;
  begin perform public.categories_page(null, 'bogus', null, 10, 0); v_out := v_out || E'\nFAIL bad status';
  exception when others then v_out := v_out || E'\nPASS bad status refused'; end;
  begin perform public.categories_page(null, null, 'drop', 10, 0); v_out := v_out || E'\nFAIL bad sort';
  exception when others then v_out := v_out || E'\nPASS bad sort refused'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.categories_page(null, null, null, 10, 0); v_out := v_out || E'\nFAIL stranger got data';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS stranger refused'; end;
  reset role;
  set local role anon;
  begin perform public.categories_page(null, null, null, 10, 0); v_out := v_out || E'\nFAIL anon';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS anon denied'; end;
  reset role;
  raise exception 'TEST 022 RESULT:%', v_out;
end $$;
