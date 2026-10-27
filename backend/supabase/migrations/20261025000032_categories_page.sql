-- Product Categories screen (owner's mock): a short code and a description for each category, and one call that
-- returns a page of categories with their product count and a picture taken from their first product that has one.
-- The two new columns are optional, so every existing category stays valid.
alter table public.categories
  add column if not exists code text,
  add column if not exists description text;

alter table public.categories
  drop constraint if exists categories_code_format,
  drop constraint if exists categories_description_len;
alter table public.categories
  add constraint categories_code_format check (code is null or code ~ '^[A-Z0-9][A-Z0-9-]{0,11}$'),
  add constraint categories_description_len check (description is null or char_length(description) <= 300);

-- A code belongs to one category (upper case, so "con" and "CON" are the same).
create unique index if not exists categories_code_uq on public.categories (code) where code is not null;

create or replace function public.categories_page(
  p_q text default null,
  p_status text default null,   -- all | active | inactive
  p_sort text default null,     -- name_asc | name_desc | newest | products
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
  if not public.has_permission('categories.manage') then
    raise exception 'You do not have permission to manage categories' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('', 'all', 'active', 'inactive') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_sort is not null and p_sort not in ('', 'name_asc', 'name_desc', 'newest', 'products') then
    raise exception 'Unknown sort' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select c.id, c.code, c.name, c.description, c.is_active as active, c.created_at, c.updated_at,
           (select count(*) from public.items i where i.category_id = c.id) as products,
           (select i.image_paths[1] from public.items i
             where i.category_id = c.id and cardinality(i.image_paths) > 0 order by i.created_at limit 1) as image
      from public.categories c
  ),
  filtered as (
    select b.* from base b
     where (coalesce(p_status, '') in ('', 'all') or (p_status = 'active' and b.active) or (p_status = 'inactive' and not b.active))
       and (coalesce(p_q, '') = '' or b.name ilike v_like or coalesce(b.code, '') ilike v_like or coalesce(b.description, '') ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.ord), '[]'::jsonb) from (
               select f.*, row_number() over (order by
                   case when p_sort = 'name_desc' then f.name end desc,
                   case when p_sort = 'newest' then f.created_at end desc,
                   case when p_sort = 'products' then f.products end desc,
                   case when coalesce(p_sort, '') in ('', 'name_asc') then f.name end asc,
                   f.name) as ord
                 from filtered f order by ord limit v_limit offset v_offset) t),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'active', (select count(*) from base where active),
      'inactive', (select count(*) from base where not active),
      'products', (select count(*) from public.items),
      'new_categories', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date),
      'new_products', (select count(*) from public.items i where (i.created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.categories_page(text, text, text, int, int) from public, anon;
grant execute on function public.categories_page(text, text, text, int, int) to authenticated;
