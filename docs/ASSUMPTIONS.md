# ASSUMPTIONS and open questions

Status: UNVERIFIED, VERIFIED or REJECTED. (Owner answers of 2026-10-24 are recorded below.)

| ID | Item | Status | Needed to close |
|---|---|---|---|
| A-001 | `Item_Name` means the internal/stock-side name | UNVERIFIED | Owner confirmation |
| A-002 | `Selling_Item_Name` is required, prefilled from `Item_Name` | VERIFIED (owner: "haa") | none |
| A-003 | One selling name per item (not per customer) | UNVERIFIED | Owner decision, can be added later |
| A-004 | `Selling_Item_Name` uniqueness | UNVERIFIED | Not asked yet. Two items may legitimately print the same name; no constraint for now |
| A-005 | Access control = admin panel with per-user permission toggles; fixed roles not used | VERIFIED (owner). Exact permission list UNVERIFIED | Defined in the auth task |
| A-006 | `Internal_Item_Code` is manual (VERIFIED). Changeable after creation? | OPEN | Owner decision |
| A-007a | `Import_item_code` is optional (some items have it, some do not); unique when filled; not forced by purchase source | VERIFIED (owner) | none |
| A-007b | A barcode value belongs to exactly one item, like standard barcode billing systems | VERIFIED (owner) | none |
| A-007c | One item may have several barcodes (separate barcodes table) | UNVERIFIED (AI proposal, owner answer not specific) | Owner confirms |
| A-008 | Category: fixed list or free text | OPEN ("don't know right now") | Owner decision. Schema must stay flexible until then |
| A-009 | Image and datasheet limits (types, sizes) | UNVERIFIED | Owner decision |
| A-010 | GitHub repo is private (owner-stated) | UNVERIFIED | `ls-remote` worked without a prompt, which shows access but not visibility |
| A-011 | Supabase project for IMS is `setmi-inventory-management` (ref `arvdzlsimnofguwxkzev`), separate from the CRM project | VERIFIED (owner confirmed 2026-10-24) | none |
| A-012 | Existing Excel data is imported; manual entry also supported | VERIFIED (owner). Row count and exact format UNVERIFIED | Owner shares count/sample |
| A-013 | `Sr No` is display only | VERIFIED (owner's brief) | none |
| A-014 | Archive only, no real delete | VERIFIED (owner: "haa") | none |
| A-015 | Users are not decided yet | OPEN | Owner, before auth task |

## P9 rules to confirm with the owner (2026-10-25)
- Over-receiving against a purchase order is refused (no tolerance). Is a small excess (for example 5 percent) normal for your suppliers?
- A sent purchase order cannot be edited. Is cancel and re-make acceptable?
- Who may send orders: only people with `purchase.approve`. Should a manager approve large orders first (an amount limit)?

## Usability pass: to confirm with the owner (2026-10-25)
- Language: owner answered "both". Phase 1 done (shell + Help in English and Hindi, see FEATURE-012). Still open: who checks the Hindi words, and which working screens to translate first.
- Who are the first real users and which jobs do they do most? The home page order can then be adjusted per role.

## G1/G2 rules to confirm with the owner (2026-10-25)
- Reorder: the sheet Apps Script rule is unknown; we use Max Level = average daily use x lead time x safety factor (sheet formula) and order = Max Level - (stock + on order + on the way). Please share the script.
- Average period: 30 days by default (30/60/90 on screen). Which one do you want as default?
- Should transfers sent from a warehouse to a shop count as the warehouse consumption? (now: yes)

## Racks, shelves and bins (added 2026-10-25, needs the owner's confirmation)
- Racks are **master data only**: they say where a product is kept. They do **not** change the stock ledger; stock is still counted per warehouse or shop (decisions D-0xx about the ledger stay as they are).
- A bin's "current stock" is the warehouse stock of the products placed in it. A product sits in **at most one bin per warehouse/shop**. Several products can share a bin; their quantities are added together as "units" (so mixing pieces and metres in one bin gives a meaningless sum; keep one kind of unit per bin).
- Moving stock from one bin to another inside the same warehouse is just moving the product's assignment (remove it from one bin, add it to the other). No stock movement is recorded.
- A bin is never deleted (its code must stay unique and traceable); it can be **blocked**. Taking a product out of a bin is allowed (it is not stock history).
- The code is made from the place code + rack + level + bin, for example `DEMO-WH-A-01-01`. A single digit is padded (1 becomes 01).
- Question for the owner: do you want stock counted per bin later (receiving into a bin, transfers between bins)? That is a bigger change to the ledger and needs its own plan.

## Customers (added 2026-10-25, needs the owner's confirmation)
- A customer is master data (code CUST-001..., type, contact, city, state, optional GST number, credit limit, payment terms). The **GST number is only stored**; no tax is calculated anywhere (GST waits for the accountant).
- **Credit limit and payment terms are notes for the staff.** There is no credit sale, receivable or payment tracking, so nothing is enforced and "Outstanding" from the mock is not shown.
- A bill may point at a customer (optional). The database fills an empty customer name or phone on the bill from the customer; a typed name wins. Old bills have no customer. Orders and sales per customer count only COMPLETED bills (voided bills do not count) that the person may see (their own places).
- Customers are never deleted (bills point at them); they are switched off (Deactivate). A switched-off customer cannot be put on a new bill.
- Permissions: new `customers.view` and `customers.manage`. Anybody who may make or see bills can read the customer list (to pick one); only `customers.manage` can add or change customers. Give these to staff on the Users & Roles page.

## Import Shipments (2026-10-26, owner answered the first three)
- One shipment belongs to ONE purchase order (a PO may have many shipments). Only POs of an Import supplier that are Sent or Partly received can be shipped. (Owner's answer.)
- The items on a shipment are chosen from the PO lines. The total on shipments (not cancelled) plus what is already received can never be more than the ordered quantity. (Owner's answer.)
- Status is changed by hand with its date: Booked, Dispatched, In Transit, Arrived at Port, Customs Clearance, Delivered (steps may be skipped, never backwards); Cancelled until Delivered. "Delayed" is not stored: it is not delivered / cancelled and the ETA is before today. (Owner's answer.)
- A shipment NEVER changes stock and never changes the purchase order. Stock grows only when a goods receipt (GRN) is posted. Marking "Delivered" does not receive anything. Please confirm this is what you want.
- Only Booked or Dispatched shipments can be edited. After that only the status and the charges change.
- Charges (freight, duty, clearing, insurance, port, other) are plain amounts for information. They are NOT added to the item cost on a receipt, and no tax or duty is calculated. They are visible and changeable only with `receipts.cost`.
- Shipment number is IMP-<year>-<number>. The number keeps counting across years (it does not restart on 1 January).
- Permissions: new `shipments.view` and `shipments.manage`. To see shipments a person also needs a purchase permission (the order stays behind its own place rules). Give these on the Users & Roles page.
- Not built yet: document upload (Documents tab and "Upload Documents"), because there is no file storage set up; the Import button (no importer).

## Goods Inward (GRN) page (2026-10-26)
- There is no quality check (QC) in the system yet, so the mock's "Pending Inspection / Accepted / Rejected" are shown as what really exists: **Draft** (not posted, no stock effect), **Posted** (stock was added) and **Cancelled**. "Partly received" = a posted receipt whose purchase order is still waiting for more goods. When Quality Check is built, these words can change. Please confirm.
- The GRN number keeps the existing form GRN-000001 (the mock shows GRN-2026-001). Not changed, to avoid touching old receipts.
- A receipt is not linked to an import shipment (no shipment number or container on the GRN). The link can be added later if you want it.
- "Received Today" counts receipts posted today (India time). Source (Import / Domestic) comes from the supplier's type.
- Only people who may see purchase orders see the order number on a receipt.

## Quality Check (2026-10-26, owner answered the first three)
- A quality check is a RECORD. It never changes stock: stock was added when the GRN was posted. Rejected goods are removed from stock by the owner with Stock Adjustment. (Owner's answer; the other option, "stock only after QC passes", would change GRN posting and was NOT chosen.)
- One posted goods receipt has at most one quality check. A check can be recorded again later (the button says Recheck); the audit log keeps the older values. (Owner's answer.)
- The status follows the numbers and is never typed: Pending (results not recorded), Rejected (any piece rejected), Rework (none rejected, some rework), Passed (all passed). The mock's "Failed" is called "Rejected". (Owner's answer.)
- For every item: passed + rejected + rework must equal the received quantity. A reason is needed for rejected or rework pieces. The QC date cannot be in the future.
- Only a POSTED receipt can be checked (draft and cancelled ones cannot).
- QC number is QC-<year>-<number>; the number keeps counting across years.
- Permissions: new `qc.view` and `qc.manage`. To see checks a person also needs permission to see the receipt (for example receipts.view); place rules of the receipt apply. Give these on the Users & Roles page.
- Not built: Images and Documents tabs (no file storage yet), Import button, Recheck as a separate step.

## Current Stock page (2026-10-26)
- The page lists one line per product per place (a product in two places = two lines). A line exists when the product has a stock record or a min/max level in that place. A product that never had stock and has no level does not appear.
- Status of a line: Out of stock (quantity 0 or less), Low stock (quantity below the minimum level, minimum above 0), Over stocked (quantity above the maximum level), else In stock. The old page called "below minimum" low; "out" now wins when quantity is 0.
- "Total Stock Quantity" adds all units together (pieces, metres ...), as the mock does; it is a rough number, not a count of pieces.
- Average cost = weighted average buying price of the POSTED goods receipts of that product that the person may see (receipts.cost needed); Stock value = quantity x average cost. Transfers and opening stock carry no price, so a product without any priced receipt has no value (blank, not 0). A person without receipts.cost sees no cost or value. This is a simple rule, not a full valuation: please confirm, or tell me which costing you want.
- Not shown, because the system has no such data: Brand, HSN code (GST waits), Reserved / Available stock (no reservations exist: available = current), Documents tab.
- The old /stock page tools stay reachable: Quick Stock In/Out, Count stock, Count by scanning and Stock history are in the Add Item menu and the main menu.
- Min / Max level can still be changed from the panel, but only for the place you currently work in (switch place first).

## Stock Ledger page (2026-10-26)
- One ledger line = one movement at ONE place. A transfer gives two lines (out at the sender, in at the receiver, after it is received); the system place "in transit" is not shown. So "Total Transactions" counts lines, not documents.
- Balance = the quantity of that product in that place right after the line, built from the movements the person may see (all movements of their own places, so it is exact for those places).
- Types: Inward = receipt, Sale, Return = a voided bill that put stock back, Transfer, Lost in transit, Adjustment (counts and corrections), Opening, Stock out. The mock's "Return" is therefore only voided bills (there is no customer return process yet).
- Cards: Stock In and Stock Out add up all lines (all units added together, a rough number). Transfer (Qty) = the quantity sent out by transfers. Adjustment (Qty) = the size of all count corrections, up and down.
- User column: first name and the first letter of the last name ("Amit K."), from a small helper that only gives this to people who may see stock. Nothing else of a profile is shown.
- Remarks = the reason written with the movement. Not shown: Brand, HSN, Reserved stock, Documents tab.
- The ledger cannot be edited from this page (the database does not allow it for anybody).

## Stock Transfer page (2026-10-26)
- The transfer flow itself is NOT changed: a draft does not change stock; stock leaves the sender when it is sent (status "In Transit") and arrives only when the other place receives it ("Completed"). If less arrives, a shortage note is needed and the transfer shows a "Shortage" tag. The mock's single "Submit Stock Transfer" is therefore the editor's two buttons (save draft, send).
- "From Warehouse" in the Create form is the place the person works in (switch it at the top of the page); the mock shows a choice. Sending from a place you do not work in is not allowed.
- No Date or Reference No. fields: a transfer has only remarks. The Date column is the day it was made.
- "Requested By" = who made the transfer, shown as "First L." (needs stock.view, see Stock Ledger).
- Draft is a status of its own (the mock has only Completed, In Transit, Cancelled); there is no card for it, but it can be filtered.
- Receiving, recalling and editing a draft happen in the right panel or the full page (/transfers/[id]); the old editor is reused.

## Stock Adjustment page and approval (2026-10-26, owner chose manager approval and the existing reasons)
- A stock adjustment (the old "Quick Stock In / Out", numbers SE-000001 ...) is now PENDING until a manager approves it. Stock changes ONLY on approval. A manager can also reject it; a reason is needed and nothing changes. (Owner's answer.)
- Who is a manager: a person with the new permission `stock.approve` (admins have everything). **A manager's own adjustment is approved at once**, because they are the manager; there is no second person checking a manager. Please confirm this rule, or tell me if even managers need another manager (then it changes).
- On approval the database checks the stock again for Stock Out (it may have changed since the request). If there is not enough, the approval is refused with the item and the quantity that is there.
- Entries made before this change were applied at once and are shown as Approved. They still can never be edited or deleted: the only allowed change is Pending to Approved or Rejected, once. A mistake is fixed with an opposite adjustment.
- Reasons stay as they were (Stock Out: sold outside, sample, damaged, own use, lost, returned to supplier, other; Stock In: found, customer return, other). The mock's "Count Correction", "Physical Count" and "Opening Stock" are done on the Physical Count page, not here. (Owner's answer: no new reasons.)
- The cards "Increase (Qty)" and "Decrease (Qty)", the reasons donut and the 30-day trend count APPROVED adjustments only. The reasons donut is this month. All units are added together (rough number).
- "Date" of the trend = the day the stock really moved (the approval day).
- The place of an adjustment is the place the person works in (switch it at the top). Approving needs access to that place.
- Not built: pictures and the Available stock column in the form; Reference stays optional free text; no Date field (it is the day it was made).

## Physical Count page (2026-10-26, owner chose manager approval and a frozen system quantity)
- A count is a sheet for one place. When it is made, the system quantity of every product in scope is FROZEN on the sheet ("System"). Scope: Full (every product that has stock or a min/max level in the place), Cycle (one category), Location (one rack of the place). A product with no stock record and no level in the place is not on a full count. (Owner's answer: freeze.)
- People type what they counted; progress can be saved. All items must be counted before the sheet is sent. Where the count differs from the system a reason is needed (Missing, Extra, Wrong location, Damage / expiry, Others).
- Sent counts wait for a manager (`stock.approve`). On approval the stock changes by the DIFFERENCE (counted minus frozen quantity) of each product, as an ADJUSTMENT movement with the count number. Moves made between the freeze and the approval are kept (for example goods received meanwhile stay). If applying would make a stock negative, the approval is refused and the sheet must be counted again. (Owner's answer: manager approval.)
- A manager can send a count back with a note; it goes back to In Progress for a recount. Pending, In Progress and Waiting Approval counts can be cancelled; nothing changes in stock. A Completed count is final; a mistake is fixed with a Stock Adjustment.
- A manager's own count is applied at once when sent (same rule as Stock Adjustment: please confirm).
- Variance (Qty) in the list = counted minus system, added up (up and down cancel out). The card "Total Variance (Qty)" and the donut add up the SIZE of every difference of completed counts. Variance value = difference x average cost (as on Current Stock), only with `receipts.cost`; the card counts the size of the differences.
- Pending = made but nothing counted yet; In Progress = some counted (the card also tells how many wait for approval).
- "Count by scanning" (/stock/scan) is the older quick count: it still changes the stock AT ONCE without a sheet and without approval. Please tell me if it should go through the same approval or be removed.
- The old "Count stock" screen with typed numbers is replaced by this page (its code file stays in the project, unused; deleting it needs your OK).
- Not built: Team Members, Reference No., Planned Date; counting by barcode scan inside the sheet.

## Sales Orders page (2026-10-26, owner chose: no tax now, order is only a record)
- A sales order is a RECORD of what a customer wants. It does NOT change stock and does NOT reserve stock; "Available" on the form is only today's stock of the place, for information. Stock goes out later, at Picking & Packing and Dispatch (those pages are not built yet). (Owner's answer.)
- NO TAX on the order: Sub Total, Discount, Shipping Charges, Grand Total. Tax / GST waits for the accountant. (Owner's answer.)
- Status: Pending (waiting for confirmation), Confirmed, In Packing, Dispatched, Cancelled. On this page Pending and Confirmed are made here; "In Packing" and "Dispatched" will be set by the Picking & Packing and Dispatch pages. Until those exist, the demo orders in those two states were set directly in the database.
- Who: `sales_orders.create` makes and edits Pending orders and may cancel an order that is Pending or Confirmed (with an optional note); `sales_orders.confirm` confirms. They are two separate permissions, so a different person can confirm. Admins have both. An order that is being packed or dispatched cannot be cancelled here.
- Only a Pending order can be edited (customer, channel, dates, address, items, rates, discount, shipping). After confirmation it is fixed.
- Rate starts as the item's selling price and can be changed per order. The discount cannot be more than the items total. One line per item.
- Order value = items total - discount + shipping charges. The place on the order is the place the person works in ("Ships from"); to use another place, switch the working place at the top.
- Sales channels are a fixed list: Website, Amazon, Flipkart, Meesho, Direct, Other.
- To see sales orders a person also needs `items.view` (item names and the item search come from the item list), like other pages. Customers can be read by people with the sales order permissions (the customer table rule was widened for this).
- The old "Sales Orders" menu item pointed at the Bills list; the Bills list is still there under the extra "Bills" entry (Quick Action, search box, phone bar). Shop bills (Billing) are a different thing and are not sales orders.
- Not built: pictures in the item list, "Available" check or warning when the quantity is more than the stock, order documents / print, Import button.

## Picking & Packing page (2026-10-26, owner chose: stock goes out at Dispatch only)
- Picking and packing are a RECORD only. They do NOT change stock and do not reserve it. Stock goes out when the order is dispatched (Dispatch page, not built). (Owner's answer.)
- Start Picking works on a Confirmed order. The order then shows "In Packing" in Sales Orders. Stop picking sends it back to Confirmed and forgets the picked quantities.
- Strict: Mark as Packed is allowed only when every item is fully picked (picked = required). A partial dispatch is not supported yet.
- Picked quantity cannot be more than the ordered quantity, follows the unit's decimals, and cannot be more than the stock in that place today. A barcode scan adds one piece.
- Packing: type (Box, Poly bag, Envelope, Pallet, Other) and box / packet number are required; weight, size and remarks are optional.
- Who: `picking.manage` starts, picks, packs and stops; `picking.view` only looks. Admins have both. Staff also need `sales_orders.view` and `items.view` (the data comes from those tables). New permissions must be given on the Users & Roles page.
- "Delayed" = not yet dispatched and the expected dispatch date has passed. Priority (High / Medium / Low) is chosen when picking starts.
- The rack shown on a line is taken from the item's racks (Locations > Racks) in that place; an item with no rack shows none.
- Not built: Team Members / Assign To, partial picking, picking by rack route.

## Dispatch page (2026-10-26, owner chose: stock goes out at dispatch, hand-set courier status, hand-typed AWB)
- Mark as Dispatched TAKES THE STOCK OUT: one SALE movement per item for the packed quantity (Stock Ledger shows "Dispatched on <order>"), the order becomes Dispatched and gets the dispatch date. Only an order that is packed (Ready to Dispatch in Picking & Packing) can be dispatched, and only when the place has enough stock at that moment. (Owner's answer.)
- A dispatch cannot be cancelled or undone. A mistake is fixed through the Returns page (not built). Courier details (courier, service, AWB, insurance, pickup reference, remarks) can be edited until the parcel is Delivered or RTO; the order, date and stock cannot.
- Courier status is changed BY HAND (no courier connection, which would be a paid outside service). Flow: Dispatched, In Transit, Out for Delivery, Delivered, Delivery Failed, RTO. Delivered and RTO are final. Delivered, Delivery Failed and RTO keep a date (today unless a date is given; not before the dispatch date, not in the future); other statuses clear it. (Owner's answer.)
- An RTO does NOT put the stock back. That belongs to the Returns page (not built).
- AWB is typed by hand from the courier. The same AWB cannot be used twice for the same courier (case does not matter). "Generate AWB" and "Bulk AWB Upload" are not built. (Owner's answer for Generate AWB.)
- Couriers are a list in the database (Blue Dart, Delhivery, Ekart, XpressBees, DTDC, India Post, Other). Anyone with `dispatch.manage` can add a courier from the form; there is no screen to rename or hide one yet.
- Service types: Surface, Air, Express, Standard (a guess, optional). Insurance is only a yes/no note; it does not buy insurance or change money.
- The shipping label is a plain page (customer address from the sales order, courier, AWB, box and weight from packing). It is NOT a courier-made label, tax invoice or e-way bill.
- Dispatch date: today by default, not in the future, not before the order date. One dispatch per order.
- Who: `dispatch.manage` dispatches, changes status, edits and adds couriers; `dispatch.view` only looks. Admins have both. Staff also need `sales_orders.view`, `picking.view` (or `picking.manage`) and `items.view` for the lists to fill. New permissions must be given on the Users & Roles page.
- Not built: Bulk AWB Upload, Generate AWB, courier tracking links, cancel dispatch, courier list screen.

## Returns page (2026-10-26, owner chose: good items back into stock, items chosen per return, record only for refund, hand-set status)
- A return is for items of ONE DISPATCHED sales order (an RTO parcel is returned the same way). The person ticks the items and quantity that come back. The total returned per item (returns that are not rejected) cannot be more than the quantity ordered. (Owner's answer.)
- Stock: making a return, moving it forward, saving the inspection and rejecting do NOT change stock. APPROVING puts ONLY the items marked Good back into the stock of the place the order shipped from (Stock Ledger: "Customer return RT-..."). Damaged and Used items do not come back; they stay as a record (a damaged-goods stock place does not exist yet). (Owner's answer.)
- Refund or Replacement is a RECORD only: no money moves, no credit note, no new Sales Order. A replacement order is made by hand in Sales Orders. Tax / GST waits for the accountant. (Owner's answer.)
- Status goes forward by hand: Pickup Pending, In Transit, Under Inspection (no courier connection, no Generate Return AWB; the pickup AWB is typed). Approved and Rejected are decisions, not plain status changes. A decided return cannot be changed or undone here. (Owner's answer.)
- Approve needs Refund or Replacement chosen first and the return Under Inspection. Reject needs a reason (3 to 300 letters) and is possible before the decision (any open status).
- Who: `returns.manage` makes returns, moves them forward and writes the inspection; `returns.approve` approves and rejects (a separate permission, like stock approval); `returns.view` only looks. Admins have all. Staff also need `sales_orders.view` and `items.view` for the lists to fill. New permissions must be given on the Users & Roles page. A person who has both manage and approve can do the whole flow alone (no rule stops it); say if you want the approver to be a different person.
- Reasons are a fixed list: Damaged, Wrong Item, Not Working, Changed Mind, Missing Item, Others. Conditions: Good, Damaged, Used. The return date is not in the future and not before the order date.
- Return numbers are RT-<year>-<number>. A rejected return gives its quantity back to the order, so a new return can be made for it.
- Not built: Generate Return AWB, a place for damaged goods, a credit note or refund amount, partial approval of single lines, cancelling a return.
