-- Test 025: storage bins (racks) and bins_page (migration 35). Rolled back at the end.
do $$
declare v_admin uuid; v_wh uuid; v_bin uuid; v_bin2 uuid; v_item uuid; v_r jsonb; v_out text := ''; v_code text; v_n int;
begin
  select id into v_admin from public.profiles where is_admin and is_active limit 1;
  select id into v_wh from public.locations where code = 'DEMO-WH';
  select id into v_item from public.items where internal_item_code = 'DEMO-3RCA-1.5M';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.storage_bins (location_id, rack, level, bin_no, capacity) values (v_wh, 'A', '01', '01', 150) returning id, code into v_bin, v_code;
  v_out := v_out || case when v_code = 'DEMO-WH-A-01-01' then E'\nPASS code is made from place, rack, level, bin: ' || v_code else E'\nFAIL code ' || v_code end;
  begin insert into public.storage_bins (location_id, rack, level, bin_no) values (v_wh, 'A', '01', '01'); v_out := v_out || E'\nFAIL duplicate bin accepted';
  exception when unique_violation then v_out := v_out || E'\nPASS duplicate bin refused'; end;
  begin insert into public.storage_bins (location_id, rack, level, bin_no) values (v_wh, 'a b', '01', '02'); v_out := v_out || E'\nFAIL bad rack accepted';
  exception when check_violation then v_out := v_out || E'\nPASS bad rack refused'; end;
  begin insert into public.storage_bins (location_id, rack, level, bin_no, bin_type) values (v_wh, 'A', '01', '03', 'CRATE'); v_out := v_out || E'\nFAIL bad type accepted';
  exception when check_violation then v_out := v_out || E'\nPASS bad type refused'; end;
  insert into public.storage_bins (location_id, rack, level, bin_no, bin_type) values (v_wh, 'B', '01', '01', 'SHELF') returning id into v_bin2;

  v_r := public.bins_page(null, null, null, null, 50, 0);
  select count(*) into v_n from jsonb_array_elements(v_r->'rows') e where e->>'status' = 'available';
  v_out := v_out || case when v_n >= 2 and v_r->'kpi' ?& array['total','occupied','available','blocked','new_month'] then E'\nPASS new bins are Available, numbers present' else E'\nFAIL available ' || v_n end;

  -- assign a product with stock: the bin becomes Occupied and shows the warehouse stock of that product
  insert into public.item_bins (bin_id, location_id, item_id) values (v_bin, v_wh, v_item);
  v_r := public.bins_page('DEMO-WH-A-01-01', null, null, 'occupied', 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 1 and (v_r->'rows'->0->>'qty')::numeric > 0 and (v_r->'rows'->0->>'items')::int = 1 then E'\nPASS assigned product makes the bin Occupied with its stock' else E'\nFAIL occupied ' || v_r::text end;
  begin insert into public.item_bins (bin_id, location_id, item_id) values (v_bin2, v_wh, v_item); v_out := v_out || E'\nFAIL product in two bins of one place';
  exception when unique_violation then v_out := v_out || E'\nPASS a product sits in one bin per place'; end;
  begin insert into public.item_bins (bin_id, location_id, item_id) values (v_bin2, (select id from public.locations where code = 'DEMO-SHOP1'), v_item); v_out := v_out || E'\nFAIL bin of another place accepted';
  exception when foreign_key_violation then v_out := v_out || E'\nPASS a bin cannot be used for another place'; end;
  v_r := public.bins_page('3rca', null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 1 then E'\nPASS search by assigned product' else E'\nFAIL search by product' end;

  update public.storage_bins set is_blocked = true, block_reason = 'damaged' where id = v_bin;
  v_r := public.bins_page(null, v_wh, 'A', 'blocked', 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 1 then E'\nPASS blocked status and place and rack filters' else E'\nFAIL blocked' end;
  v_r := public.bins_page('%', null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 0 then E'\nPASS percent sign is text' else E'\nFAIL percent matched' end;
  begin perform public.bins_page(null, null, 'a b', null, 10, 0); v_out := v_out || E'\nFAIL bad rack filter';
  exception when others then v_out := v_out || E'\nPASS bad rack filter refused'; end;
  begin perform public.bins_page(null, null, null, 'bogus', 10, 0); v_out := v_out || E'\nFAIL bad status';
  exception when others then v_out := v_out || E'\nPASS bad status refused'; end;
  delete from public.item_bins where bin_id = v_bin;
  v_out := v_out || E'\nPASS assignment can be removed';
  -- there is no DELETE rule for bins, so a delete does nothing (the row stays)
  delete from public.storage_bins where id = v_bin;
  v_out := v_out || case when exists (select 1 from public.storage_bins where id = v_bin) then E'
PASS bins cannot be deleted' else E'
FAIL bin deleted' end;
  reset role;

  -- an account with no places sees nothing and cannot add bins
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.bins_page(null, null, null, null, 10, 0);
  v_out := v_out || case when (v_r->>'total')::int = 0 then E'\nPASS stranger sees no bins' else E'\nFAIL stranger sees bins' end;
  begin insert into public.storage_bins (location_id, rack, level, bin_no) values (v_wh, 'Z', '01', '01'); v_out := v_out || E'\nFAIL stranger added a bin';
  exception when others then v_out := v_out || E'\nPASS stranger cannot add a bin'; end;
  reset role;
  set local role anon;
  begin perform 1 from public.storage_bins limit 1; v_out := v_out || E'\nFAIL anon reads bins';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS anon cannot read bins'; end;
  begin perform public.bins_page(null, null, null, null, 10, 0); v_out := v_out || E'\nFAIL anon page';
  exception when insufficient_privilege then v_out := v_out || E'\nPASS anon denied the page function'; end;
  reset role;
  raise exception 'TEST 025 RESULT:%', v_out;
end $$;
