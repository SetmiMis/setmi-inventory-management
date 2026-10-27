-- Warehouses screen (owner's mock): optional city, capacity and contact details on a warehouse or shop, and one call
-- that returns a page of places with how many products are in stock there and how full they are.
-- "Capacity" means the number of product slots (bins) the place has; a product with stock uses one slot.
-- Quantities of different units (pieces, metres, boxes) are never added together.
-- All new columns are optional, so every existing place stays valid. Runs as the caller (SECURITY INVOKER).
alter table public.locations
  add column if not exists city text,
  add column if not exists capacity integer,
  add column if not exists contact_person text,
  add column if not exists phone text,
  add column if not exists email text;

alter table public.locations
  drop constraint if exists locations_city_len,
  drop constraint if exists locations_capacity_range,
  drop constraint if exists locations_contact_len,
  drop constraint if exists locations_phone_len,
  drop constraint if exists locations_email_len;
alter table public.locations
  add constraint locations_city_len check (city is null or char_length(city) <= 60),
  add constraint locations_capacity_range check (capacity is null or (capacity >= 0 and capacity <= 10000000)),
  add constraint locations_contact_len check (contact_person is null or char_length(contact_person) <= 100),
  add constraint locations_phone_len check (phone is null or char_length(phone) <= 30),
  add constraint locations_email_len check (email is null or char_length(email) <= 150);

create or replace function public.locations_page(
  p_q text default null,
  p_type text default null,      -- WAREHOUSE | SHOP
  p_status text default null,    -- all | active | inactive
  p_city text default null,
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
  if p_status is not null and p_status not in ('', 'all', 'active', 'inactive') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_type is not null and p_type not in ('', 'WAREHOUSE', 'SHOP') then
    raise exception 'Unknown type filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select l.id, l.code, l.name, l.type::text as type, l.address, l.city, l.capacity, l.contact_person, l.phone, l.email,
           l.is_active as active, l.created_at,
           coalesce(s.products, 0) as products,
           case when l.capacity is not null and l.capacity > 0 then round(coalesce(s.products, 0) * 100.0 / l.capacity) end as utilization
      from public.locations l
      left join (select so.location_id, count(*) filter (where so.quantity > 0) as products
                   from public.stock_overview so group by so.location_id) s on s.location_id = l.id
     where l.type <> 'TRANSIT'
  ),
  filtered as (
    select b.* from base b
     where (coalesce(p_type, '') = '' or b.type = p_type)
       and (coalesce(p_status, '') in ('', 'all') or (p_status = 'active' and b.active) or (p_status = 'inactive' and not b.active))
       and (coalesce(p_city, '') = '' or b.city = p_city)
       and (coalesce(p_q, '') = '' or b.name ilike v_like or b.code ilike v_like or coalesce(b.city, '') ilike v_like
            or coalesce(b.address, '') ilike v_like or coalesce(b.contact_person, '') ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.type desc, t.name), '[]'::jsonb)
               from (select * from filtered order by type desc, name limit v_limit offset v_offset) t),
    'cities', (select coalesce(jsonb_agg(distinct city order by city), '[]'::jsonb) from base where city is not null),
    'by_place', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'products', products) order by name), '[]'::jsonb)
                   from base where active),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'warehouses', (select count(*) from base where type = 'WAREHOUSE'),
      'shops', (select count(*) from base where type = 'SHOP'),
      'active', (select count(*) from base where active),
      'capacity', (select coalesce(sum(capacity), 0) from base where active),
      'products', (select coalesce(sum(products), 0) from base where active),
      'products_with_capacity', (select coalesce(sum(products), 0) from base where active and capacity > 0),
      'avg_utilization', (select round(avg(utilization)) from base where active and utilization is not null),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.locations_page(text, text, text, text, int, int) from public, anon;
grant execute on function public.locations_page(text, text, text, text, int, int) to authenticated;
