-- Stock Ledger screen (owner's mock): one call that returns a page of ledger lines. One line = one movement at one place
-- (a transfer gives two lines: out at the sender, in at the receiver; the system "in transit" place is not shown).
-- Every line has the in quantity or out quantity and the balance of that product in that place right after the movement.
-- Runs as the caller (SECURITY INVOKER): row-level security decides which movements and places are visible. The ledger itself is
-- append-only and nothing here can change it.

-- A short display name ("Amit K.") for the User column. People cannot read each other's profiles (row rules), so this small
-- helper gives out ONLY first name + initial of the last name, and only to people who may see stock.
create or replace function public.person_name(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when public.has_permission('stock.view') then
    (select case when coalesce(nullif(btrim(full_name), ''), '') = '' then split_part(email, '@', 1)
                 when array_length(regexp_split_to_array(btrim(full_name), '\s+'), 1) > 1
                   then (regexp_split_to_array(btrim(full_name), '\s+'))[1] || ' ' || left((regexp_split_to_array(btrim(full_name), '\s+'))[array_length(regexp_split_to_array(btrim(full_name), '\s+'), 1)], 1) || '.'
                 else btrim(full_name) end
       from public.profiles where id = p_id) end;
$$;
revoke execute on function public.person_name(uuid) from public, anon;
grant execute on function public.person_name(uuid) to authenticated;

create or replace function public.stock_ledger_page(
  p_q text default null,
  p_category uuid default null,
  p_location uuid default null,
  p_type text default null,      -- all | OPENING | RECEIPT | SALE | SALE_RETURN | TRANSFER | TRANSFER_SHORTAGE | ADJUSTMENT | STOCK_OUT
  p_from date default null,
  p_to date default null,
  p_limit int default 15,
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
  v_limit int := least(greatest(coalesce(p_limit, 15), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not public.has_permission('stock.view') then
    raise exception 'You do not have permission to see stock' using errcode = '42501';
  end if;
  if p_type is not null and p_type not in ('', 'all', 'OPENING', 'RECEIPT', 'SALE', 'SALE_RETURN', 'TRANSFER', 'TRANSFER_SHORTAGE', 'ADJUSTMENT', 'STOCK_OUT') then
    raise exception 'Unknown type filter' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with raw as (
    select m.id, m.created_at, m.movement_type::text as typ, m.reference, m.reason, m.created_by, m.item_id, m.to_location_id as location_id, m.quantity as delta
      from public.stock_movements m where m.to_location_id is not null
    union all
    select m.id, m.created_at, m.movement_type::text, m.reference, m.reason, m.created_by, m.item_id, m.from_location_id, -m.quantity
      from public.stock_movements m where m.from_location_id is not null
  ),
  lines as (
    select r.*, l.name as place_name,
           sum(r.delta) over (partition by r.item_id, r.location_id order by r.id rows between unbounded preceding and current row) as balance
      from raw r join public.locations l on l.id = r.location_id and l.type <> 'TRANSIT'
  ),
  base as (
    select ln.id, ln.created_at, ln.typ, ln.reference, ln.reason, ln.item_id, ln.location_id, ln.place_name, ln.delta, ln.balance,
           case when ln.delta > 0 then ln.delta end as in_qty, case when ln.delta < 0 then -ln.delta end as out_qty,
           ln.created_by,
           i.internal_item_code as code, i.item_name, i.unit, c.id as category_id
      from lines ln join public.items i on i.id = ln.item_id left join public.categories c on c.id = i.category_id
  ),
  filtered as (
    select b.* from base b
     where (p_category is null or b.category_id = p_category)
       and (p_location is null or b.location_id = p_location)
       and (coalesce(p_type, '') in ('', 'all') or b.typ = p_type)
       and (p_from is null or (b.created_at at time zone 'Asia/Kolkata')::date >= p_from)
       and (p_to is null or (b.created_at at time zone 'Asia/Kolkata')::date <= p_to)
       and (coalesce(p_q, '') = '' or b.code ilike v_like or b.item_name ilike v_like or b.reference ilike v_like or b.reason ilike v_like or b.place_name ilike v_like)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc, t.id desc), '[]'::jsonb)
               from (select f.*, public.person_name(f.created_by) as user_name
                       from (select * from filtered order by created_at desc, id desc limit v_limit offset v_offset) f) t),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.categories),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from public.locations where is_active and type <> 'TRANSIT'),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'in', (select coalesce(sum(in_qty), 0) from base),
      'out', (select coalesce(sum(out_qty), 0) from base),
      'transfer', (select coalesce(sum(out_qty), 0) from base where typ = 'TRANSFER'),
      'adjust', (select coalesce(sum(abs(delta)), 0) from base where typ = 'ADJUSTMENT'),
      'return', (select coalesce(sum(in_qty), 0) from base where typ = 'SALE_RETURN')))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.stock_ledger_page(text, uuid, uuid, text, date, date, int, int) from public, anon;
grant execute on function public.stock_ledger_page(text, uuid, uuid, text, date, date, int, int) to authenticated;
