-- Settings page (owner's mock): the parts that really work now.
--   Company information (name, tagline, GST, PAN, address, phone, email, website) kept in app_settings under keys "company.*";
--   it is shown on the printed papers (pick list, shipping label, goods receipt, purchase order, transfer note, bill) and on the Settings page.
--   An administrator saves it through admin_save_company() (checks is_admin(); every field is checked here). Anybody signed in may READ it (a printed paper needs it).
--   An audit-log viewer for administrators: admin_audit_page().
-- The other settings of the mock (e-mail server, 2-factor login, IP restriction, backup, integrations, number prefixes, negative stock, ...) are NOT stored or used:
-- the page shows them as "not built yet" (owner's choice), so no setting exists that looks active but does nothing.

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key ~ '^(billing_enabled|company\.[a-z_]{2,30})$');

insert into public.app_settings (key, value) values
  ('company.name', to_jsonb('SETMI INDIA'::text)),
  ('company.tagline', to_jsonb('Engineered for the Extraordinary.'::text))
on conflict (key) do nothing;

create or replace function public.company_info()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(substr(key, 9), value), '{}'::jsonb) from public.app_settings where key like 'company.%';
$$;

create or replace function public.admin_save_company(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p->>'name', '')); v_tag text := nullif(btrim(coalesce(p->>'tagline', '')), ''); v_gst text := nullif(upper(btrim(coalesce(p->>'gst', ''))), '');
  v_pan text := nullif(upper(btrim(coalesce(p->>'pan', ''))), ''); v_addr text := nullif(btrim(coalesce(p->>'address', '')), ''); v_phone text := nullif(btrim(coalesce(p->>'phone', '')), '');
  v_mail text := nullif(btrim(coalesce(p->>'email', '')), ''); v_web text := nullif(btrim(coalesce(p->>'website', '')), '');
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then raise exception 'The company name must be 2 to 100 letters'; end if;
  if v_tag is not null and char_length(v_tag) > 100 then raise exception 'The tagline is too long (max 100)'; end if;
  if v_gst is not null and v_gst !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then raise exception 'The GST number must have 15 letters and digits (for example 07ABCDE1234F1Z5)'; end if;
  if v_pan is not null and v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'The PAN must have 10 characters (for example ABCDE1234F)'; end if;
  if v_addr is not null and char_length(v_addr) > 300 then raise exception 'The address is too long (max 300)'; end if;
  if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^[0-9+()\- ]+$') then raise exception 'The phone number is not valid'; end if;
  if v_mail is not null and (char_length(v_mail) > 100 or v_mail !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'The e-mail address is not valid'; end if;
  if v_web is not null and (char_length(v_web) > 100 or v_web !~* '^https?://[^\s]+$') then raise exception 'The website must start with http:// or https://'; end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  select k, case when v is null then to_jsonb(''::text) else to_jsonb(v) end, now(), (select auth.uid())
    from (values ('company.name', v_name), ('company.tagline', v_tag), ('company.gst', v_gst), ('company.pan', v_pan), ('company.address', v_addr),
                 ('company.phone', v_phone), ('company.email', v_mail), ('company.website', v_web)) as t(k, v)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = (select auth.uid());
end $$;

-- the audit log for administrators, newest first; p_entity: all or a table name
create or replace function public.admin_audit_page(p_q text default null, p_entity text default null, p_from date default null, p_to date default null, p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_like text; v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100); v_offset int := greatest(coalesce(p_offset, 0), 0); v_result jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_entity is not null and p_entity !~ '^[a-z_]{0,60}$' then raise exception 'Unknown entity filter' using errcode = 'P0001'; end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with base as (
    select a.id, a.at, a.action, a.entity, a.entity_id, a.details, coalesce(nullif(btrim(coalesce(p.full_name, '')), ''), p.email) as actor_name
      from public.audit_log a left join public.profiles p on p.id = a.actor
     where (coalesce(p_entity, '') in ('', 'all') or a.entity = p_entity)
       and (p_from is null or (a.at at time zone 'Asia/Kolkata')::date >= p_from) and (p_to is null or (a.at at time zone 'Asia/Kolkata')::date <= p_to)
       and (coalesce(p_q, '') = '' or a.action ilike v_like or a.entity ilike v_like or coalesce(a.entity_id, '') ilike v_like or coalesce(p.email, '') ilike v_like or coalesce(p.full_name, '') ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select * from base order by at desc, id desc limit v_limit offset v_offset) t),
    'entities', (select coalesce(jsonb_agg(e order by e), '[]'::jsonb) from (select distinct entity as e from public.audit_log) x))
  into v_result;
  return v_result;
end $$;

revoke all on function public.company_info() from public, anon;
revoke all on function public.admin_save_company(jsonb) from public, anon;
revoke all on function public.admin_audit_page(text, text, date, date, int, int) from public, anon;
grant execute on function public.company_info() to authenticated;
grant execute on function public.admin_save_company(jsonb) to authenticated;
grant execute on function public.admin_audit_page(text, text, date, date, int, int) to authenticated;
