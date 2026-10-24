-- Tests for the stock_overview view (20261025000008). Ends with a deliberate exception (rollback).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  wh uuid; sh uuid; pc uuid; res text := ''; n int; low boolean; qty numeric;
begin
  insert into auth.users (id, email) values (a,'a@t.l'),(b,'b@t.l'),(c,'c@t.l');
  update public.profiles set is_active = true where id in (a,b,c);
  insert into public.user_permissions (user_id, permission_key) values (a,'items.view'),(a,'stock.view'),(b,'items.view'),(c,'items.view'),(c,'stock.view');
  insert into public.locations (code, name, type) values ('WH','W','WAREHOUSE') returning id into wh;
  insert into public.locations (code, name, type) values ('SH','S','SHOP') returning id into sh;
  insert into public.user_locations values (a, wh), (b, wh), (c, sh);
  insert into public.items (internal_item_code, item_name, selling_item_name, purchase_source) values ('V-1','v','v','LOCAL') returning id into pc;
  insert into public.stock_movements (item_id, to_location_id, quantity, movement_type) values (pc, wh, 3, 'OPENING');
  insert into public.reorder_levels (item_id, location_id, min_qty) values (pc, wh, 5);

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.stock_overview;
  select is_low, quantity into low, qty from public.stock_overview where location_id = wh;
  res := res || 'V1 user with stock.view sees their place only (' || n || ' row), qty ' || qty || ', low flag ' || low || ': ' || case when n=1 and low and qty=3 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  select count(*) into n from public.stock_overview;
  res := res || 'V2 user without stock.view gets no rows (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
  select count(*) into n from public.stock_overview where location_id = wh;
  res := res || 'V3 shop user never sees the warehouse row (' || n || '): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    select count(*) into n from public.stock_overview;
    res := res || 'V4 anonymous view access: FAIL (allowed, ' || n || ')' || E'\n';
  exception when others then res := res || 'V4 anonymous cannot read the view: PASS' || E'\n';
  end;
  reset role;
  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
