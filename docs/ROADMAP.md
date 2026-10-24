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
