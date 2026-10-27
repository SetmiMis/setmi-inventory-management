# FEATURE-005: Stock ledger, balances, counts (P4)

**Status:** IMPLEMENTED 2026-10-25 (P4a). Owner said: "dummy data se chalenge", "cable meter mein bikti hai", "haa" to minimum stock levels per item per location, and "develop it". Not yet clicked through in a browser.

## 0. What exists now (actual code)
- Migrations 7, 8, 9 (all applied): `20261025000007_stock.sql` (units, `stock_movements` append-only ledger, `stock_balances` kept by a trigger, `reorder_levels`, `apply_stock_count`, 4 new permissions), `...08_stock_overview.sql` (view `stock_overview`, security invoker), `...09_revoke_unit_guard_execute.sql` (advisor fix).
- DB tests: `backend/supabase/tests/007_stock.sql` 28/28 PASS, `008_stock_overview.sql` 4/4 PASS.
- Screens: `/stock` (list for the working place, search, "low stock only", min/max editor), `/stock/count` (count sheet, reason, "opening stock" tick; all-or-nothing), `/stock/movements` (history). The unit is chosen on the item form (dropdown from the units table).
- The place is always the user's current working location read on the server; it is never taken from the form.
- Unit tests `tests/stock.test.ts` (quantity parser). Total 25/25.
- Demo data: `backend/supabase/seed/demo_data.sql` (loaded into the dev project on 2026-10-25: 3 DEMO locations, 12 DEMO items incl. 2 sold per metre, 36 movements, a few items below minimum on purpose) and `backend/supabase/seed/remove_demo_data.sql` (tested: removes only DEMO- things, append-only trigger is switched back on).
- Not done: Excel import of counts (P4b), receipts (P5), transfers screen (P6, the ledger already supports them), sales (P7), a `unit` column in the Excel item import, a units admin screen (units can be added with SQL until then).

## 1. What Odoo's Inventory docs taught us, and what we do with it
(Partial reading, see ROADMAP "What we took from Odoo". Only ideas that fit a trading business with warehouses and shops.)

| Odoo idea | Our version in P4 |
|---|---|
| Stock is always tracked **per location** | `stock_balances(item, location, quantity)` |
| Every movement has a **from** and a **to**; suppliers, customers and losses are "virtual places" | `stock_movements(from_location, to_location)`; an empty end means "outside" (supplier, customer, loss/found). Later phases reuse the same table: RECEIPT, SALE, TRANSFER |
| **Inventory adjustment** = counted quantity vs on-hand; the difference is applied and recorded | `apply_stock_count()`: the user enters what they COUNTED; the database computes the difference and writes one ADJUSTMENT movement. Reason is required |
| Opening stock is loaded as an adjustment | Same function with kind OPENING (allowed only where the item has no history at that place) |
| **Reordering rule**: minimum (and maximum) per product per location | `reorder_levels(item, location, min, max)`; low-stock flag on the stock list. No automatic purchase orders |
| **Units of measure** | `units` table (PCS, MTR, BOX, SET, KG) with allowed decimals; item has a unit. Metres allow 3 decimals, pieces allow none |
| History report ("moves history") | `/stock/movements` for the current place |
| Odoo allows negative stock | **We refuse it** (a bad count can never create fake stock); can be relaxed later if shops need to bill before receiving |
| Not adopted: lots/serials, expiry, putaway, routes, picking waves, valuation methods | Too big for now |

## 2. Design (AI decisions, owner can change)
- **The ledger is the truth.** `stock_movements` is append-only (a database trigger refuses update and delete, even for admins). `stock_balances` is changed ONLY by a trigger that runs when a movement is inserted, so balance and ledger can never disagree. The balance cannot go below zero (database check).
- **Nobody writes stock directly.** Users have no insert/update/delete rights on the two tables. All changes go through database functions that check permission and the user's allowed locations.
- **Permissions** (admin toggles): `stock.view`, `stock.adjust`, `stock.min_levels`, `units.manage`. A user works only in the places assigned to them.
- **Quantities** are `numeric(14,3)`. The item's unit decides how many decimals are allowed (metres 3, pieces 0).
- **Count screen**: all items of the current place on one sheet, type counted numbers, only changed rows are sent; one reason for the whole sheet; all-or-nothing in one transaction.
- **Demo data**: `backend/supabase/seed/demo_data.sql` (dev only) creates DEMO locations, DEMO items and stock. Real data comes from the Excel import (items) and the count screen (stock).

## 3. Not in P4
Receiving from suppliers (P5), transfers (P6), billing (P7), reports and CSV export (P8), automatic purchase orders, units conversion (reel <-> metre), Excel import of counts (a natural P4b), location barcodes.

## 4. Security and failure notes
- Threat: a shop user changing another shop's stock -> RLS plus function check `can_access_location`; tested.
- Threat: editing history -> append-only trigger; tested.
- Threat: fake stock via decimals -> unit decimals enforced in the function; tested.
- Failure: two people count the same item at once -> the balance row is locked; the second count is applied on top of the first (its difference is computed from the latest balance), both are in the ledger.
- Limit: a count of one place can contain up to 500 rows per submit; the screen pages through items.

## 5. Open questions for the owner
1. **Which items are sold by the metre?** The finished cables in your sheet ("... CABLE 1.5 METER") look like pieces; metre items would be loose wire or bulk cable. Until you say, every item is PCS. (An item's unit can be changed on its page until it has stock.)
2. Reel to metre: if you buy a 90 m reel, do you enter 90 metres at receiving? (Proposal: yes, always enter metres; no conversion table.)
3. Should shops be allowed to bill when the system says zero stock? (Proposal: no, for now.)
4. Real minimum stock levels per item per place: later, on the stock screen.
