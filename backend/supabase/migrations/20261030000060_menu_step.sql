-- DRAFT, NOT APPLIED (needs the owner's yes). "Start simple, step by step": the administrator chooses how much of the menu people see.
--   Step 1 products, stock, stock in/out, low stock | 2 + suppliers, goods inward, racks | 3 + transfers, ledger, counts, quality check | 4 everything.
-- It only decides what the menu shows. It does NOT block a page (permissions do that) and it deletes nothing.
-- Default is 4 = everything, so running this changes nothing until the administrator picks a lower step.

alter table public.app_settings drop constraint app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check check (key ~ '^(billing_enabled|menu_step|company\.[a-z_]{2,30})$');

insert into public.app_settings (key, value) values ('menu_step', to_jsonb(4)) on conflict (key) do nothing;

-- Anybody signed in may read the step (the menu needs it); a missing or odd value means 4.
create or replace function public.menu_step()
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(value) = 'number' and (value #>> '{}')::int between 1 and 4 then (value #>> '{}')::int end
                     from public.app_settings where key = 'menu_step'), 4);
$$;
revoke execute on function public.menu_step() from public, anon;
grant execute on function public.menu_step() to authenticated;

create or replace function public.admin_set_menu_step(p_step int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_step is null or p_step not between 1 and 4 then raise exception 'The step must be 1, 2, 3 or 4' using errcode = 'P0001'; end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('menu_step', to_jsonb(p_step), now(), (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = (select auth.uid());
end $$;
revoke execute on function public.admin_set_menu_step(int) from public, anon;
grant execute on function public.admin_set_menu_step(int) to authenticated;
