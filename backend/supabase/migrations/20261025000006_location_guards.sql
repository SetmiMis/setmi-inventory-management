-- Locations: sensible length limits, and the database (not the app) fills who changed a row.

alter table public.locations
  add constraint locations_code_len check (char_length(btrim(code)) <= 20),
  add constraint locations_name_len check (char_length(btrim(name)) <= 100),
  add constraint locations_address_len check (address is null or char_length(address) <= 500);

create or replace function public.locations_guard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.updated_by := (select auth.uid());
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

create trigger locations_guard before update on public.locations
  for each row execute function public.locations_guard_update();
