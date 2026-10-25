# ROADMAP: full project plan

**Status:** PLAN. Written 2026-10-24 by Claude Sonnet 5.5 after the owner said: plan the whole project, include warehouses and shops, build it, decide sensibly, change things after it is built.
Choices marked "AI decision" are mine and are logged in `docs/DECISIONS.md`; the owner can change them later.

## What the system is
A multi-user inventory + billing system for SETMI INDIA with several **warehouses** and **shops** (both are "locations"). Items come from LOCAL and IMPORT suppliers, are received into locations, moved between them, and sold at shops using barcode scanning.

## Core design (AI decisions)
1. **One `locations` table**, with type `WAREHOUSE` or `SHOP`. Stock, transfers and sales all point to a location. Adding a location needs no code change.
2. **Stock ledger is the truth.** Every change in quantity is one append-only row in `stock_movements` (receipt, sale, transfer out/in, adjustment). Current stock per item per location (`stock_balances`) is updated in the same database transaction. Quantity is never edited by hand.
3. **All stock-changing operations are Postgres functions (transactions).** They lock rows, refuse negative stock, and write the ledger + audit row together. The app never updates balances directly.
4. **Permission toggles** (owner decision): `permissions` catalog + `user_permissions`. **Location scope** (AI decision): `user_locations` says which warehouses/shops a user can work in, so a shop user sees only their shop.
5. **Deny by default.** RLS on every table. Write access only through functions or policies that call `has_permission()`.
6. **Bills store a snapshot** of the item's `Selling_Item_Name`, price and quantity, so later edits never change old bills.
7. **Archive, never delete** items and locations.
8. Quantity type `numeric(12,3)` and `items.unit` (default `PCS`), because cables may be sold by meter. AI decision, easy to restrict later.

## What we took from Odoo's Inventory documentation (read 2026-10-25, owner's request)
Pages read through a fetch tool, in my own words. Coverage is partial: several pages were only tables of contents and long pages were cut near the end (adjustment details, backorders, reordering triggers were NOT readable). Where a point below says "general knowledge", it did not come from the page.
- **Warehouse record** = full name + short code (Odoo: up to 5 characters, shown on documents) + address. We already have `code`; P3 adds a length limit.
- **Locations can nest** (shelf inside zone inside warehouse) and Odoo has **virtual places**: vendor, customer, transit, inventory loss. Idea we adopt: every stock movement has a "from" and a "to"; a receipt comes from "outside (supplier)", a sale goes to "outside (customer)", a loss or count correction goes to/from "loss". Our ledger (P4) will store movement type + from/to location, where an empty end means "outside".
- **Transit**: goods moving between sites are in a holding state until received. Our transfers (P6) will have status draft -> sent -> received, and stock "in transit" is shown per transfer.
- **Inventory adjustment** = physical count vs on-hand quantity, the difference is applied, products with negative stock still show up (P4: count screen, reason required, difference becomes an ADJUSTMENT movement).
- **Receipts and deliveries**: a receipt is checked against the purchase order and "validated" to become Done; a delivery mirrors it. One-step (receive straight into stock) is the simple default; two or three steps are for large operations. We start with one-step (P5, P7).
- **Reordering rules**: minimum (and maximum) stock per item per location; below minimum, refill. We take the minimum/maximum per item per location for the low-stock report (P8); automatic purchase orders are out of scope.
- **Barcodes**: Odoo accepts any text as a barcode; EAN-13 for retail normally needs a GS1 company prefix (this matches our choice of the internal "2" range); variants should carry their own barcodes; **locations can have barcodes** too (print and scan to say "I am putting this on shelf A"). Location barcodes are a later option for P4-P6.
- **Units and packaging** matter for cables (metres, reels, boxes). Open question for the owner (see below); not in P4.
- **Barcode app lessons (read 2026-10-25, partial):** scanners type like a keyboard and end with Enter; each scan of a product adds one; 100 ms guard against double scans; match keyboard layouts; print 1D barcodes, do not scan them off a screen; locations and "command" barcodes exist; package barcodes add a whole pack. Adopted: scan-to-count (`/stock/scan`), scan guard and feedback, setup checklist. Later ideas: location barcodes, "pieces per scan" barcodes, phone-camera scanning. Details in `docs/features/FEATURE-003-BARCODE.md`.
- Not adopted (too big for a trading shop for now): lots/serial numbers, expiry dates, putaway rules, storage categories, routes, batch/wave picking, carrier integrations, landed costs.

## Phases

| Phase | Content | Needs from owner |
|---|---|---|
| P0 | Base app, docs, git (done, commit `370f412`) | none |
| P1 | Foundation: Supabase connection, login, profiles, permission system, admin user page, audit log, app shell | first admin's email |
| P2 | Item Master: categories, items, barcodes, images/datasheet storage, list/search/add/edit/archive, Excel import | sample Excel |
| P3 | Locations: warehouses and shops, user-to-location access | location names |
| P4 | Stock ledger and balances, stock view per location, manual adjustment (with reason) | none |
| P5 | Purchase receiving (suppliers, goods receipt into a location) | supplier list |
| P6 | Transfers: warehouse to shop, shop to shop, with in-transit status | none |
| P7 | Shop billing: barcode scan, customer (minimal), bill, stock deduction, print | GST/invoice rules (see below) |
| P8 | Reports and dashboard: stock by location, low stock, movement history, CSV export | none |
| P9 | Hardening: automated tests, security review, release review, deployment | approval to deploy |

## Open business questions (they do not block P1-P4)
- **GST / tax invoice format and invoice numbering** (blocks P7 final design). Needs the accountant's rules; a wrong format has legal impact.
- Returns and credit notes (sales return, supplier return).
- Price: is there one selling price per item, or per location/customer? (P7)
- Reorder levels per item/location (P8).
- Opening stock: how will current stock be loaded? (P4/P5)

## Things the AI will NOT do without the owner's explicit yes
Push to GitHub, deploy to Vercel, change DNS, create paid Supabase resources, touch other Supabase projects (CRM, store, system-master), put secrets in code or docs.

## Testing approach
Each phase: lint, typecheck, build, plus database tests for permission and stock rules (unauthorized user denied, negative stock refused, duplicate codes refused). Evidence goes in `docs/TESTING.md`.

## Review by role (2026-10-25, before P8)
Seen from each seat, with what exists and what is still missing.
| Seat | Needs | Status |
|---|---|---|
| Owner / boss | Daily and weekly numbers, trust that stock is right, control of who can do what | Reports (P8) done; permission toggles, audit log, counts done. Missing: stock valuation, ABC analysis, purchase orders, supplier returns |
| Manager | Reorder what is low, approve transfers, see differences after counts | Low-stock and slow-stock reports done; transfers with shortage done. Missing: purchase orders from the low-stock list, approval step for large adjustments |
| Shop staff | Fast scan billing, no mistakes, a printed receipt | Billing done (switch OFF until Zoho is retired); needs a real-hardware test. Missing: sales return with credit note, customer list |
| Warehouse staff | Receive against a supplier invoice, scan-count, send transfers | Done. Missing: put-away places (bins); batch/serial numbers if ever needed |
| DevOps | Repeatable release, rollback, secrets safe, monitoring | `docs/DEPLOYMENT.md`, security headers, `.env.example`, rollback notes done. Missing: CI pipeline, error tracking, CSP, a production Supabase project |
Suggested order after P8: browser test by the owner, then GST and returns (needs the accountant), purchase orders, then deployment.
