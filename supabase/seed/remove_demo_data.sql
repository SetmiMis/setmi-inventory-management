-- REMOVE DEMO DATA, DEVELOPMENT ONLY. Run in the Supabase SQL editor as the project owner.
-- Deletes only things whose code / name starts with DEMO. Real items, locations and stock are not touched.
-- The stock history is normally impossible to delete (append-only trigger). This script switches that
-- trigger off for the length of the transaction, deletes ONLY the movements of DEMO items, and switches it on again.
-- NEVER run this on a database that holds real stock history for DEMO-named things.
begin;

alter table public.stock_movements disable trigger stock_movements_no_change;
delete from public.stock_movements
 where item_id in (select id from public.items where internal_item_code like 'DEMO-%')
    or from_location_id in (select id from public.locations where code like 'DEMO-%')
    or to_location_id   in (select id from public.locations where code like 'DEMO-%');
alter table public.stock_movements enable trigger stock_movements_no_change;

delete from public.stock_balances
 where item_id in (select id from public.items where internal_item_code like 'DEMO-%')
    or location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.reorder_levels
 where item_id in (select id from public.items where internal_item_code like 'DEMO-%')
    or location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.user_locations where location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.item_barcodes where item_id in (select id from public.items where internal_item_code like 'DEMO-%');
delete from public.items where internal_item_code like 'DEMO-%';
delete from public.locations where code like 'DEMO-%';
delete from public.categories where name like 'DEMO %';

commit;
