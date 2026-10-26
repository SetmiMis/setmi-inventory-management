-- REMOVE DEMO DATA, DEVELOPMENT ONLY. Run in the Supabase SQL editor as the project owner.
-- Deletes only things whose code / name starts with DEMO. Real items, locations and stock are not touched.
-- Stock history, goods receipts and transfers are normally impossible to delete (append-only / locked
-- triggers). This script switches those triggers off for the length of the transaction, deletes ONLY rows
-- that belong to DEMO items or DEMO locations, and switches them on again before it commits.
-- NEVER run this on a database that holds real history for DEMO-named things.
begin;

alter table public.stock_movements disable trigger stock_movements_no_change;
delete from public.stock_movements
 where item_id in (select id from public.items where internal_item_code like 'DEMO-%')
    or from_location_id in (select id from public.locations where code like 'DEMO-%')
    or to_location_id   in (select id from public.locations where code like 'DEMO-%');
alter table public.stock_movements enable trigger stock_movements_no_change;

-- quality checks of those receipts (lines go with them)
delete from public.quality_checks
 where receipt_id in (select id from public.goods_receipts where location_id in (select id from public.locations where code like 'DEMO-%'));

-- goods receipts that belong to a DEMO place (lines and prices go with them)
alter table public.goods_receipts disable trigger goods_receipts_no_change;
alter table public.goods_receipt_lines disable trigger goods_receipt_lines_guard;
alter table public.goods_receipt_costs disable trigger goods_receipt_costs_guard;
delete from public.goods_receipts where location_id in (select id from public.locations where code like 'DEMO-%');
alter table public.goods_receipt_costs enable trigger goods_receipt_costs_guard;
alter table public.goods_receipt_lines enable trigger goods_receipt_lines_guard;
alter table public.goods_receipts enable trigger goods_receipts_no_change;

-- import shipments of those orders (items, history and charges go with them)
delete from public.import_shipments
 where po_id in (select id from public.purchase_orders
                  where location_id in (select id from public.locations where code like 'DEMO-%')
                     or supplier_id in (select id from public.suppliers where name like 'DEMO %'));

-- purchase orders for a DEMO place or a DEMO supplier (lines and prices go with them)
alter table public.purchase_orders disable trigger purchase_orders_flow_guard;
alter table public.purchase_order_lines disable trigger purchase_order_lines_guard;
alter table public.purchase_order_costs disable trigger purchase_order_costs_guard;
delete from public.purchase_orders
 where location_id in (select id from public.locations where code like 'DEMO-%')
    or supplier_id in (select id from public.suppliers where name like 'DEMO %');
alter table public.purchase_order_costs enable trigger purchase_order_costs_guard;
alter table public.purchase_order_lines enable trigger purchase_order_lines_guard;
alter table public.purchase_orders enable trigger purchase_orders_flow_guard;

-- transfers that start or end at a DEMO place
alter table public.stock_transfers disable trigger stock_transfers_flow_trg;
alter table public.stock_transfer_lines disable trigger stock_transfer_lines_flow_trg;
delete from public.stock_transfers
 where from_location_id in (select id from public.locations where code like 'DEMO-%')
    or to_location_id   in (select id from public.locations where code like 'DEMO-%');
alter table public.stock_transfer_lines enable trigger stock_transfer_lines_flow_trg;
alter table public.stock_transfers enable trigger stock_transfers_flow_trg;

delete from public.stock_balances
 where item_id in (select id from public.items where internal_item_code like 'DEMO-%')
    or location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.reorder_levels
 where item_id in (select id from public.items where internal_item_code like 'DEMO-%')
    or location_id in (select id from public.locations where code like 'DEMO-%');
-- racks and bins of DEMO places (and the products placed in them)
delete from public.item_bins where location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.storage_bins where location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.user_locations where location_id in (select id from public.locations where code like 'DEMO-%');
delete from public.item_barcodes where item_id in (select id from public.items where internal_item_code like 'DEMO-%');
delete from public.items where internal_item_code like 'DEMO-%';
delete from public.locations where code like 'DEMO-%';
delete from public.categories where name like 'DEMO %';
delete from public.suppliers where name like 'DEMO %';
-- DEMO customers that no bill points at (a customer with a bill must stay: bills are history)
delete from public.customers where name like 'DEMO %' and id not in (select customer_id from public.bills where customer_id is not null);

commit;
