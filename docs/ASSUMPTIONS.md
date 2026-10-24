# ASSUMPTIONS and open questions

Status: UNVERIFIED, VERIFIED or REJECTED.

| ID | Item | Status | Needed to close |
|---|---|---|---|
| A-001 | `Item_Name` means the internal/stock-side name (inferred from owner's `Selling_Item_Name` explanation) | UNVERIFIED | Owner confirmation |
| A-002 | Is `Selling_Item_Name` mandatory? If empty, should bills fall back to `Item_Name`? | UNVERIFIED | Owner decision |
| A-003 | One selling name per item, or different names per customer? (Suggested: start with one) | UNVERIFIED | Owner decision |
| A-004 | Should `Selling_Item_Name` be unique? | UNVERIFIED | Owner decision |
| A-005 | User roles and who may create/edit/view items and edit `Selling_Item_Name` | UNVERIFIED | Owner defines roles |
| A-006 | `Internal_Item_Code` format and uniqueness (manual entry confirmed) | UNVERIFIED | Owner decision |
| A-007 | Uniqueness and format of `Import_item_code` and `BARCODE`; can they be empty? | UNVERIFIED | Owner decision |
| A-008 | Item categories: fixed list or free text? | UNVERIFIED | Owner decision |
| A-009 | Image/datasheet limits (types, sizes) | UNVERIFIED | Owner decision |
| A-010 | The GitHub repo is private (owner-stated) | UNVERIFIED | `ls-remote` worked without a prompt, which shows access but not visibility |
| A-011 | Supabase project to use for IMS (must be separate from the CRM project) | UNVERIFIED | Owner identifies project |
| A-012 | Existing Excel data must be imported later | UNVERIFIED | Owner confirms |
| A-013 | Item Master has no `Sr No` business meaning; display serial only | VERIFIED (owner's brief) | none |
