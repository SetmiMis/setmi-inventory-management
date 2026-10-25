-- Test 019: dashboard_extra (migration 29). Rolled back at the end; prints result lines.
-- Checks: an admin gets all sections, a stranger gets nothing, anonymous is denied.
do $$
declare v_admin uuid; v_r jsonb; v_out text := ''; v_stranger jsonb;
begin
  select id into v_admin from public.profiles where is_admin and is_active limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.dashboard_extra(null);
  v_out := v_out || case when v_r ?& array['catalog','stock_value','status','by_category','moves_by_day','po','grn_recent','transfer_status'] then E'\nPASS admin gets all 8 sections' else E'\nFAIL a section is missing' end;
  v_out := v_out || case when jsonb_array_length(v_r->'moves_by_day') = 30 then E'\nPASS 30 days of movement' else E'\nFAIL movement days' end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_stranger := public.dashboard_extra(null);
  v_out := v_out || case when v_stranger = '{}'::jsonb then E'\nPASS stranger gets nothing' else E'\nFAIL stranger got data' end;
  reset role;
  set local role anon;
  begin perform public.dashboard_extra(null); v_out := v_out || E'\nFAIL anon can call';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS anon denied'; end;
  reset role;
  raise exception 'TEST 019 RESULT:%', v_out;
end $$;
