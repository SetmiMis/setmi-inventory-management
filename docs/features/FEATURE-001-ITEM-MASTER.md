# FEATURE-001: Item Master (requirements spec)

**Status:** SPEC, owner answers recorded 2026-10-24. Nothing is implemented. No database objects exist.
**Task:** 002. **Drafted by:** Claude Sonnet 5.5.

Legend: **APPROVED** = stated by the owner. **INFERRED** = AI's reading of an owner answer, needs a quick confirmation. **PROPOSED** = AI suggestion, not decided. **OPEN** = owner has not decided. Only APPROVED rules may become DB constraints.

## 1. Goal
Item Master is the single authoritative record of each product's identity. Stock quantity, warehouse location and stock movements are NOT part of it (separate future modules).

## 2. Fields

| # | Field (Excel name) | Meaning | Rule | Status |
|---|---|---|---|---|
| 1 | `Sr No` | Display serial number only | Not a key. Shown as row number in lists. | APPROVED |
| 2 | `Internal_Item_Code` | SETMI INDIA's internal product identity | Entered manually, never auto-generated. | APPROVED |
| | | | Required, unique, trimmed, case-insensitive compare. | PROPOSED |
| | | | Can it be changed after creation? | OPEN |
| 3 | `Import_item_code` | Reference for overseas purchasing | Optional (some items have it, some do not). Unique when filled. Not forced by purchase source. | APPROVED |
| 4 | `Item_Name` | Standard item name (internal / stock side) | Required. | PROPOSED |
| 5 | `Selling_Item_Name` (NEW) | Name printed on customer bills. May differ from `Item_Name`. Billing uses this. | Required, prefilled from `Item_Name` on create. | APPROVED |
| | | | One name per item for now. | PROPOSED |
| 6 | `Item_Category` | Product category | Fixed list or free text? | OPEN |
| 7 | `Item_Purchase_Source` | LOCAL or IMPORT | Exactly these two values. | APPROVED |
| 8-11 | `Item_img1..4` | Product images | Up to 4. Types/size limits: JPG/PNG/WebP, 5 MB. | PROPOSED |
| 12 | `Item_Data_sheet` | Technical datasheet | One file. PDF, 10 MB. | PROPOSED |
| 13 | `Remarks` | Extra information | Optional free text. | APPROVED |
| 14 | `BARCODE` | Barcode when available | Optional. Used by scanning (see 2.1). A barcode belongs to one item only. | APPROVED |

Technical fields (PROPOSED): stable internal `id` (UUID) used for all future relations (stock, billing) so codes can be corrected safely; `is_active` flag for archiving; `created_at`, `created_by`, `updated_at`, `updated_by`.

### 2.1 Barcode use (owner)
- At **selling time**, staff scan the barcode to pick the item for the bill.
- Barcode is also used for **inventory management** later.
- Works like a normal barcode billing system: a scan must find exactly one item, so a barcode value belongs to only one item (APPROVED).
- Can one item have several barcodes (e.g. different pack sizes)? Owner's answer was not specific. PROPOSED safe default: store barcodes in their own table (one item, many barcodes, each barcode globally unique). It also covers the single-barcode case and avoids a later migration.

### 2.2 Delete
Archive only. No real delete (APPROVED). Archived items hide from normal lists but stay in history.

### 2.3 Data entry
Two ways, both required (APPROVED): manual entry form, and Excel import. Import rules (validation, duplicates, error report) will be designed in their own task.

## 3. Users and permissions (APPROVED direction)
- Several company users. Users are not decided yet.
- Instead of fixed roles, an **admin panel with permission toggles**: the admin switches on/off what each user may do, per menu/action. This must be extendable to future modules.
- PROPOSED design: each action is a named permission (for example `items.view`, `items.create`, `items.edit`, `items.archive`, `items.edit_selling_name`, `users.manage`). Users get permissions through toggles. Default is no permission (deny by default).
- Enforcement is on the server and in database policies (RLS). Hidden menus are only convenience, never the security control.
- First admin: created once by the owner (how is decided in the auth task). Admin changes to permissions should be logged.
- Anonymous visitors get nothing.

## 4. In scope for the full Item Master (later small tasks)
Add, list (paginated), search (code, names, barcode), filter, edit, archive, upload/replace images and datasheet, Excel import.

## 5. Out of scope
Stock quantity, locations, receiving, outward, transfers, ledger, billing, reports, supplier management, pricing.

## 6. Note for the future billing module (not built now)
The name printed on a bill must be stored on the bill, so later edits to `Selling_Item_Name` do not change old bills.

## 7. Still open (blocks only the matching schema details)
1. Category: fixed list or free text?
2. Can `Internal_Item_Code` change after creation?
3. Barcodes table (several per item) as proposed in 2.1: owner to confirm or reject. Blocks the schema design only slightly.
4. Excel: how many rows to import? What columns/format?
5. Who are the first users and what is the first admin's login?
