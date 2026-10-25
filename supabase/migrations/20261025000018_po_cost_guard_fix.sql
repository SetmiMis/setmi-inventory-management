-- Fix for 20261025000017 found by supabase/tests/013_purchase_orders.sql:
-- when the lines of a DRAFT order are replaced, the database deletes the price rows by cascade at a moment when
-- the line is already gone, so the status lookup found nothing and the guard wrongly refused. A missing parent
-- on a DELETE is now allowed (the line deletion itself is guarded: drafts only).
create or replace function public.purchase_order_costs_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status public.po_status;
begin
  select o.status into v_status from public.purchase_order_lines l join public.purchase_orders o on o.id = l.po_id
   where l.id = coalesce(new.line_id, old.line_id);
  if v_status is null and tg_op = 'DELETE' then
    return old;
  end if;
  if v_status is distinct from 'DRAFT' then
    raise exception 'The prices of a sent purchase order cannot be changed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
