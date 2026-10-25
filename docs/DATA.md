# DATA

**Status:** both migrations were APPLIED on 2026-10-24 to Supabase project `arvdzlsimnofguwxkzev` (migration names `foundation`, `item_master`). Verified: 9 tables with RLS enabled, 9 permission rows. Database tests: 20/20 pass (`docs/TESTING.md`). Security advisor: 7 WARN, all "authenticated can execute SECURITY DEFINER function"; accepted because `admin_*` functions check `is_admin()` inside and the helpers only report on the caller. Note: the applied migration versions in Supabase carry their own timestamps; the repo files are the source text.

Target project: Supabase `setmi-inventory-management` (ref `arvdzlsimnofguwxkzev`, region ap-southeast-2). Checked read-only on 2026-10-24: no tables, no migrations. Other Supabase projects (CRM, store, system-master) must not be touched.

## Migration 1: `20261024000001_foundation.sql`
| Table | Purpose | Who can read | Who can write |
|---|---|---|---|
| `profiles` | One row per login. `is_active` (default false), `is_admin`. | Own row; admins read all | Nobody directly. `handle_new_user` trigger inserts. Changes only through `admin_*` functions |
| `permissions` | Catalog of permission keys (items.view, items.create, ...) | Any signed-in user | Migrations only |
| `user_permissions` | Which user has which toggle on | Own rows; admins | `admin_set_user_permissions()` (admin only) |
| `locations` | Warehouses and shops (`type` WAREHOUSE or SHOP), unique code | Users with access to that location; `locations.manage` sees all | `locations.manage` |
| `user_locations` | Which locations a user may work in | Own rows; admins | `admin_set_user_locations()` (admin only) |
| `audit_log` | Append-only record of changes (who, what, old/new) | `audit.view` | Triggers and admin functions only; no update or delete policy |

Functions: `is_admin()`, `has_permission(key)`, `can_access_location(id)`, `log_audit()`, `set_updated_at()`, `handle_new_user()`, `admin_set_user_active/admin/permissions/locations`.
All use `set search_path = ''`; execute is revoked from `anon`.

## Migration 2: `20261024000002_item_master.sql`
| Table | Key points |
|---|---|
| `categories` | Managed list, unique name (case-insensitive). Read: `items.view`. Write: `categories.manage` |
| `items` | `internal_item_code` required + unique (case-insensitive, trimmed). `import_item_code` optional, unique when filled. `item_name` and `selling_item_name` required. `purchase_source` LOCAL or IMPORT. `unit` default PCS. `image_paths` max 4, `datasheet_path`. `is_active` for archive. No delete policy |
| `item_barcodes` | One item, many barcodes. `barcode` globally unique, exact match. |

Storage bucket `item-files`: private, 10 MB cap, JPEG/PNG/WebP/PDF only. Read needs `items.view`; write needs `items.edit`. Per-type limits (5 MB image) are enforced in the app server.

Trigger `items_guard`: changing `selling_item_name` needs `items.edit_selling_name`; changing `is_active` needs `items.archive`.
Indexes: unique code indexes; trigram (pg_trgm) indexes for partial-word search on names and code.

## Migration 3: `20261024000003_item_guards.sql` (applied 2026-10-24)
- `created_by` defaults to `auth.uid()` on items, item_barcodes, locations.
- `items_guard_update` now: forces `updated_by` to the caller, keeps `created_by`/`created_at` unchangeable, and blocks a user who has only `items.archive` from editing any field except `is_active`. Tests: `supabase/tests/002_item_guards.sql`, 7/7 pass.

## Migration 4: `20261024000004_barcode_generation.sql` (applied 2026-10-24)
- Sequence `item_barcode_seq` (no rights for app users). Function `ean13_check_digit(text)`. Function `generate_item_barcode(uuid)` (security definer, needs `items.edit`, advisory lock per item so a double click cannot create two, returns existing generated barcode, writes audit row). Column `item_barcodes.is_generated`.
- Generated format: `2` + 11 digits + check digit. Tests: `supabase/tests/004_barcode_generation.sql`, 13/13 pass.

## Migration 5: `20261024000005_import_items.sql` (applied 2026-10-24)
- `_generate_item_barcode(uuid)` (internal, no rights for users) and `generate_item_barcode` now uses it (same behaviour).
- `import_items(p_rows jsonb, p_dry_run, p_skip_invalid, p_generate_barcodes)`: security definer, needs `items.import`; max 2000 rows; uses temporary tables inside one transaction; returns counts, errors (row, column, message) and new categories. New categories need `categories.manage`. Tests `supabase/tests/005_import_items.sql`: 16/16 pass.

## Migration 6: `20261025000006_location_guards.sql` (applied 2026-10-25)
- Checks: `locations_code_len` (<= 20), `locations_name_len` (<= 100), `locations_address_len` (<= 500). Trigger `locations_guard`: `updated_by` = caller, `created_by`/`created_at` cannot change. Tests `supabase/tests/006_locations.sql`: 17/17 pass.

## Migrations 7, 8, 9 (applied 2026-10-25): stock
- `units(code, name, decimals)`: PCS 0, MTR 3, BOX 0, SET 0, KG 3. `items.unit` now references it. Trigger `items_unit_guard` blocks a unit change after the item has movements. Writes need `units.manage`.
- `stock_movements(id, item_id, from_location_id, to_location_id, quantity > 0, movement_type, reason, reference, created_at, created_by)`: types OPENING, ADJUSTMENT, RECEIPT, SALE, TRANSFER. At least one place; the two places differ. Append-only (trigger refuses update and delete). No insert/update/delete policy: only `apply_stock_count` (and later receipt/transfer/sale functions) write.
- `stock_balances(item_id, location_id, quantity >= 0)`: changed only by trigger `stock_movements_apply` after each movement; a movement that would make it negative fails with "Not enough stock".
- `reorder_levels(item_id, location_id, min_qty, max_qty)`: writes need `stock.min_levels` and access to the place.
- `apply_stock_count(location, rows, reason, kind)`: needs `stock.adjust` and access to the place; validates every row first (item exists, 0..99,999,999, decimals allowed by the unit, opening only where no history), writes nothing if any row is bad; locks the balance row; one movement per changed item; audit row.
- View `stock_overview` (security invoker): one row per active item and active place with quantity, min, max, low flag; empty for users without `stock.view`.
- Reads: `stock.view` plus access to the place (RLS). Admins see all.
- Tests: `supabase/tests/007_stock.sql` 28/28, `008_stock_overview.sql` 4/4.

## Migration 10: `20261025000010_receiving.sql` (applied 2026-10-25): suppliers and goods receipts
- `suppliers` (name unique ignoring case, type LOCAL/IMPORT, contact, phone, email, address, country, GSTIN 15 upper-case letters/digits, notes, is_active). Read: `suppliers.view`, `receipts.view`, `receipts.create` or `receipts.post`. Write: `suppliers.manage`.
- `goods_receipts` (receipt_no `GRN-000001` from a sequence, supplier, location, date, supplier invoice no., notes, status DRAFT/POSTED/CANCELLED, who/when, posted_at/by). Unique supplier + invoice number except cancelled. Read: a receipts permission plus access to the place. Triggers make posted/cancelled rows immutable and forbid deletes.
- `goods_receipt_lines` (receipt, item, quantity > 0, one line per item) and `goods_receipt_costs` (line, unit_cost >= 0; read only with `receipts.cost`). Lines and prices are locked once the receipt is not a draft.
- Writes only through `save_goods_receipt` (needs `receipts.create`, place access, validates every line, replaces lines of the draft), `post_goods_receipt` (needs `receipts.post`, locks the receipt, inserts RECEIPT movements with reference = number, sets POSTED, audit), `cancel_goods_receipt` (draft only).
- Tests: `supabase/tests/009_receiving.sql`.

## Migrations 11 and 12 (applied 2026-10-25): transfers
- Enum values: `location_type` + `TRANSIT`; `stock_movement_type` + `TRANSFER_SHORTAGE` (separate migration because a new enum value cannot be used in the transaction that adds it).
- System place: one row in `locations` with type TRANSIT, code `IN-TRANSIT` (unique partial index). Trigger `locations_protect_transit` stops users creating or changing it; trigger `user_locations_no_transit` stops assigning it; trigger `stock_movements_transit_guard` lets only TRANSFER and TRANSFER_SHORTAGE touch it and makes a shortage leave it. View `stock_overview` excludes it.
- `stock_transfers` (TRF-000001 from a sequence, from/to place ids and copied code/name, status, notes, shortage flag and note, who/when for create/send/receive) and `stock_transfer_lines` (item, quantity_sent, quantity_received). Flow trigger: finished transfers are frozen, a sent one can only be received or recalled, no deletes; lines are frozen once sent except filling in quantity_received.
- Read: any transfers permission plus access to the from OR to place. Writes only through the functions listed in FEATURE-007 section 0.
- Tests: `supabase/tests/010_transfers.sql` (38 lines).

## Migrations 13 and 14 (applied 2026-10-25): billing
- Enum value `stock_movement_type` + `SALE_RETURN` (own migration).
- `app_settings(key, value)`: key limited to `billing_enabled`; value `false` by default; readable by signed-in users; changed only by `admin_set_billing_enabled` (admin). Function `billing_enabled()`.
- `items.selling_price numeric(14,2)` (optional). Trigger `items_guard_update` extended: price needs `items.edit_price`; a price-only user cannot change other columns. The update policy now also allows `items.edit_price`.
- `bills`, `bill_lines` (see FEATURE-008): immutable by triggers, no delete, no direct write policy; `create_bill` and `void_bill` are the only writers; read needs a bills permission plus access to the place.
- Permissions added: `items.edit_price`, `bills.view`, `bills.create`, `bills.void`, `bills.override_price`.
- Tests: `supabase/tests/011_billing.sql` (37 lines).
- `remove_demo_data.sql` does NOT yet remove bills of DEMO places (bills are locked by triggers): if you make test bills at a DEMO shop, void them and ask the AI to extend the script before cleaning up.

## Known gaps in this design
- (fixed by migration 3) archive-only users could edit other columns.
- `item_barcodes` and `categories` inserts are not blocked for archive-only users beyond RLS permission checks (barcodes need items.edit or items.create).
- Signups on Supabase Auth must be disabled in the dashboard. Defence in depth: new profiles are inactive.
- Admin creation of the first admin is a manual SQL step.

## Planned (not designed in detail)
`stock_movements` (append-only ledger), `stock_balances`, suppliers, goods receipts, transfers, bills. See `docs/ROADMAP.md`.

## Migrations 15 and 16 (applied 2026-10-25): reports
- Permissions `reports.view`, `reports.export`.
- Functions (security invoker, read-only, max 20,000 rows): `report_stock_by_place(location)`, `report_low_stock(location)`, `report_sales_by_day(from, to, location)`, `report_sales_by_item(from, to, location)`, `report_dead_stock(days, location)`. Each refuses without `reports.view`; stock reports also need `stock.view`, sales reports `bills.view`; rows follow the existing row rules. Tests `supabase/tests/012_reports.sql` (19 lines). Details: FEATURE-009.

## Migrations 17, 18, 19 (applied 2026-10-25): purchase orders
- Enum `po_status`; permissions `purchase.view`, `purchase.create`, `purchase.approve`.
- `purchase_orders` (PO-000001 from a sequence, supplier, place, dates, notes, status, who/when for send and close), `purchase_order_lines` (quantity, received_qty, one line per item), `purchase_order_costs` (prices, read only with `receipts.cost`). `goods_receipts.purchase_order_id` (optional).
- Triggers: forward-only status, sent orders frozen, no deletes. Read rules need a purchase permission plus access to the place. Writes only through `save/send/cancel/close_purchase_order`; `save_goods_receipt` and `post_goods_receipt` were extended (receipts against an order, quantities checked and updated under a lock).
- Migration 18 fixes the price guard so a draft can replace its lines. Migration 19 adds `receivable_purchase_orders()` and `purchase_order_open_lines(id)` (read-only, no prices) for warehouse staff.
- Tests `supabase/tests/013_purchase_orders.sql` (37 lines); the older `009_receiving.sql` (32 lines) still passes. Details: FEATURE-010.

- Migration 20 (review fixes): the suppliers read rule also admits `purchase.*`; `purchase_order_open_lines` answers only for SENT or PARTIAL orders. Tests `supabase/tests/014_po_review_fixes.sql` (4 lines, PASS).

## Migrations 21 and 22 (applied 2026-10-25): dashboard
- `dashboard_data(from, to, place)`: read-only, security invoker, returns JSON with the parts the caller may see (sales, stock, purchase, receipts, transfers). Migration 22: the stock part needs `stock.view` and `items.view` (without items.view it returned zeros, found by the test). Tests `supabase/tests/015_dashboard.sql` (10 lines). Details: FEATURE-013.
