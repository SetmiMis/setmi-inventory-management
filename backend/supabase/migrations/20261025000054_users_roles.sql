-- Users & Roles (owner's mock). ADMIN ONLY. Adds:
--   roles (a named TEMPLATE of permissions; "Admin" is the system role that means is_admin) with role_permissions,
--   departments (a small list), profiles.role_id / profiles.department_id (labels for the user list),
--   user_invites (an admin writes the email, role, department, permissions and places BEFORE the person signs in; the first sign-in with that email is set up
--   automatically by handle_new_user; the login account itself is still made in the Supabase dashboard, so no secret key is needed anywhere).
-- Giving a role to a user COPIES the role's permissions to that user (owner's choice); changing a role later does NOT change users who already have it.
-- Every change goes through admin_* functions that check is_admin() (SECURITY DEFINER) and is written to the audit log by triggers.
-- Existing functions are kept: admin_set_user_active / _admin / _permissions / _locations.

create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 60),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index departments_name_unique on public.departments (lower(btrim(name)));
alter table public.departments enable row level security;
create trigger departments_audit after insert or update or delete on public.departments for each row execute function public.log_audit();

create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 2 and 60),
  description  text check (description is null or char_length(description) <= 200),
  grants_admin boolean not null default false,
  is_system    boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index roles_name_unique on public.roles (lower(btrim(name)));
alter table public.roles enable row level security;
create trigger roles_audit after insert or update or delete on public.roles for each row execute function public.log_audit();

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);
alter table public.role_permissions enable row level security;

create table public.user_invites (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  full_name       text check (full_name is null or char_length(full_name) <= 100),
  role_id         uuid references public.roles (id) on delete set null,
  department_id   uuid references public.departments (id) on delete set null,
  permission_keys text[] not null default '{}',
  location_ids    uuid[] not null default '{}',
  invited_by      uuid references public.profiles (id) default auth.uid(),
  invited_at      timestamptz not null default now(),
  used_at         timestamptz
);
create unique index user_invites_open_email on public.user_invites (lower(email)) where used_at is null;
alter table public.user_invites enable row level security;
create trigger user_invites_audit after insert or update or delete on public.user_invites for each row execute function public.log_audit();

alter table public.profiles add column role_id uuid references public.roles (id) on delete set null;
alter table public.profiles add column department_id uuid references public.departments (id) on delete set null;

create policy departments_admin on public.departments for select to authenticated using ((select public.is_admin()));
create policy roles_admin on public.roles for select to authenticated using ((select public.is_admin()));
create policy role_permissions_admin on public.role_permissions for select to authenticated using ((select public.is_admin()));
create policy user_invites_admin on public.user_invites for select to authenticated using ((select public.is_admin()));
revoke all on public.departments, public.roles, public.role_permissions, public.user_invites from anon, authenticated;
grant select on public.departments, public.roles, public.role_permissions, public.user_invites to authenticated;

-- ---------- starting data (edit freely on the Roles tab) ----------
insert into public.departments (name) values ('Management'), ('Operations'), ('Sales'), ('Stock'), ('Purchase'), ('Accounts');
insert into public.roles (name, description, grants_admin, is_system) values ('Admin', 'Full access to everything, manages users and roles', true, true);
insert into public.roles (name, description) values
  ('Operations Manager', 'Runs stock, receiving, picking, dispatch and returns; approves'),
  ('Sales Executive', 'Customers, sales orders and shop billing'),
  ('Warehouse Staff', 'Receiving, stock entry, transfers, picking, packing and dispatch work'),
  ('Purchase Executive', 'Suppliers, purchase orders, shipments and goods receipts'),
  ('Accountant', 'Looks at purchases, sales, stock value and reports');
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.key = any (
  case r.name
    when 'Operations Manager' then array['items.view','items.create','items.edit','stock.view','stock.entry','stock.adjust','stock.approve','stock.min_levels','transfers.view','transfers.create','transfers.send','transfers.receive',
      'receipts.view','receipts.create','receipts.post','qc.view','qc.manage','shipments.view','suppliers.view','purchase.view','customers.view','sales_orders.view','picking.view','picking.manage',
      'dispatch.view','dispatch.manage','returns.view','returns.manage','returns.approve','reports.view','reports.export']
    when 'Sales Executive' then array['items.view','stock.view','customers.view','customers.manage','sales_orders.view','sales_orders.create','sales_orders.confirm','bills.view','bills.create','reports.view']
    when 'Warehouse Staff' then array['items.view','stock.view','stock.entry','transfers.view','transfers.create','transfers.send','transfers.receive','receipts.view','receipts.create','qc.view',
      'sales_orders.view','picking.view','picking.manage','dispatch.view','dispatch.manage','returns.view','returns.manage']
    when 'Purchase Executive' then array['items.view','stock.view','suppliers.view','suppliers.manage','purchase.view','purchase.create','receipts.view','receipts.create','receipts.cost','shipments.view','shipments.manage','reports.view']
    when 'Accountant' then array['items.view','stock.view','purchase.view','receipts.view','receipts.cost','bills.view','sales_orders.view','customers.view','reports.view','reports.export','audit.view']
    else array[]::text[] end)
 where not r.is_system;
update public.profiles set role_id = (select id from public.roles where is_system and grants_admin) where is_admin;

-- ---------- a new sign-in that was invited is set up at once ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inv public.user_invites%rowtype; v_admin boolean;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'full_name');
  select * into inv from public.user_invites where lower(email) = lower(coalesce(new.email, '')) and used_at is null order by invited_at desc limit 1;
  if found then
    select coalesce(grants_admin, false) into v_admin from public.roles where id = inv.role_id;
    update public.profiles set is_active = true, full_name = coalesce(nullif(btrim(coalesce(full_name, '')), ''), inv.full_name), role_id = inv.role_id, department_id = inv.department_id, is_admin = coalesce(v_admin, false)
     where id = new.id;
    insert into public.user_permissions (user_id, permission_key, granted_by)
    select new.id, k, inv.invited_by from unnest(inv.permission_keys) k where exists (select 1 from public.permissions p where p.key = k);
    insert into public.user_locations (user_id, location_id)
    select new.id, l from unnest(inv.location_ids) l where exists (select 1 from public.locations x where x.id = l);
    update public.user_invites set used_at = now() where id = inv.id;
    insert into public.audit_log (actor, action, entity, entity_id, details)
    values (inv.invited_by, 'INVITE_USED', 'user_invites', inv.id::text, jsonb_build_object('email', inv.email, 'user', new.id));
  end if;
  return new;
end $$;

-- ---------- roles ----------
create or replace function public.admin_save_role(p_id uuid, p_name text, p_description text, p_keys text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_desc text := nullif(btrim(coalesce(p_description, '')), ''); v_id uuid := p_id; r public.roles%rowtype; k text;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then raise exception 'The role name must be 2 to 60 letters'; end if;
  if v_desc is not null and char_length(v_desc) > 200 then raise exception 'The description is too long (max 200)'; end if;
  if exists (select 1 from public.roles where lower(btrim(name)) = lower(v_name) and id is distinct from p_id) then raise exception 'This role name is already used'; end if;
  foreach k in array coalesce(p_keys, '{}') loop
    if not exists (select 1 from public.permissions where key = k) then raise exception 'Unknown permission: %', k; end if;
  end loop;
  if p_id is null then
    insert into public.roles (name, description) values (v_name, v_desc) returning id into v_id;
  else
    select * into r from public.roles where id = p_id for update;
    if not found then raise exception 'Role not found'; end if;
    if r.is_system then raise exception 'The Admin role cannot be changed'; end if;
    update public.roles set name = v_name, description = v_desc where id = p_id;
  end if;
  delete from public.role_permissions where role_id = v_id;
  insert into public.role_permissions (role_id, permission_key) select v_id, x from (select distinct unnest(coalesce(p_keys, '{}')) as x) s;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SAVE_ROLE', 'roles', v_id::text, jsonb_build_object('name', v_name, 'keys', p_keys));
  return v_id;
end $$;

create or replace function public.admin_set_role_active(p_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.roles%rowtype;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.roles where id = p_id for update;
  if not found then raise exception 'Role not found'; end if;
  if r.is_system then raise exception 'The Admin role cannot be switched off'; end if;
  update public.roles set is_active = p_active where id = p_id;
end $$;

-- ---------- departments ----------
create or replace function public.admin_save_department(p_id uuid, p_name text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid := p_id;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then raise exception 'The department name must be 2 to 60 letters'; end if;
  if exists (select 1 from public.departments where lower(btrim(name)) = lower(v_name) and id is distinct from p_id) then raise exception 'This department already exists'; end if;
  if p_id is null then
    insert into public.departments (name) values (v_name) returning id into v_id;
  else
    update public.departments set name = v_name, is_active = coalesce(p_active, true) where id = p_id;
    if not found then raise exception 'Department not found'; end if;
  end if;
  return v_id;
end $$;

-- ---------- a user's name, role label and department ----------
create or replace function public.admin_set_user_profile(p_user uuid, p_full_name text, p_role uuid, p_department uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_name is not null and char_length(v_name) > 100 then raise exception 'The name is too long (max 100)'; end if;
  if p_role is not null and not exists (select 1 from public.roles where id = p_role) then raise exception 'Role not found'; end if;
  if p_department is not null and not exists (select 1 from public.departments where id = p_department) then raise exception 'Department not found'; end if;
  update public.profiles set full_name = v_name, role_id = p_role, department_id = p_department where id = p_user;
  if not found then raise exception 'User not found'; end if;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'SET_PROFILE', 'profiles', p_user::text, jsonb_build_object('name', v_name, 'role', p_role, 'department', p_department));
end $$;

-- ---------- give a role: copies its permissions to the user (and Admin right if the role is Admin) ----------
create or replace function public.admin_apply_role(p_user uuid, p_role uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.roles%rowtype; p public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.roles where id = p_role;
  if not found then raise exception 'Role not found'; end if;
  if not r.is_active then raise exception 'This role is switched off'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'User not found'; end if;
  if p_user = (select auth.uid()) and p.is_admin and not r.grants_admin then raise exception 'you cannot remove your own admin right'; end if;
  delete from public.user_permissions where user_id = p_user;
  insert into public.user_permissions (user_id, permission_key, granted_by) select p_user, permission_key, (select auth.uid()) from public.role_permissions where role_id = p_role;
  update public.profiles set role_id = p_role, is_admin = r.grants_admin where id = p_user;
  insert into public.audit_log (actor, action, entity, entity_id, details)
  values ((select auth.uid()), 'APPLY_ROLE', 'profiles', p_user::text, jsonb_build_object('role', r.name));
end $$;

-- ---------- invite (pre-approve) a person ----------
create or replace function public.admin_invite_user(p_email text, p_full_name text, p_role uuid, p_department uuid, p_keys text[], p_locations uuid[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); v_name text := nullif(btrim(coalesce(p_full_name, '')), ''); v_id uuid; k text; v_keys text[]; l uuid;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'Enter a valid email address'; end if;
  if v_name is not null and char_length(v_name) > 100 then raise exception 'The name is too long (max 100)'; end if;
  if exists (select 1 from public.profiles where lower(email) = v_email) then raise exception 'This person already has a login. Open them in the list instead'; end if;
  if exists (select 1 from public.user_invites where lower(email) = v_email and used_at is null) then raise exception 'This email is already invited'; end if;
  if p_role is not null and not exists (select 1 from public.roles where id = p_role and is_active) then raise exception 'Role not found or switched off'; end if;
  if p_department is not null and not exists (select 1 from public.departments where id = p_department) then raise exception 'Department not found'; end if;
  v_keys := case when p_keys is not null then p_keys else coalesce((select array_agg(permission_key) from public.role_permissions where role_id = p_role), '{}') end;
  foreach k in array v_keys loop
    if not exists (select 1 from public.permissions where key = k) then raise exception 'Unknown permission: %', k; end if;
  end loop;
  foreach l in array coalesce(p_locations, '{}') loop
    if not exists (select 1 from public.locations where id = l) then raise exception 'Place not found'; end if;
  end loop;
  insert into public.user_invites (email, full_name, role_id, department_id, permission_keys, location_ids)
  values (v_email, v_name, p_role, p_department, v_keys, coalesce(p_locations, '{}')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_cancel_invite(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.user_invites where id = p_id and used_at is null;
  if not found then raise exception 'Invite not found'; end if;
end $$;

-- ---------- the screen ----------
-- p_status: all | ACTIVE | INACTIVE | INVITED ; p_role / p_department: id or null. Rows are people (profiles) and open invites.
create or replace function public.admin_users_page(
  p_q text default null, p_role uuid default null, p_department uuid default null, p_status text default null, p_limit int default 10, p_offset int default 0
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('', 'all', 'ACTIVE', 'INACTIVE', 'INVITED') then raise exception 'Unknown status filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with people as (
    select p.id, 'USER'::text as kind, p.email, p.full_name, p.role_id, r.name as role_name, p.department_id, d.name as department_name, p.is_active, p.is_admin,
           case when p.is_active then 'ACTIVE' else 'INACTIVE' end as status, au.last_sign_in_at as last_login, p.created_at,
           (select count(*) from public.user_permissions up where up.user_id = p.id) as perm_count
      from public.profiles p left join public.roles r on r.id = p.role_id left join public.departments d on d.id = p.department_id left join auth.users au on au.id = p.id
    union all
    select i.id, 'INVITE', i.email, i.full_name, i.role_id, r.name, i.department_id, d.name, false, coalesce(r.grants_admin, false), 'INVITED', null, i.invited_at, coalesce(array_length(i.permission_keys, 1), 0)
      from public.user_invites i left join public.roles r on r.id = i.role_id left join public.departments d on d.id = i.department_id where i.used_at is null
  ),
  filtered as (
    select x.* from people x
     where (p_role is null or x.role_id = p_role) and (p_department is null or x.department_id = p_department)
       and (coalesce(p_status, '') in ('', 'all') or x.status = p_status)
       and (coalesce(p_q, '') = '' or x.email ilike v_like or coalesce(x.full_name, '') ilike v_like or coalesce(x.role_name, '') ilike v_like or coalesce(x.department_name, '') ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select * from filtered order by (status = 'INVITED'), lower(coalesce(full_name, email)) limit v_limit offset v_offset) t),
    'kpi', jsonb_build_object(
      'total', (select count(*) from public.profiles), 'active', (select count(*) from public.profiles where is_active), 'inactive', (select count(*) from public.profiles where not is_active),
      'invited', (select count(*) from public.user_invites where used_at is null), 'roles', (select count(*) from public.roles where is_active), 'departments', (select count(*) from public.departments where is_active)),
    'roles', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'description', r.description, 'grants_admin', r.grants_admin, 'is_system', r.is_system, 'is_active', r.is_active,
                'users', (select count(*) from public.profiles p where p.role_id = r.id), 'perm_count', (select count(*) from public.role_permissions rp where rp.role_id = r.id),
                'keys', coalesce((select jsonb_agg(rp.permission_key order by rp.permission_key) from public.role_permissions rp where rp.role_id = r.id), '[]'::jsonb)) order by r.is_system desc, r.name), '[]'::jsonb) from public.roles r),
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'is_active', d.is_active, 'users', (select count(*) from public.profiles p where p.department_id = d.id)) order by d.name), '[]'::jsonb) from public.departments d))
  into v_result;
  return v_result;
end $$;

-- the last 100 changes to users, roles, permissions, places and invites (from the audit log)
create or replace function public.admin_access_log(p_limit int default 20, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100); v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.audit_log a where a.entity in ('profiles', 'user_permissions', 'user_locations', 'roles', 'role_permissions', 'departments', 'user_invites')),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select a.id, a.at, a.action, a.entity, a.entity_id, a.details, coalesce(nullif(btrim(coalesce(ap.full_name, '')), ''), ap.email) as actor_name,
             coalesce(nullif(btrim(coalesce(tp.full_name, '')), ''), tp.email) as target_name
        from public.audit_log a left join public.profiles ap on ap.id = a.actor
        left join public.profiles tp on a.entity in ('profiles', 'user_permissions', 'user_locations') and a.entity_id ~ '^[0-9a-f-]{36}$' and tp.id::text = a.entity_id
       where a.entity in ('profiles', 'user_permissions', 'user_locations', 'roles', 'role_permissions', 'departments', 'user_invites')
       order by a.at desc, a.id desc limit v_limit offset v_offset) t));
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.admin_save_role(uuid, text, text, text[]) from public, anon;
revoke all on function public.admin_set_role_active(uuid, boolean) from public, anon;
revoke all on function public.admin_save_department(uuid, text, boolean) from public, anon;
revoke all on function public.admin_set_user_profile(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.admin_apply_role(uuid, uuid) from public, anon;
revoke all on function public.admin_invite_user(text, text, uuid, uuid, text[], uuid[]) from public, anon;
revoke all on function public.admin_cancel_invite(uuid) from public, anon;
revoke all on function public.admin_users_page(text, uuid, uuid, text, int, int) from public, anon;
revoke all on function public.admin_access_log(int, int) from public, anon;
grant execute on function public.admin_save_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.admin_set_role_active(uuid, boolean) to authenticated;
grant execute on function public.admin_save_department(uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_user_profile(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.admin_apply_role(uuid, uuid) to authenticated;
grant execute on function public.admin_invite_user(text, text, uuid, uuid, text[], uuid[]) to authenticated;
grant execute on function public.admin_cancel_invite(uuid) to authenticated;
grant execute on function public.admin_users_page(text, uuid, uuid, text, int, int) to authenticated;
grant execute on function public.admin_access_log(int, int) to authenticated;
