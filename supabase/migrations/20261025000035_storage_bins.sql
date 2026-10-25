-- Locations (Racks): the shelves and bins inside a warehouse or shop.
-- This is MASTER DATA about where things are kept. It does NOT change the stock ledger: stock is still counted per
-- warehouse or shop. A bin's "current stock" is the warehouse stock of the products assigned to that bin
-- (a product sits in at most one bin per place). Depends on 20261024000001_foundation.sql.

create table public.storage_bins (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations (id) on delete restrict,
  rack         text not null check (rack ~ '^[A-Z0-9]{1,6}$'),
  level        text not null check (level ~ '^[A-Z0-9]{1,6}$'),
  bin_no       text not null check (bin_no ~ '^[A-Z0-9]{1,6}$'),
  -- Made by a trigger from the place code and the three parts, for example WH01-A-01-01.
  code         text not null,
  bin_type     text not null default 'BIN' check (bin_type in ('BIN', 'SHELF', 'PALLET')),
  -- Units the bin can hold (optional).
  capacity     numeric(12,3) check (capacity is null or (capacity >= 0 and capacity <= 1000000000)),
  is_blocked   boolean not null default false,
  block_reason text check (block_reason is null or char_length(block_reason) <= 200),
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id),
  constraint storage_bins_code_uq unique (code),
  constraint storage_bins_id_location_uq unique (id, location_id)
);
create index storage_bins_location_idx on public.storage_bins (location_id);

create table public.item_bins (
  id          uuid primary key default gen_random_uuid(),
  bin_id      uuid not null,
  location_id uuid not null,
  item_id     uuid not null references public.items (id) on delete restrict,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id),
  foreign key (bin_id, location_id) references public.storage_bins (id, location_id) on delete restrict,
  -- a product sits in one bin per place
  constraint item_bins_one_per_place_uq unique (location_id, item_id)
);
create index item_bins_bin_idx on public.item_bins (bin_id);

-- The code and "who changed it" are filled in by the database, not by the app.
create or replace function public.storage_bins_before_write()
returns trigger language plpgsql set search_path = '' as $$
declare v_place text;
begin
  select l.code into v_place from public.locations l where l.id = new.location_id;
  if v_place is null then raise exception 'Unknown place' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' or new.rack is distinct from old.rack or new.level is distinct from old.level
     or new.bin_no is distinct from old.bin_no or new.location_id is distinct from old.location_id then
    new.code := upper(regexp_replace(btrim(v_place), '\s+', '', 'g')) || '-' || new.rack || '-' || new.level || '-' || new.bin_no;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.storage_bins_before_write() from public, anon, authenticated;
create trigger storage_bins_write before insert or update on public.storage_bins
  for each row execute function public.storage_bins_before_write();
create trigger storage_bins_audit after insert or update or delete on public.storage_bins
  for each row execute function public.log_audit();

create or replace function public.item_bins_before_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := (select auth.uid());
  return new;
end $$;
revoke execute on function public.item_bins_before_insert() from public, anon, authenticated;
create trigger item_bins_write before insert on public.item_bins
  for each row execute function public.item_bins_before_insert();
create trigger item_bins_audit after insert or update or delete on public.item_bins
  for each row execute function public.log_audit();

alter table public.storage_bins enable row level security;
alter table public.item_bins enable row level security;

create policy storage_bins_select on public.storage_bins for select to authenticated
  using ((select public.can_access_location(location_id)) or (select public.has_permission('locations.manage')));
create policy storage_bins_insert on public.storage_bins for insert to authenticated
  with check ((select public.has_permission('locations.manage')));
create policy storage_bins_update on public.storage_bins for update to authenticated
  using ((select public.has_permission('locations.manage'))) with check ((select public.has_permission('locations.manage')));

create policy item_bins_select on public.item_bins for select to authenticated
  using ((select public.can_access_location(location_id)) or (select public.has_permission('locations.manage')));
create policy item_bins_insert on public.item_bins for insert to authenticated
  with check ((select public.has_permission('locations.manage')));
-- Moving a product out of a bin is not history (the stock ledger is untouched), so it may be deleted.
create policy item_bins_delete on public.item_bins for delete to authenticated
  using ((select public.has_permission('locations.manage')));

revoke all on public.storage_bins, public.item_bins from anon;
grant select, insert, update on public.storage_bins to authenticated;
grant select, insert, delete on public.item_bins to authenticated;

-- One call for the Locations (Racks) screen. Runs as the caller (SECURITY INVOKER).
create or replace function public.bins_page(
  p_q text default null,
  p_location uuid default null,
  p_rack text default null,
  p_status text default null,    -- all | occupied | available | blocked
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
  if p_status is not null and p_status not in ('', 'all', 'occupied', 'available', 'blocked') then
    raise exception 'Unknown status filter' using errcode = 'P0001';
  end if;
  if p_rack is not null and p_rack <> '' and p_rack !~ '^[A-Z0-9]{1,6}$' then
    raise exception 'Unknown rack' using errcode = 'P0001';
  end if;
  v_like := '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select b.id, b.code, b.location_id, l.code as place_code, l.name as place_name, l.city, b.rack, b.level, b.bin_no,
           b.bin_type as type, b.capacity, b.is_blocked as blocked, b.created_at,
           coalesce(a.items, 0) as items, coalesce(a.qty, 0) as qty,
           case when b.is_blocked then 'blocked' when coalesce(a.qty, 0) > 0 then 'occupied' else 'available' end as status,
           case when b.capacity is not null and b.capacity > 0 then round(coalesce(a.qty, 0) * 100.0 / b.capacity) end as utilization
      from public.storage_bins b
      join public.locations l on l.id = b.location_id
      left join (select ib.bin_id, count(*) as items, sum(coalesce(so.quantity, 0)) as qty
                   from public.item_bins ib
                   left join public.stock_overview so on so.item_id = ib.item_id and so.location_id = ib.location_id
                  group by ib.bin_id) a on a.bin_id = b.id
  ),
  filtered as (
    select x.* from base x
     where (p_location is null or x.location_id = p_location)
       and (coalesce(p_rack, '') = '' or x.rack = p_rack)
       and (coalesce(p_status, '') in ('', 'all') or x.status = p_status)
       and (coalesce(p_q, '') = '' or x.code ilike v_like or x.place_name ilike v_like or x.rack ilike v_like
            or exists (select 1 from public.item_bins ib join public.items i on i.id = ib.item_id
                        where ib.bin_id = x.id and (i.internal_item_code ilike v_like or i.item_name ilike v_like)))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.code), '[]'::jsonb)
               from (select * from filtered order by code limit v_limit offset v_offset) t),
    'racks', (select coalesce(jsonb_agg(distinct rack order by rack), '[]'::jsonb) from base where p_location is null or location_id = p_location),
    'places', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name) order by name), '[]'::jsonb)
                 from public.locations where type <> 'TRANSIT' and is_active),
    'kpi', jsonb_build_object(
      'total', (select count(*) from base),
      'occupied', (select count(*) from base where status = 'occupied'),
      'available', (select count(*) from base where status = 'available'),
      'blocked', (select count(*) from base where status = 'blocked'),
      'new_month', (select count(*) from base where (created_at at time zone 'Asia/Kolkata')::date >= date_trunc('month', v_today)::date)))
  into v_result;
  return v_result;
end $$;

revoke execute on function public.bins_page(text, uuid, text, text, int, int) from public, anon;
grant execute on function public.bins_page(text, uuid, text, text, int, int) to authenticated;
