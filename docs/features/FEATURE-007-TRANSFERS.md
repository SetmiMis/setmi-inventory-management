# FEATURE-007: Stock transfers between places (P6)

**Status:** IMPLEMENTED 2026-10-25 (P6) using the plan's DEFAULTS, because the owner's answer message again contained only "1)". Not yet clicked through in a browser or tried with a real scanner.

## 0. What exists now (actual code)
- Defaults taken for the six questions: (1) different people send and receive, each at their own place; (2) a shortage is booked out as a visible loss with a required note; (3) any place may send to any place; (4) GST/e-way bill: NOT decided, the system prints only a plain dispatch note (owner must ask the accountant); (5) shop requests are not built; (6) "fill from minimum levels" is built.
- Migration 11 (`..._transit_enums.sql`): enum values `TRANSIT` (location type) and `TRANSFER_SHORTAGE` (movement type). Migration 12 (`..._transfers.sql`): hidden system place `IN-TRANSIT`, tables `stock_transfers` and `stock_transfer_lines`, permissions `transfers.view/create/send/receive`, functions `save_stock_transfer`, `send_stock_transfer`, `receive_stock_transfer`, `recall_stock_transfer`, `cancel_stock_transfer`, `transfer_destinations`, `suggest_transfer_lines`. DB tests `backend/supabase/tests/010_transfers.sql`: all 38 lines PASS.
- Money-free stock path: send = source -> IN-TRANSIT; receive = IN-TRANSIT -> destination; shortage = IN-TRANSIT -> outside (`TRANSFER_SHORTAGE`); recall = IN-TRANSIT -> source. All through the existing ledger, so "never negative" and the history work as before. The system place cannot be created twice, edited, deleted, given to a user, shown in lists, counted, or used by anything but transfers; only admins can read its balance.
- Names of both places are copied onto the transfer, so a sender can see the destination (and the receiver the source) without being allowed to read the other place's record.
- Screens: `/transfers` (list; status and direction filters), `/transfers/new` and `/transfers/[id]` (draft editor with scan, search and "fill from minimum levels"; Save draft, Save and send, Cancel draft), sent view with Recall (sender) or the Receive form (receiver: expected vs arrived, difference, optional "check by scanning" mode that starts counts at 0), received view showing sent vs arrived, `/transfers/[id]/print` (dispatch note, with a line that it is not a tax invoice).
- Stock history page labels: "Lost in transit" for shortage; transfer legs show "On the way".
- Not done: shop requests, a tax invoice/challan/e-way bill, partial receive in several steps, an "on the way" column on the stock page, stock per place including in-transit totals in a report (P8).
- Test note: tests 006-009 count rows and assume a database without demo data; with the demo data and the system place present some counts differ.

## 0a. Original plan (kept for reference)

## 1. Goal
Move stock from one place to another (warehouse to shop, shop to shop, shop back to warehouse) with a document and a visible "on the way" state, so that:
- the sending place's stock goes down when the goods leave,
- the receiving place's stock goes up only when the goods actually arrive,
- nothing disappears or doubles in between, and a shortage on arrival is recorded, not hidden.

## 2. What Odoo's docs showed (partial reading, see ROADMAP)
- Goods moving between sites pass through a **transit** holding place until received. Resupplying one warehouse from another is a standard route. Odoo's barcode app can **scan products to process a transfer**, and a transfer is **validated** to apply the moves. (Details of backorders and returns were not readable.)
- Reordering minimum/maximum per place is the trigger for "refill this shop".

## 3. Design (AI proposals)
**Document:** `stock_transfers` (number `TRF-000001`, from place, to place, status, notes, who/when) and `stock_transfer_lines` (item, quantity sent, quantity received).

**States:** `DRAFT` (editable, no stock effect) -> `SENT` (goods left; stock is "in transit") -> `RECEIVED` (closed). A draft can be `CANCELLED`; a SENT transfer can be **recalled** by the sender before it is received (goods go back to the sending place).

**In transit without new complexity:** one hidden system place "IN TRANSIT". Sending books `source -> IN TRANSIT`; receiving books `IN TRANSIT -> destination`. So the existing ledger, balances, "never negative" rule and history are reused as they are, every movement carries the transfer number, and the total of all places plus in-transit always adds up. In-transit stock is not shown as available at either end. The system place is hidden from location lists and cannot be assigned to users.

**Shortage on arrival:** the receiver enters what actually arrived. Less than sent is allowed (never more). The difference is booked out of "in transit" as a visible loss movement "Transfer shortage TRF-...", a note is required, and the transfer is marked as having a shortage. Nothing stays stuck in transit.

**Scanning (like Odoo's barcode transfers):** at the receiving screen, "check by scanning" starts the counts at 0; every scan adds one; the screen shows expected vs scanned per line so differences are obvious.

**Suggest from minimum levels (uses P4):** on a new transfer, a button fills the draft with the items below their minimum at the destination, quantity = maximum (or twice the minimum) minus what is there, capped at what the source has.

**Permissions (admin toggles):** `transfers.view`, `transfers.create` (prepare drafts at a place you work in as sender), `transfers.send`, `transfers.receive`. Sending needs access to the FROM place, receiving needs access to the TO place. A user who works in both places can do both.

**Rules enforced by the database (same style as receipts):** from and to differ and are real active places; quantities follow the unit's decimals; sending checks availability and names the short items; send/receive/recall lock the transfer so a double click cannot move stock twice; SENT and RECEIVED documents and their lines are immutable; no direct insert into the ledger; every step is in the audit log.

**Numbers** come from a sequence and can have gaps, as with receipts.

## 4. Screens
`/transfers` (list, filter by status, in/out), `/transfers/new` and `/transfers/[id]` (editor for drafts with scan and search, "suggest from low stock"), send button, receive screen (expected vs scanned vs received, shortage note), recall, A4 dispatch note print, and "in transit" numbers on the stock page.

## 5. Security notes
- Threats: sending stock out of a place you do not work in; receiving into the wrong place; receiving more than was sent; editing a sent document; double send. All handled by place-access checks and row locks in the database functions; tests will cover each.
- Shop staff see only transfers that start or end at their place.

## 6. Testing plan
DB tests (rolled-back SQL) for the above, unit tests for any new pure code, build checks; browser click-through by the owner on the demo places.

## 7. Questions for the owner
1. Are sending and receiving done by different people at the two places (assumed yes)? Who may send from the warehouse, who may receive in a shop?
2. If fewer pieces arrive than were sent: book the difference as a loss with a note (proposal), or keep it "still on the way" until someone resolves it?
3. May shops send to other shops directly, or always through the warehouse? (Proposal: any place to any place.)
4. **Tax paperwork:** do your warehouse and shops have different GSTINs or are they in different states? A transfer between different GSTINs can need a tax invoice or delivery challan and an e-way bill. Please check with your accountant; the system only prints a plain dispatch note until we know the rule.
5. Do you want a shop to place a **request** ("send me these") that the warehouse then turns into a transfer? (Proposal: later, not now.)
6. Do you want the "suggest from minimum levels" button? (Proposal: yes.)

## 8. After P6
P7 shop billing with barcode scan (SALE movements from the shop's stock) and P8 reports (stock by place, in-transit, low stock, movement history export).
