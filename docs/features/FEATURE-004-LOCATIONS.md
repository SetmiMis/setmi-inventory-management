# FEATURE-004: Locations (warehouses and shops), P3

**Status:** IMPLEMENTED 2026-10-25 (owner said "haa"). Not yet clicked through in a browser. The owner's answers to section 7 were not given (names/codes of the places), so the AI used the proposals; the owner creates the real locations on the screen.

## 0. What exists now (actual code)
- Screens: `/locations` (list, filters type and status), `/locations/new`, `/locations/[id]` (edit, archive/restore, and for admins the list of users who work there). Needs `locations.manage` to create or edit; everyone else only sees their own places.
- Migration 6 (`20261025000006_location_guards.sql`, applied): length limits (code 20, name 100, address 500); `updated_by` forced to the caller, `created_by`/`created_at` locked. DB tests `backend/supabase/tests/006_locations.sql`: 17/17 pass (duplicate code, limits, manager can create/archive, no delete, shop user sees only the assigned shop and cannot create or edit, unassigned sees nothing, non-admin cannot assign, anonymous sees nothing, audit rows).
- Working location: `lib/location.ts` (`getMyLocations`, `getCurrentLocation`), header shows the place (or a switcher if the user has several). The choice is a cookie that is accepted only if it is one of the user's own places (checked in the `switchLocation` action and again on every read). Admins can work in every active location; others only in the assigned ones.
- Validation `lib/validation/location.ts` (code: letters, numbers, space and - _ . /; max 20) with unit tests `tests/location.test.ts`.
- Not done on purpose: stock (P4), racks/bins, GST details, the rule "type cannot change once stock exists" (needs the stock table from P4), location barcodes (idea from Odoo, later).

## 1. Goal
Create and manage the places where stock lives: **warehouses** and **shops**. Every later module (stock, receiving, transfers, billing) points at a location. Also decide which user may work in which location (a shop user sees only their own shop).

## 2. What already exists (verified in the migrations, 2026-10-24)
- Table `locations`: `code` (unique, case-insensitive), `name`, `type` (WAREHOUSE or SHOP), `address`, `is_active`, who/when created and updated. RLS on. Audit trigger on.
- Table `user_locations` (user <-> location) and function `admin_set_user_locations` (admin only). The admin Users page already shows location checkboxes.
- Rules: a user sees a location if they are admin, are assigned to it, or hold `locations.manage`. Only `locations.manage` can create or edit locations. Nothing can be deleted (no delete policy).
- Not built: any screen to create, list or edit locations. So today the Users page says "No locations created yet".

## 3. Scope of P3 (small)
1. `/locations` list: code, name, type, address, status; filter by type and active/archived.
2. `/locations/new` and `/locations/[id]` edit form (needs `locations.manage`).
3. Archive and restore (never delete).
4. Rules in the database (a small migration): `type` cannot be changed after the location is used by stock (enforced in P4 when stock exists; for now the form warns); a location with users assigned can still be archived but the Users page shows it as archived.
5. Nav link "Locations" for users who can see any location.
6. Users page: archived locations are hidden in the checkboxes (already filters active only).
7. A "current location" choice for the signed-in user (needed by P4-P7): if the user has one location it is automatic, with several it is a switcher in the header. Stored in a cookie, validated against `user_locations` on the server each time (never trusted).

Out of scope: stock quantities (P4), racks or bins inside a warehouse, GST details (P7).

## 4. Design choices (AI proposals, owner can overrule)
| Choice | Why | Alternative rejected |
|---|---|---|
| One `locations` table with a `type` | Adding a location needs no code change; transfers between any two places use the same shape | Separate warehouse and shop tables: every later module would need two versions |
| Location `code` is typed by the owner (like item codes), e.g. `WH-MAIN`, `SHOP-01` | Matches how the owner works with item codes; unique, short | Auto numbers: less readable on reports and labels |
| Archive, never delete | Old stock movements and bills must still point to the place | Hard delete: breaks history |
| Current location kept in a validated cookie | Billing and stock screens need one "where am I working" value | Asking for location on every screen: slow for shop staff |
| Racks and bins left for later | Not requested; easy to add as a child table when the owner needs it | Building it now: unused complexity |

## 5. Security
- Create and edit need `locations.manage`; every server action calls `requirePermission` and RLS checks it again.
- A user can only select a current location they are assigned to; the cookie value is re-checked against `user_locations` on every request.
- Changes are in the audit log (trigger already exists).
- Tests to write: viewer cannot create; shop user sees only their shop; unassigned user cannot switch to another shop; duplicate code refused; archive and restore need the permission.

## 6. Testing plan
DB tests (rolled back SQL, like the others), unit tests for any new pure code (code format), build checks. Browser click-through by the owner.

## 7. Questions for the owner
1. How many warehouses and how many shops now? Names and the short codes you want (e.g. WH-MAIN, SHOP-01)?
2. Does each shop have its own address, phone, GSTIN and bill number series? (They will be needed on bills. Proposal: add them in P7, when billing is designed with the accountant's rules; P3 keeps only name, code, type, address.)
3. Should one user be able to work in several locations (e.g. a manager for two shops)? (Proposal: yes, with a switcher.)
4. Do you need racks/bins inside a warehouse soon? (Proposal: later.)
5. Who is allowed to create locations? (Proposal: admins only, through the `locations.manage` toggle.)

## 8. Next step after P3
P4: stock ledger and balances per item per location, manual stock adjustment with a reason, and the stock view for the current location. This is where `type` and `code` of a location become frozen once stock exists.
