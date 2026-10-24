# FEATURE-006: Suppliers and goods receipts (P5)

**Status:** IMPLEMENTED 2026-10-25 (P5a) using the plan's DEFAULTS, because the owner's answer message contained only "1)" with no content. Every default below can be changed. Not yet clicked through in a browser or tried with a real scanner.

## 0. What exists now (actual code)
- Defaults taken for the seven questions: (1) no purchase orders, receipts only; (2) supplier = name, type, contact person, phone, email, address, country, GSTIN, notes; (3) buying price optional, entered in rupees, visible only with `receipts.cost`; (4) one running number `GRN-000001`; (5) no landed cost; (6) receiving is allowed in any place the user works in (warehouse or shop); (7) damaged goods: enter only the good quantity, correct later with a stock count.
- Migration 10 (`20261025000010_receiving.sql`, applied): tables `suppliers`, `goods_receipts`, `goods_receipt_lines`, `goods_receipt_costs` (prices live in their own table so the database hides them), sequence for numbers, permissions `suppliers.view`, `suppliers.manage`, `receipts.view`, `receipts.create`, `receipts.post`, `receipts.cost`, functions `save_goods_receipt`, `post_goods_receipt`, `cancel_goods_receipt`. DB tests `supabase/tests/009_receiving.sql`: all 32 lines PASS (see TESTING).
- Rules enforced by the database: draft has no stock effect; posting writes RECEIPT movements in one transaction and cannot happen twice; posted/cancelled receipts, their lines and prices can never change or be deleted (even for the project owner); the same supplier invoice cannot be received twice (a cancelled one does not count); archived items/suppliers refused; quantities follow the unit's decimals; people without `receipts.cost` cannot see prices and, when editing a draft, keep the existing prices.
- Screens: `/suppliers` (list, new, edit, archive), `/receipts` (list, status filter), `/receipts/new` and `/receipts/[id]` (editor: supplier, date, invoice no., notes, scan box with 100 ms guard + beep, search by code/name for items without barcode, quantity and price per line, Save draft, "Save and post", Cancel draft), `/receipts/[id]/print` (A4), `/receipts/[id]/labels` (one sticker per received piece for whole-number items that have an EAN-13 barcode; others are listed as skipped).
- Needs `items.view` too: the editor looks items up through the items table.
- GRN numbers can have gaps (a database sequence never rolls back, e.g. after a failed save or the test runs). Treat the number as an identifier, not as a gap-free invoice series. If the owner needs gap-free numbers this must be redesigned (tell the AI).
- Not done: purchase orders, returns to suppliers, landed cost, supplier Excel import, "receive" from a transfer (P6), a unit column in the item import.

## 0a. Original plan (kept for reference)

## 1. Goal
Record goods that arrive from suppliers (LOCAL or IMPORT) into a warehouse or shop, so stock goes up with a proper document: who supplied, when, which invoice, how much of each item. Receiving is also where new stickers (barcode labels) are printed.

## 2. What Odoo's Inventory docs showed (partial reading; see ROADMAP)
- A **receipt** is a document for incoming goods; **validating** it moves it to Done and puts the goods in stock. A delivery mirrors it.
- Receipts normally come from a **purchase order** (quantity ordered vs quantity received, partial deliveries become "backorders"). Those pages were cut off, so details are general knowledge, not read.
- **One-step** receipt (straight into stock) is the simple setup; two/three-step (inspect, then store) is for big warehouses.
- Odoo's barcode app lets staff **scan products** while receiving (read in the Barcode docs 2026-10-25): each scan adds one to the line, a pencil lets you type a quantity or use +1/-1, a package barcode adds everything inside, and **Validate** applies the stock moves. Our receiving screen will follow the same pattern as our new `/stock/scan` screen (scan adds one, 100 ms double-scan guard, beep, red message for an unknown barcode, quantity editable, nothing changes stock until Post).

## 3. What we build (P5a) and what we leave (P5b)
| Part | In P5a | Later |
|---|---|---|
| Supplier list (name, type LOCAL/IMPORT, contact, phone, email, address, GSTIN for Indian suppliers, notes, archive) | yes | |
| Goods receipt (GRN): header + lines, DRAFT then POSTED | yes | |
| Scan a barcode to add / increase a line | yes | |
| Print labels for the received quantities | yes (uses the existing label page) | |
| Printable receipt (A4) | yes | |
| Cost price per line (optional) | yes, visible only with its own permission | landed cost, currency conversion |
| Purchase orders (ordered vs received, partial deliveries) | no | P5b, if the owner wants it |
| Return to supplier / damaged on arrival | no (use a stock count correction with a reason) | P5c |
| Putaway, inspection step | no | not planned |

## 4. Design (AI proposals)
- **Two tables:** `goods_receipts` (number, supplier, place, receipt date, supplier invoice no./date, notes, status DRAFT/POSTED/CANCELLED, who/when) and `goods_receipt_lines` (receipt, item, quantity, optional unit cost). Suppliers in `suppliers`.
- **DRAFT has no effect on stock.** It can be edited and cancelled.
- **POST** (one database function, one transaction): locks the receipt, checks it is still DRAFT, checks every quantity against the item's unit decimals, writes one RECEIPT movement per line (from outside to the place; the ledger already supports it) and marks it POSTED. Posting twice is impossible.
- **POSTED receipts are never edited or deleted.** A wrong receipt is corrected by a stock count with a reason (visible in history). This keeps the audit trail honest.
- **Receipt number** from a database sequence (`GRN-000001`), assigned at save, never reused.
- **Place:** only a place the user works in (same rule as stock counts). Receiving into a shop is allowed if the owner wants (question 6).
- **Permissions (admin toggles):** `suppliers.view`, `suppliers.manage`, `receipts.view`, `receipts.create` (drafts), `receipts.post`, `receipts.view_cost`. Splitting create and post lets one person prepare and another confirm. Cost is hidden from users without `receipts.view_cost` (shop staff should not see buying prices).
- **Barcode at receiving:** scan -> existing exact-match lookup -> add 1 (or increase). If the barcode is unknown, the screen says so (no silent item creation).
- **Failure cases handled in design:** double click on Post; two people posting the same receipt; item archived after drafting (post is refused with a clear message); supplier archived (old receipts keep it); quantity zero or negative; more than 500 lines.

## 5. Security notes
- Tables: RLS with `can_access_location` for receipts; no direct insert into the ledger (posting is the only way).
- Cost columns protected by a separate permission, enforced in the database (a view or column rule), not only hidden on screen.
- Supplier GSTIN and phone are business data; visible with `suppliers.view` only.
- Tests to write: viewer cannot create; creator cannot post without `receipts.post`; post twice fails; posted receipt cannot be changed; shop user cannot receive into another shop; cost hidden without permission; unit decimals; all-or-nothing on post.

## 6. Testing plan
DB tests (rolled-back SQL) for the rules above; unit tests for new pure code (quantity lines parser, receipt number format); browser click-through by the owner on demo data.

## 7. Questions for the owner
1. Do you want purchase orders in the system (order, then receive against it), or only record receipts when goods arrive? (Proposal: receipts first; orders later only if needed.)
2. Which supplier details do you need? (Proposal: name, type, contact person, phone, email, address, GSTIN, notes.)
3. Record the buying price on each receipt line? In which currency for imports, and who may see it? (Proposal: optional, in rupees, only people with the cost permission.)
4. Receipt numbers: one running number `GRN-000001`, or restart each financial year (April-March)?
5. Imports: containers come in parts and with customs/freight costs. Do you need landed cost now? (Proposal: no, later.)
6. Can shops receive goods directly from suppliers, or only warehouses (then warehouse sends to shops by transfer, P6)?
7. Damaged on arrival: record only the good quantity received, and handle damage outside the system for now? (Proposal: yes.)

## 8. After P5
P6 transfers (warehouse to shop, in-transit state), then P7 billing with barcode scan (stock goes down with a SALE movement), P8 reports.
