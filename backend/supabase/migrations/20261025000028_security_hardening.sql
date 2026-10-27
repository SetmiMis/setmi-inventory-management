-- Security hardening from the owner-approved "hack it, then fix it" audit (2026-10-25).
-- Nothing here changes what a signed-in, permitted user can do. It only removes things nobody needs.

-- 1. The anonymous (not signed-in) role never needs any table. RLS already blocked it; this removes the grants too,
--    so a future table made without RLS is still closed to strangers.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- 2. Trigger functions are not meant to be called over the API.
revoke execute on function public.items_guard_update() from anon, authenticated, public;
revoke execute on function public.locations_guard_update() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.stock_movements_append_only() from anon, authenticated, public;

-- 3. Look-up tables were readable by ANY signed-in account (even a stranger who signed up, or a switched-off user).
--    Now only active users can read them.
drop policy app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings for select to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_active));
drop policy permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_active));
drop policy units_select on public.units;
create policy units_select on public.units for select to authenticated
  using (exists (select 1 from public.profiles pr where pr.id = (select auth.uid()) and pr.is_active));

-- 4. Item files: uploads straight to storage must use the same path shape the app uses
--    (items/<item id>/image-or-datasheet-<random id>.jpg|png|webp|pdf). The real-bytes check still runs in the app.
drop policy item_files_insert on storage.objects;
create policy item_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'item-files'
    and (select public.has_permission('items.edit'))
    and name ~ '^items/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(image|datasheet)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
  );
