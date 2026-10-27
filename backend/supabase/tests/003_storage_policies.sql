-- Storage policy tests for bucket item-files. Same method as 001: ends with a deliberate
-- exception so everything is rolled back. Every line should say PASS.
do $$
declare
  ed uuid := gen_random_uuid(); vw uuid := gen_random_uuid(); no uuid := gen_random_uuid();
  res text := ''; n int; oid uuid;
  bucket_ok boolean; limit_bytes bigint; mimes text[]; is_public boolean;
begin
  insert into auth.users (id, email) values (ed,'ed@test.local'),(vw,'vw@test.local'),(no,'no@test.local');
  update public.profiles set is_active = true where id in (ed, vw, no);
  insert into public.user_permissions (user_id, permission_key) values
    (ed,'items.view'),(ed,'items.edit'),(vw,'items.view');

  select public, file_size_limit, allowed_mime_types into is_public, limit_bytes, mimes
    from storage.buckets where id = 'item-files';
  res := res || 'S0 bucket private: ' || case when is_public = false then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'S0b bucket size limit 10MB: ' || case when limit_bytes = 10485760 then 'PASS' else 'FAIL' end || E'\n';
  res := res || 'S0c bucket mime list has no svg/html: ' ||
    case when not (mimes && array['image/svg+xml','text/html']) then 'PASS' else 'FAIL' end || E'\n';

  -- editor uploads
  perform set_config('request.jwt.claims', json_build_object('sub',ed,'role','authenticated')::text, true);
  set local role authenticated;
  insert into storage.objects (bucket_id, name, owner_id) values ('item-files','items/x/image-a.png', ed::text)
    returning id into oid;
  res := res || 'S1 editor can upload: PASS' || E'\n';
  select count(*) into n from storage.objects where bucket_id = 'item-files';
  res := res || 'S2 editor can see object, count ' || n || ': ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  update storage.objects set metadata = '{"t":1}' where id = oid;
  get diagnostics n = row_count;
  res := res || 'S2b editor can update object, rows ' || n || ': ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';

  -- viewer: read yes, write no
  perform set_config('request.jwt.claims', json_build_object('sub',vw,'role','authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'item-files';
  res := res || 'S3 viewer can see object, count ' || n || ': ' || case when n=1 then 'PASS' else 'FAIL' end || E'\n';
  begin
    insert into storage.objects (bucket_id, name, owner_id) values ('item-files','items/x/image-b.png', vw::text);
    res := res || 'S4 viewer upload: FAIL (allowed)' || E'\n';
  exception when others then res := res || 'S4 viewer cannot upload: PASS' || E'\n';
  end;
  -- NOTE: Supabase blocks direct DELETE on storage tables, so write access is tested with UPDATE.
  update storage.objects set metadata = '{"t":2}' where id = oid;
  get diagnostics n = row_count;
  res := res || 'S5 viewer update rows ' || n || ' (want 0): ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  -- user with no permission
  perform set_config('request.jwt.claims', json_build_object('sub',no,'role','authenticated')::text, true);
  select count(*) into n from storage.objects where bucket_id = 'item-files';
  res := res || 'S6 no-permission user sees objects ' || n || ': ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  -- anonymous
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'item-files';
  res := res || 'S7 anonymous sees objects ' || n || ': ' || case when n=0 then 'PASS' else 'FAIL' end || E'\n';

  raise exception E'TEST RESULTS (rolled back):\n%', res;
end $$;
