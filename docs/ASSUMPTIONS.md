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
