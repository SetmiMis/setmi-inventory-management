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
