-- Trigger functions run because of the trigger; users never need EXECUTE on them.
revoke all on function public.items_unit_guard() from public, anon, authenticated;
