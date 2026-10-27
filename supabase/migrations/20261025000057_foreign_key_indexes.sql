-- Indexes for foreign keys that are looked up or joined often (found by the Supabase performance advisor).
-- Only lookup columns: the "created_by / updated_by / decided_by ..." person columns are left out on purpose
-- (they are written, almost never searched, and every extra index slows writes). Safe to run twice.
create index if not exists bill_lines_item_id_idx on public.bill_lines (item_id);
create index if not exists dispatch_events_dispatch_id_idx on public.dispatch_events (dispatch_id);
create index if not exists dispatches_job_id_idx on public.dispatches (job_id);
create index if not exists goods_receipt_lines_item_id_idx on public.goods_receipt_lines (item_id);
create index if not exists import_shipment_lines_po_line_id_idx on public.import_shipment_lines (po_line_id);
create index if not exists item_bins_bin_id_location_id_idx on public.item_bins (bin_id, location_id);
create index if not exists item_bins_item_id_idx on public.item_bins (item_id);
create index if not exists items_unit_idx on public.items (unit);
create index if not exists physical_count_lines_item_id_idx on public.physical_count_lines (item_id);
create index if not exists physical_counts_category_id_idx on public.physical_counts (category_id);
create index if not exists pick_pack_lines_item_id_idx on public.pick_pack_lines (item_id);
create index if not exists profiles_department_id_idx on public.profiles (department_id);
create index if not exists profiles_role_id_idx on public.profiles (role_id);
create index if not exists purchase_order_lines_item_id_idx on public.purchase_order_lines (item_id);
create index if not exists quality_check_lines_receipt_line_id_idx on public.quality_check_lines (receipt_line_id);
create index if not exists reorder_levels_location_id_idx on public.reorder_levels (location_id);
create index if not exists role_permissions_permission_key_idx on public.role_permissions (permission_key);
create index if not exists sales_order_lines_item_id_idx on public.sales_order_lines (item_id);
create index if not exists sales_return_events_return_id_idx on public.sales_return_events (return_id);
create index if not exists sales_return_lines_item_id_idx on public.sales_return_lines (item_id);
create index if not exists stock_entry_lines_item_id_idx on public.stock_entry_lines (item_id);
create index if not exists stock_transfer_lines_item_id_idx on public.stock_transfer_lines (item_id);
create index if not exists user_invites_department_id_idx on public.user_invites (department_id);
create index if not exists user_invites_role_id_idx on public.user_invites (role_id);
create index if not exists user_permissions_permission_key_idx on public.user_permissions (permission_key);
