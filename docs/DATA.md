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

## Known gaps in this design
- (fixed by migration 3) archive-only users could edit other columns.
- `item_barcodes` and `categories` inserts are not blocked for archive-only users beyond RLS permission checks (barcodes need items.edit or items.create).
- Signups on Supabase Auth must be disabled in the dashboard. Defence in depth: new profiles are inactive.
- Admin creation of the first admin is a manual SQL step.

## Planned (not designed in detail)
`stock_movements` (append-only ledger), `stock_balances`, suppliers, goods receipts, transfers, bills. See `docs/ROADMAP.md`.
