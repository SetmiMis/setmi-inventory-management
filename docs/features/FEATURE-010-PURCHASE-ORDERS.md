# FEATURE-010: Purchase orders (P9)

**Status:** IMPLEMENTED 2026-10-25 (migrations 17, 18, 19 applied). Database tests pass (37 new lines, and the 32 older receiving lines still pass). The screens have not been clicked through in a browser yet (sign-in needed).
**Source of the idea:** the owner's repo `SetmiMis/erp` (see `docs/REFERENCE-ERP-REPO.md`). Rebuilt for this database. No tax (owner: later).

## 1. What the owner gets
- Screen `/purchase-orders`: list with status filter and a "Late" tag when the expected date has passed and goods are still due.
- New order: supplier, deliver-to place (the working place), order date, expected date, notes, items by scan or search, quantities, buying prices (only for people with `receipts.cost`).
- Flow: **Draft -> Sent -> Partly received -> Completed**, or **Cancelled** (before anything is received). A "close order" action ends a partly received order when the supplier will not send the rest (reason required).
- Print: an A4 page for the supplier (prices only if the person may see them).
- Receiving against an order: on the order page "Receive goods against this order", or on "New receipt" pick an open order. Supplier is fixed, quantities are pre-filled with what is still open, and the server refuses more than that. Posting the receipt updates the received quantities and the order status by itself.
- Receipts without an order still work exactly as before.

## 2. Permissions (admin toggles)
| Key | Allows |
|---|---|
| `purchase.view` | See orders of your places |
| `purchase.create` | Create and edit draft orders |
| `purchase.approve` | Send, cancel, close |
Prices need `receipts.cost` (same rule as receipts). Warehouse staff with `receipts.create` can see open orders of their place and what is still open (no prices) through two read-only helper functions, without any purchase permission.

## 3. Design (database)
- Tables `purchase_orders` (`PO-000001` from a sequence), `purchase_order_lines` (`quantity`, `received_qty`), `purchase_order_costs` (prices, own table behind `receipts.cost`). `goods_receipts.purchase_order_id` (optional).
- Triggers: status only moves forward (DRAFT -> SENT/CANCELLED, SENT -> PARTIAL/COMPLETED/CANCELLED, PARTIAL -> COMPLETED); after DRAFT the details cannot change; lines and prices of a sent order are frozen (only `received_qty` can go up, by posting a receipt); no deletes.
- Functions: `save_purchase_order`, `send_purchase_order`, `cancel_purchase_order`, `close_purchase_order` (all check permission and place), `save_goods_receipt` and `post_goods_receipt` extended, `receivable_purchase_orders`, `purchase_order_open_lines`.
- Posting re-checks the order under a lock, so two draft receipts that together would receive too much cannot both post (tested).
- Cancel is refused while a non-cancelled receipt exists against the order.

## 4. Rules that are assumptions (see ASSUMPTIONS.md)
- Over-receiving is refused, not allowed with a tolerance. If the supplier sends more, raise a new order or receive it without an order.
- One line per item per order.
- An order cannot be edited after sending; to change it, cancel (if nothing was received) and make a new one.

## 5. Limits
- No tax, no discount per line, no supplier acknowledgement step, no e-mail sending (print or share the PDF yourself).
- No quality check at receiving yet (see REFERENCE-ERP-REPO.md).
- The order shows the quantity received per line; it does not yet show a supplier-wise report of late orders.
- Browser check by the owner is still to do.

## 6. Independent review (ruflo verifier, 2026-10-25)
No money or stock defect found (double receiving, cancel racing with post, quantity drift, regressions in the two replaced receipt functions, permission checks, prices, injection: all checked by reading). Findings and what was done:
| Finding | Action |
|---|---|
| People with only purchase permissions could not read suppliers (empty supplier list, no supplier name on the order) | Fixed in migration 20: the supplier read rule also admits `purchase.view/create/approve` (tested Q1, Q2) |
| The receiving helper answered for DRAFT, CANCELLED or closed orders | Fixed in migration 20: only SENT or PARTIAL orders (tested Q3, Q4) |
| `save_goods_receipt` reads the order without a lock, so an order cancelled at the same instant can leave a draft receipt against a dead order | Not changed: no stock harm (posting refuses it), the draft can be cancelled by hand. Noted as a known small gap |
| Completing an order from SENT does not fill `closed_by` | Not changed: cosmetic (the audit log still records who posted the receipt) |

Note: people who create orders also need `items.view` (item search and names come from the items table) in addition to the purchase permissions.
