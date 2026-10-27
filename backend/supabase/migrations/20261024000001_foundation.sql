-- Foundation: profiles, permission toggles, locations (warehouses + shops), audit log.
-- Rules: deny by default. RLS on every table. No end-user write policies on
-- profiles / user_permissions / user_locations: those change only through the
-- admin_* functions below, which require is_admin().

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  -- WHY false by default: if signups are ever left open, a stranger gets an
  -- inactive profile with no access until an admin activates it.
  is_active   boolean not null default false,
  -- is_admin = may manage users and implicitly holds every permission.
  -- Set only by SQL / by an existing admin through admin_set_user_admin().
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- permissions ----------
create table public.permissions (
  key         text primary key,
  module      text not null,
  description text not null
);
alter table public.permissions enable row level security;

create table public.user_permissions (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted_by     uuid references public.profiles (id),
  granted_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);
alter table public.user_permissions enable row level security;

insert into public.permissions (key, module, description) values
  ('items.view',              'items',      'View items'),
  ('items.create',            'items',      'Create items'),
  ('items.edit',              'items',      'Edit item details, barcodes, images, datasheet'),
  ('items.edit_selling_name', 'items',      'Change the Selling_Item_Name printed on bills'),
  ('items.archive',           'items',      'Archive or restore items'),
  ('items.import',            'items',      'Import items from Excel'),
  ('categories.manage',       'items',      'Create and edit item categories'),
  ('locations.manage',        'locations',  'Create and edit warehouses and shops'),
  ('audit.view',              'system',     'View the audit log');

-- ---------- permission checks ----------
-- Stable + security definer so RLS policies can call them without recursion.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.is_admin
  );
$$;

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = (select auth.uid())
      and pr.is_active
      and (pr.is_admin or exists (
        select 1 from public.user_permissions up
        where up.user_id = pr.id and up.permission_key = p_key))
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.has_permission(text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- ---------- locations (warehouses and shops) ----------
create type public.location_type as enum ('WAREHOUSE', 'SHOP');

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (btrim(code) <> ''),
  name        text not null check (btrim(name) <> ''),
  type        public.location_type not null,
  address     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);
create unique index locations_code_uq on public.locations (lower(btrim(code)));
alter table public.locations enable row level security;
create trigger locations_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

-- Which locations a user may work in (a shop user sees only their shop).
create table public.user_locations (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  primary key (user_id, location_id)
);
create index user_locations_location_idx on public.user_locations (location_id);
alter table public.user_locations enable row level security;

create or replace function public.can_access_location(p_location uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.user_locations ul
    join public.profiles pr on pr.id = ul.user_id
    where ul.user_id = (select auth.uid()) and ul.location_id = p_location and pr.is_active);
$$;
revoke all on function public.can_access_location(uuid) from public, anon;
grant execute on function public.can_access_location(uuid) to authenticated;

-- ---------- audit log (append only) ----------
create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     uuid,
  action    text not null,
  entity    text not null,
  entity_id text,
  details   jsonb
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_at_idx on public.audit_log (at desc);
alter table public.audit_log enable row level security;

-- Generic trigger: records who changed what. Attach to important tables.
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
begin
  v_id := coalesce(to_jsonb(coalesce(new, old)) ->> 'id', '');
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values (
    (select auth.uid()), tg_op, tg_table_name, v_id,
    case tg_op
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old))
    end);
  return coalesce(new, old);
end $$;
revoke all on function public.log_audit() from public, anon, authenticated;

create trigger locations_audit after insert or update or delete on public.locations
  for each row execute function public.log_audit();

-- ---------- admin functions (only way to change users, permissions, scope) ----------
create or replace function public.admin_set_user_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) and not p_active then
    raise exception 'you cannot deactivate yourself';
  end if;
  update public.profiles set is_active = p_active where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SET_ACTIVE', 'profiles', p_user::text, jsonb_build_object('active', p_active));
end $$;

create or replace function public.admin_set_user_admin(p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_user = (select auth.uid()) and not p_admin then
    raise exception 'you cannot remove your own admin right';
  end if;
  update public.profiles set is_admin = p_admin where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SET_ADMIN', 'profiles', p_user::text, jsonb_build_object('admin', p_admin));
end $$;

-- Replace the user's whole permission set in one transaction.
create or replace function public.admin_set_user_permissions(p_user uuid, p_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.user_permissions where user_id = p_user;
  insert into public.user_permissions (user_id, permission_key, granted_by)
  select p_user, k, (select auth.uid()) from unnest(coalesce(p_keys, '{}')) as k;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SET_PERMISSIONS', 'user_permissions', p_user::text, jsonb_build_object('keys', p_keys));
end $$;

create or replace function public.admin_set_user_locations(p_user uuid, p_locations uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.user_locations where user_id = p_user;
  insert into public.user_locations (user_id, location_id)
  select p_user, l from unnest(coalesce(p_locations, '{}')) as l;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SET_LOCATIONS', 'user_locations', p_user::text, jsonb_build_object('locations', p_locations));
end $$;

revoke all on function public.admin_set_user_active(uuid, boolean) from public, anon;
revoke all on function public.admin_set_user_admin(uuid, boolean) from public, anon;
revoke all on function public.admin_set_user_permissions(uuid, text[]) from public, anon;
revoke all on function public.admin_set_user_locations(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_permissions(uuid, text[]) to authenticated;
grant execute on function public.admin_set_user_locations(uuid, uuid[]) to authenticated;

-- ---------- RLS policies (all "to authenticated"; anon gets nothing) ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy permissions_select on public.permissions for select to authenticated
  using (true);

create policy user_permissions_select on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy locations_select on public.locations for select to authenticated
  using ((select public.can_access_location(id)) or (select public.has_permission('locations.manage')));
create policy locations_insert on public.locations for insert to authenticated
  with check ((select public.has_permission('locations.manage')));
create policy locations_update on public.locations for update to authenticated
  using ((select public.has_permission('locations.manage')))
  with check ((select public.has_permission('locations.manage')));

create policy user_locations_select on public.user_locations for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.has_permission('audit.view')));
