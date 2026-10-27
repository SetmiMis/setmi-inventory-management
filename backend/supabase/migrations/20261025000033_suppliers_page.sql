-- Suppliers screen (owner's mock): an automatic supplier code (SUP-001...), city, website, payment terms and currency,
-- and one call that returns a page of suppliers plus the five top numbers and the list of countries.
-- All new columns are optional or have a default, so existing suppliers stay valid.
create sequence if not exists public.supplier_code_seq;
-- The code is filled in by the column default when a supplier is added, so the adding person needs the right to use the sequence.
grant usage on sequence public.supplier_code_seq to authenticated;

alter table public.suppliers
  add column if not exists code text not null default ('SUP-' || lpad(nextval('public.supplier_code_seq')::text, 3, '0')),
  add column if not exists city text,
  add column if not exists website text,
  add column if not exists payment_terms text,
  add column if not exists currency text not null default 'INR';

alter table public.suppliers
  drop constraint if exists suppliers_city_len,
  drop constraint if exists suppliers_website_len,
  drop constraint if exists suppliers_terms_len,
  drop constraint if exists suppliers_currency_fmt;
alter table public.suppliers
  add constraint suppliers_city_len check (city is null or char_length(city) <= 60),
  add constraint suppliers_website_len check (website is null or char_length(website) <= 200),
  add constraint suppliers_terms_len check (payment_terms is null or char_length(payment_terms) <= 60),
  add constraint suppliers_currency_fmt check (currency ~ '^[A-Z]{3}$');
create unique index if not exists suppliers_code_uq on public.suppliers (code);

create or replace function public.suppliers_page(
  p_q text default null,
  p_type text default null,      -- LOCAL | IMPORT
  p_status text default null,    -- all | active | inactive
  p_country text default null,
  p_limit int default 10,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_like text;
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_result jsonb;
begin
  if not (public.has_permission('suppliers.view') or public.has_permission('suppliers.manage')) then
    raise exception 'You do not have permission to see suppliers' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'active', 'inactive') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_type is not null and p_type not in ('', 'LOCAL', 'IMPORT') then
    raise exception 'Unknown type filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select s.id, s.code, s.name, s.supplier_type::text as type, s.country, s.city, s.contact_person, s.phone, s.email,
           s.is_active as active, s.created_at
      from public.suppliers s
  ),
  filtered as (
    select b.* from base b
     where (coalesce(p_type, '') = '' or b.type = p_type)
       and (coalesce(p_status, '') in ('', 'all') or (p_status = 'active' and b.active) or (p_status = 'inactive' and not b.active))
       and (coalesce(p_country, '') = '' or b.country = p_country)
       and (coalesce(p_q, '') = '' or b.name ilike v_like or b.code ilike v_like or coalesce(b.contact_person, '') ilike v_like
            or coalesce(b.email, '') ilike v_like or coalesce(b.phone, '') ilike v_like or coalesce(b.city, '') ilike v_like
            or coalesce(b.country, '') ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.code), '[]'::jsonb)
               from (select * from filtered order by code limit v_limit offset v_offset) t),
    'countries', (select coalesce(jsonb_agg(distinct country order by country), '[]'::jsonb) from base where country is not null),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'active', (select count(*) from base where active),
      'inactive', (select count(*) from base where not active),
      'with_orders', (select count(distinct o.supplier_id) from public.purchase_orders o),
      'import', (select count(*) from base where type = 'IMPORT'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.suppliers_page(text, text, text, text, int, int) from public, anon;
grant execute on function public.suppliers_page(text, text, text, text, int, int) to authenticated;
