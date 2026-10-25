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
