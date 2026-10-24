-- Hardening for Item Master before the UI is built.
-- 1. created_by / updated_by are filled by the database, so a client cannot fake them.
-- 2. A user who may only archive cannot edit other item fields (gap listed in DATA.md).
-- 3. created_by / created_at cannot be changed after insert.

alter table public.items         alter column created_by set default auth.uid();
alter table public.item_barcodes alter column created_by set default auth.uid();
alter table public.locations     alter column created_by set default auth.uid();

create or replace function public.items_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- No signed-in end user (server-side admin job): leave the row as given.
  if (select auth.uid()) is null then
    return new;
  end if;

  new.updated_by := (select auth.uid());
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if new.selling_item_name is distinct from old.selling_item_name
     and not (select public.has_permission('items.edit_selling_name')) then
    raise exception 'missing permission: items.edit_selling_name' using errcode = '42501';
  end if;

  if new.is_active is distinct from old.is_active
     and not (select public.has_permission('items.archive')) then
    raise exception 'missing permission: items.archive' using errcode = '42501';
  end if;

  -- Anything other than the archive flag needs items.edit.
  if not (select public.has_permission('items.edit'))
     and (to_jsonb(new) - 'is_active' - 'updated_at' - 'updated_by')
         is distinct from
         (to_jsonb(old) - 'is_active' - 'updated_at' - 'updated_by') then
    raise exception 'missing permission: items.edit' using errcode = '42501';
  end if;

  return new;
end $$;
