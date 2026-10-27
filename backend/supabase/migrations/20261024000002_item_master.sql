-- Item Master: categories, items, barcodes, private storage bucket.
-- Depends on 20261024000001_foundation.sql (has_permission, log_audit, set_updated_at).

create extension if not exists pg_trgm with schema extensions;

-- ---------- categories (managed list; owner has not decided list vs free text) ----------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name_uq on public.categories (lower(btrim(name)));
alter table public.categories enable row level security;
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.log_audit();

-- ---------- items ----------
create type public.purchase_source as enum ('LOCAL', 'IMPORT');

create table public.items (
  id                 uuid primary key default gen_random_uuid(),
  internal_item_code text not null check (btrim(internal_item_code) <> ''),
  -- Optional. Some items have one, some do not (owner decision D-012).
  import_item_code   text check (import_item_code is null or btrim(import_item_code) <> ''),
  item_name          text not null check (btrim(item_name) <> ''),
  -- Name printed on customer bills (owner decision D-008). Required.
  selling_item_name  text not null check (btrim(selling_item_name) <> ''),
  category_id        uuid references public.categories (id) on delete restrict,
  purchase_source    public.purchase_source not null,
  -- AI decision: cables may be counted in metres. Default PCS.
  unit               text not null default 'PCS' check (btrim(unit) <> ''),
  remarks            text,
  -- Storage object paths inside bucket item-files. Max 4 images, 1 datasheet.
  image_paths        text[] not null default '{}' check (cardinality(image_paths) <= 4),
  datasheet_path     text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.profiles (id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id)
);
create unique index items_internal_code_uq on public.items (lower(btrim(internal_item_code)));
create unique index items_import_code_uq on public.items (lower(btrim(import_item_code)))
  where import_item_code is not null;
create index items_category_idx on public.items (category_id);
-- Search by name / code with partial words.
create index items_name_trgm on public.items using gin (lower(item_name) extensions.gin_trgm_ops);
create index items_selling_trgm on public.items using gin (lower(selling_item_name) extensions.gin_trgm_ops);
create index items_code_trgm on public.items using gin (lower(internal_item_code) extensions.gin_trgm_ops);
alter table public.items enable row level security;

create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger items_audit after insert or update or delete on public.items
  for each row execute function public.log_audit();

-- Column-level rules that a plain RLS update policy cannot express.
-- Enforced only for signed-in end users; server-side admin jobs (no auth.uid()) skip it.
create or replace function public.items_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  if new.selling_item_name is distinct from old.selling_item_name
     and not (select public.has_permission('items.edit_selling_name')) then
    raise exception 'missing permission: items.edit_selling_name' using errcode = '42501';
  end if;
  if new.is_active is distinct from old.is_active
     and not (select public.has_permission('items.archive')) then
    raise exception 'missing permission: items.archive' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger items_guard before update on public.items
  for each row execute function public.items_guard_update();

-- ---------- barcodes (one item, many barcodes; a barcode value belongs to ONE item) ----------
create table public.item_barcodes (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items (id) on delete restrict,
  barcode    text not null check (btrim(barcode) <> ''),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);
-- Exact match, case-sensitive: scanners send exact strings.
create unique index item_barcodes_barcode_uq on public.item_barcodes (barcode);
create index item_barcodes_item_idx on public.item_barcodes (item_id);
alter table public.item_barcodes enable row level security;
create trigger item_barcodes_audit after insert or update or delete on public.item_barcodes
  for each row execute function public.log_audit();

-- ---------- RLS ----------
create policy categories_select on public.categories for select to authenticated
  using ((select public.has_permission('items.view')) or (select public.has_permission('categories.manage')));
create policy categories_insert on public.categories for insert to authenticated
  with check ((select public.has_permission('categories.manage')));
create policy categories_update on public.categories for update to authenticated
  using ((select public.has_permission('categories.manage')))
  with check ((select public.has_permission('categories.manage')));

create policy items_select on public.items for select to authenticated
  using ((select public.has_permission('items.view')));
create policy items_insert on public.items for insert to authenticated
  with check ((select public.has_permission('items.create')));
create policy items_update on public.items for update to authenticated
  using ((select public.has_permission('items.edit')) or (select public.has_permission('items.archive')))
  with check ((select public.has_permission('items.edit')) or (select public.has_permission('items.archive')));
-- No delete policy on purpose: items are archived, never deleted (D-009).

create policy item_barcodes_select on public.item_barcodes for select to authenticated
  using ((select public.has_permission('items.view')));
create policy item_barcodes_insert on public.item_barcodes for insert to authenticated
  with check ((select public.has_permission('items.edit')) or (select public.has_permission('items.create')));
create policy item_barcodes_delete on public.item_barcodes for delete to authenticated
  using ((select public.has_permission('items.edit')));

-- ---------- storage: private bucket for images and datasheets ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-files', 'item-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy item_files_select on storage.objects for select to authenticated
  using (bucket_id = 'item-files' and (select public.has_permission('items.view')));
create policy item_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-files' and (select public.has_permission('items.edit')));
create policy item_files_update on storage.objects for update to authenticated
  using (bucket_id = 'item-files' and (select public.has_permission('items.edit')))
  with check (bucket_id = 'item-files' and (select public.has_permission('items.edit')));
create policy item_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-files' and (select public.has_permission('items.edit')));
