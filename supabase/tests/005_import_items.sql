-- Tests for 20261024000005_import_items.sql. Ends with a deliberate exception (rollback).
-- Every line should say PASS. Expected: 16 lines (I1, I1b, I2 ... I16).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  res text := ''; r jsonb; n0 int; n int; rows jsonb; cat1 uuid; errrows int[]; catid uuid; sell text; bcn int; gen int;
begin
  insert into auth.users (id, email) values (a,'a@t.local'),(b,'b@t.local'),(c,'c@t.local');
  update public.profiles set is_active = true where id in (a,b,c);
  insert into public.user_permissions (user_id, permission_key) values
    (a,'items.view'),(a,'items.import'),(a,'categories.manage'),
    (b,'items.view'),(b,'items.import'),
    (c,'items.view');
  insert into public.categories (name) values ('Cables') returning id into cat1;
  insert into public.items (internal_item_code, import_item_code, item_name, selling_item_name, purchase_source, category_id)
    values ('EXIST-1','IMP-X','e','e','LOCAL',cat1);
  insert into public.item_barcodes (item_id, barcode) select id, 'BC-EXIST' from public.items where internal_item_code='EXIST-1';
  select count(*) into n0 from public.items;

  rows := jsonb_build_array(
    jsonb_build_object('row',1,'internal_item_code','N-1','item_name','n1','purchase_source','import','category','cables','barcodes',jsonb_build_array('111')),
    jsonb_build_object('row',2,'internal_item_code','N-2','item_name','n2','purchase_source','LOCAL','category','Horns'),
    jsonb_build_object('row',3,'internal_item_code',' exist-1 ','item_name','x','purchase_source','LOCAL'),
    jsonb_build_object('row',4,'internal_item_code','n-1','item_name','x','purchase_source','LOCAL'),
    jsonb_build_object('row',5,'internal_item_code','N-5','item_name','x','purchase_source','ABROAD'),
    jsonb_build_object('row',6,'internal_item_code','N-6','item_name','x','purchase_source','LOCAL','barcodes',jsonb_build_array('BC-EXIST')),
    jsonb_build_object('row',7,'internal_item_code','N-7','item_name','x','purchase_source','LOCAL','barcodes',jsonb_build_array('111')),
    jsonb_build_object('row',8,'internal_item_code','N-8','item_name','  ','purchase_source','LOCAL'),
    jsonb_build_object('row',9,'internal_item_code','N-9','item_name','x','purchase_source','LOCAL','import_item_code','imp-x'),
    jsonb_build_object('row',10,'internal_item_code','N-3','item_name','n3','selling_item_name','Bill name','purchase_source','LOCAL'));

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  set local role authenticated;

  r := public.import_items(rows, true, false, false);
  select array_agg(distinct (e->>'row')::int order by (e->>'row')::int) into errrows from jsonb_array_elements(r->'errors') e;
  res := res || 'I1 dry run: valid=' || (r->>'valid') || ' (want 3), error rows=' || errrows::text || ' (want {3,4,5,6,7,8,9}): ' ||
    case when (r->>'valid')::int=3 and errrows = array[3,4,5,6,7,8,9] then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'I1b new category listed: ' || (r->'new_categories')::text || ' (want ["Horns"]): ' || case when r->'new_categories' = '["Horns"]'::jsonb then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.items;
  res := res || 'I2 dry run wrote nothing: ' || case when n=n0 then 'PASS' else 'FAIL' end || E'\n';

  r := public.import_items(rows, false, false, false);
  select count(*) into n from public.items;
  res := res || 'I3 errors without skip -> nothing created (created=' || (r->>'created') || '): ' || case when n=n0 and (r->>'created')::int=0 then 'PASS' else 'FAIL' end || E'\n';

  r := public.import_items(rows, false, true, false);
  select count(*) into n from public.items;
  res := res || 'I4 skip invalid: created=' || (r->>'created') || ' (want 3), skipped=' || (r->>'skipped') || ', categories_created=' || (r->>'categories_created') || ' (want 1): ' ||
    case when (r->>'created')::int=3 and n=n0+3 and (r->>'categories_created')::int=1 then 'PASS' else 'FAIL' end || E'\n';
  select selling_item_name, category_id into sell, catid from public.items where internal_item_code='N-1';
  res := res || 'I5 selling name falls back to item name ('||sell||'), existing category reused: ' || case when sell='n1' and catid=cat1 then 'PASS' else 'FAIL' end || E'\n';
  select selling_item_name into sell from public.items where internal_item_code='N-3';
  res := res || 'I6 given selling name kept ('||sell||'): ' || case when sell='Bill name' then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into bcn from public.item_barcodes ib join public.items i on i.id=ib.item_id where i.internal_item_code='N-1' and ib.barcode='111';
  res := res || 'I7 barcode linked to item: ' || case when bcn=1 then 'PASS' else 'FAIL' end || E'\n';
  select count(*) into n from public.items where internal_item_code='N-1' and purchase_source='IMPORT' and created_by=a;
  res := res || 'I8 source upper-cased and created_by = caller: ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';

  r := public.import_items(jsonb_build_array(jsonb_build_object('row',1,'internal_item_code','G-1','item_name','g','purchase_source','LOCAL')), false, false, true);
  select count(*) into gen from public.item_barcodes ib join public.items i on i.id=ib.item_id where i.internal_item_code='G-1' and ib.is_generated and ib.barcode ~ '^2[0-9]{12}$';
  res := res || 'I9 generate barcodes option: ' || case when gen=1 and (r->>'created')::int=1 then 'PASS' else 'FAIL' end || E'\n';

  begin
    perform public.import_items(rows, true, false, false);
    perform set_config('request.jwt.claims', json_build_object('sub',c,'role','authenticated')::text, true);
    perform public.import_items(rows, true, false, false);
    res := res || 'I10 user without items.import: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'I10 user without items.import denied: PASS' || E'\n';
  end;

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  r := public.import_items(jsonb_build_array(
        jsonb_build_object('row',1,'internal_item_code','Q-1','item_name','q','purchase_source','LOCAL','category','Brand New Cat'),
        jsonb_build_object('row',2,'internal_item_code','Q-2','item_name','q','purchase_source','LOCAL','category','cables')), true, false, false);
  res := res || 'I11 no categories.manage: new category is an error, existing is fine (valid=' || (r->>'valid') || ', errors=' || jsonb_array_length(r->'errors') || '): ' ||
    case when (r->>'valid')::int=1 and jsonb_array_length(r->'errors')=1 then 'PASS' else 'FAIL' end || E'\n';

  begin
    perform public.import_items((select jsonb_agg(jsonb_build_object('row',g,'internal_item_code','Z'||g,'item_name','z','purchase_source','LOCAL')) from generate_series(1,2001) g), true, false, false);
    res := res || 'I12 2001 rows: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'I12 more than 2000 rows refused: PASS' || E'\n';
  end;
  begin
    perform public.import_items('[]'::jsonb, true, false, false);
    res := res || 'I13 empty list: FAIL' || E'\n';
  exception when others then res := res || 'I13 empty list refused: PASS' || E'\n';
  end;
  begin
    perform public.import_items('{"a":1}'::jsonb, true, false, false);
    res := res || 'I14 non-array: FAIL' || E'\n';
  exception when others then res := res || 'I14 non-array refused: PASS' || E'\n';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  begin
    perform public.import_items(rows, true, false, false);
    res := res || 'I15 anonymous: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'I15 anonymous refused: PASS' || E'\n';
  end;
  reset role;
  select count(*) into n from public.audit_log where action='IMPORT_ITEMS';
  res := res || 'I16 import audit rows (' || n || ', want 2): ' || case when n=2 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
