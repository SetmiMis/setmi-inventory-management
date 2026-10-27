-- Test 045: company settings and the audit viewer (migration 55). Rolled back at the end.
do $$
declare adm uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); res text := ''; pg jsonb; c jsonb;
begin
  insert into auth.users (id, email) values (adm,'adm@c.l'),(staff,'staff@c.l');
  update public.profiles set is_active = true where id in (adm, staff);
  update public.profiles set is_admin = true where id = adm;

  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  set local role authenticated;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Hack Co')); res := res || 'C1 staff saves: FAIL' || E'\n';
  exception when others then res := res || 'C1 a person who is not an administrator cannot save the company information: PASS' || E'\n'; end;
  begin insert into public.app_settings (key, value) values ('company.name', to_jsonb('Hack'::text)); res := res || 'C2 direct insert: FAIL' || E'\n';
  exception when others then res := res || 'C2 no direct writes to the settings table: PASS' || E'\n'; end;
  begin perform public.admin_audit_page(); res := res || 'C3 staff opens the audit viewer: FAIL' || E'\n';
  exception when others then res := res || 'C3 a person who is not an administrator cannot open the audit viewer: PASS' || E'\n'; end;
  c := public.company_info();
  res := res || 'C4 anybody signed in can read the company information (for the printed papers): ' || case when c->>'name' is not null then 'PASS' else 'FAIL' end || E'\n';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  set local role authenticated;
  perform public.admin_save_company(jsonb_build_object('name', ' Test Company ', 'tagline', 'Tag', 'gst', '07abcde1234f1z5', 'pan', 'abcde1234f', 'address', 'A-12, Delhi', 'phone', '+91 98765 43210', 'email', 'info@test.org', 'website', 'https://test.org'));
  c := public.company_info();
  res := res || 'C5 the company information is saved (trimmed, GST and PAN in capitals): ' || case when c->>'name' = 'Test Company' and c->>'gst' = '07ABCDE1234F1Z5' and c->>'pan' = 'ABCDE1234F' and c->>'website' = 'https://test.org' and c->>'phone' = '+91 98765 43210' then 'PASS' else 'FAIL' end || E'\n';
  perform public.admin_save_company(jsonb_build_object('name', 'Test Company'));
  c := public.company_info();
  res := res || 'C6 leaving optional fields empty clears them: ' || case when c->>'gst' = '' and c->>'address' = '' then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_save_company(jsonb_build_object('name', 'x')); res := res || 'C7 short name: FAIL' || E'\n';
  exception when others then res := res || 'C7 a too short company name is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Test Company', 'gst', '12345')); res := res || 'C8 bad GST: FAIL' || E'\n';
  exception when others then res := res || 'C8 a bad GST number is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Test Company', 'pan', 'ABC')); res := res || 'C9 bad PAN: FAIL' || E'\n';
  exception when others then res := res || 'C9 a bad PAN is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Test Company', 'email', 'nope')); res := res || 'C10 bad email: FAIL' || E'\n';
  exception when others then res := res || 'C10 a bad e-mail address is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Test Company', 'website', 'ftp://x')); res := res || 'C11 bad website: FAIL' || E'\n';
  exception when others then res := res || 'C11 a website that does not start with http is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Test Company', 'phone', 'call me')); res := res || 'C12 bad phone: FAIL' || E'\n';
  exception when others then res := res || 'C12 a bad phone number is refused: PASS' || E'\n'; end;
  begin perform public.admin_save_company(jsonb_build_object('name', 'Test Company', 'address', repeat('x', 301))); res := res || 'C13 long address: FAIL' || E'\n';
  exception when others then res := res || 'C13 a too long address is refused: PASS' || E'\n'; end;
  res := res || 'C14 the billing switch still works next to the company keys: ' || case when public.billing_enabled() is not null then 'PASS' else 'FAIL' end || E'\n';
  pg := public.admin_audit_page(null, 'app_settings', null, null, 10, 0);
  res := res || 'C15 the audit viewer lists the settings changes with who did them: ' || case when (pg->>'total')::int >= 1 and exists (select 1 from jsonb_array_elements(pg->'rows') e where e->>'actor_name' is not null) and jsonb_array_length(pg->'entities') >= 1 then 'PASS' else 'FAIL' end || E'\n';
  pg := public.admin_audit_page('app_settings', 'all', current_date + 1, current_date + 2, 10, 0);
  res := res || 'C16 the date filter works (nothing in the future): ' || case when (pg->>'total')::int = 0 then 'PASS' else 'FAIL' end || E'\n';
  begin perform public.admin_audit_page(null, 'bad entity!'); res := res || 'C17 bad entity filter: FAIL' || E'\n';
  exception when others then res := res || 'C17 an unknown entity filter is refused: PASS' || E'\n'; end;
  reset role;

  raise exception E'COMPANY SETTINGS TEST RESULT\n%', res;
end $$;
