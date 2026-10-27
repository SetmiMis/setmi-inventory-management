# FEATURE-002: Excel import of items (P2c)

**Status:** IMPLEMENTED 2026-10-24 (owner approved `read-excel-file`). Not yet run in a browser with a real login.

## 0. What exists now (actual code)
- Page `/items/import` (needs `items.import`); link "Import Excel" on the items page.
- `items/import/actions.ts`: `previewImport` (file checks, parse, database dry run, saves nothing) and `commitImport` (validates again, one transaction). `items/import/import-wizard.tsx` is the screen: check file -> see problems and sample rows -> choose options -> Import.
- `lib/import/items-sheet.ts`: reads the sheet (loose header matching, skips rows with no Item_Name, text-only cells). Tested with the owner's real layout (`tests/items-sheet.test.ts`).
- Database function `import_items(rows, dry_run, skip_invalid, generate_barcodes)` (migration 5): re-checks every row, compares with the database and with other rows of the file, creates new categories only if the user may, writes items + barcodes (+ SETMI barcodes if asked) in one transaction, writes an audit row. DB tests `backend/supabase/tests/005_import_items.sql`: 16/16 pass.
- Limits: file 3 MB, `.xlsx` only (checked by the ZIP signature), at most 2000 item rows, first sheet only. `next.config.ts`: server action body limit raised to 4 MB (default 1 MB).
- Real `.xlsx` check (file built in a throw-away folder from rows of the owner's sheet): header with a stray space matched; a 13-digit numeric barcode kept all digits; a formula cell gave its stored result; text like `=1+1` stayed text; 2 placeholder rows skipped; a renamed text file was refused.
- Known limits: images and datasheet columns are not imported; existing items are never updated by import; the zip is unpacked in memory (size limit only, no decompressed-size limit); the preview shows only the first 50 rows and 200 problems.
- (Original plan below, kept for reference.)

## 1. Goal
Load the owner's existing Item Master Excel into the system, and keep working with manual entry too (D-010).

## 2. Library choice (AI proposal, needs owner "haan")
Checked on 2026-10-24 with `npm view` and `npm audit` in a throw-away folder (nothing installed in the project):

| Library | Latest | `npm audit` | Notes |
|---|---|---|---|
| **read-excel-file** | 9.3.12, MIT, updated 2026-10-07 | **0 vulnerabilities** | Reads only (we never write Excel). 4 small dependencies (saxen, fflate, worker-f, unzipper-esm). **Proposed.** |
| exceljs | 4.4.0, last release 2024-12 | 2 moderate (via old `uuid`) | Reads and writes, heavy (21 MB), stale. Rejected: we do not need writing |
| xlsx (SheetJS on npm) | 0.18.5 | **1 high: prototype pollution, ReDoS, "no fix available"** | Rejected: untrusted uploaded files are exactly the risk it has |

Limit: `.xlsx` only. Old `.xls` files must be saved as `.xlsx` first.
Revisit if: read-excel-file gets an advisory, or files need formats it cannot read.

## 3. Flow (two steps, never write on the first step)
1. **Upload + preview** (`items.import`): the owner picks an `.xlsx` (max 4 MB because Vercel limits request bodies to about 4.5 MB; max 2000 rows). Server parses the first sheet, maps columns by header name, validates every row with the same rules as manual entry (`lib/validation/item.ts`), and checks duplicates inside the file and against the database (internal code, import code, barcode). Shows: rows OK, rows with errors (row number + reason), new categories that would be created. **Nothing is saved yet.**
2. **Confirm**: the server validates the rows again (never trusts what the browser sends back) and calls one database function in a single transaction. Default: all or nothing. Option: "import the valid rows, skip the rest".

## 4. Rules
- Create only. Rows whose Internal_Item_Code already exists are reported as errors, never overwritten. (Updating existing items by import is risky; separate decision later.)
- Excel columns: Sr No (ignored, display only), Internal_Item_Code, Import_item_code, Item_Name, **Selling_Item_Name (new, optional: blank means Item_Name)**, Item_Category, Item_Purchase_Source (LOCAL/IMPORT, case-insensitive), Item_img1-4, Item_Data_sheet, Remarks, BARCODE.
- BARCODE cell: one or more barcodes separated by comma or new line. A barcode already used by another item is an error.
- Category: matched by name ignoring case. Unknown names are listed in the preview and created on confirm only if the user also has `categories.manage`; otherwise it is an error.
- Unit: not in the Excel; defaults to PCS.
- Cell text is only ever stored as text. Cells starting with `=`, `+`, `-`, `@` are kept as plain text (no formulas are evaluated); numbers like barcodes are read as text so leading zeros are not lost.
- Database function `import_items(rows jsonb)`: checks `has_permission('items.import')`, max 2000 rows, runs in one transaction, `created_by` = caller, audit trigger records each item. Tested with a rolled-back SQL test like the other DB tests.
- The whole import is written to the audit log (who, when, how many).

## 5. Security notes (threat: malicious or broken Excel)
- Only `.xlsx` accepted, checked by real file signature (ZIP `PK`), not by name.
- Size and row limits stop zip-bombs and huge files; parsing happens server-side in memory and nothing is written to disk.
- No formula evaluation, no macros (xlsx has none), no external links are followed.
- Every value is validated with zod and then inserted with parameters (never string-built SQL).
- Permission `items.import` is separate from `items.create`.

## 5b. What the owner's real sheet showed (read-only look at Google Sheet "Setmi_India_item_master", 2026-10-24)
- One sheet, header in row 1: Sr No, **Selling_Item_Name** (already added by the owner, still empty), Internal_Item_Code, **"Import _item_code" (note the stray space)**, Item_Name, Item_Category, Item_Purchase_Source, Item_img1-4, Item_Data_sheet, Remarks, BARCODE. The import must match headers loosely (ignore case, spaces, underscores) and by name, not by column position.
- **36 real items** (rows 1-36). From row 37 the sheet has placeholder rows containing only `SETMI-`; Sr No is pre-numbered to 999. Import must **skip rows with no Item_Name**.
- Internal_Item_Code = `SETMI-` + Item_Name, up to about 85 characters, with spaces, double spaces, dots and slashes. The old limit of 64 would have rejected such items; **fixed: limit is now 120** (unit-tested with the real row 32).
- Import_item_code, barcodes, images and datasheet cells are all empty in the sample.
- Purchase source values are `IMPORT` / `LOCAL`. 9 distinct categories (AUDIO-VIDEO CABLE, SPEAKER MEMBRANE, MULTIMEDIA TWEETER, HORN, JAMBO SWITCH, UHF CONNECTOR, HDMI CABLE, METAL EXTENSION BOARD, EXTENSION BOARD). All text is upper case.
- Possible data issue to review: row 10 "TWEETER ... TW-17-INDIAN" is marked IMPORT, while row 11 "...-INDIAN" is LOCAL.
- Row 4 has the remark "data base name change".
- Several item names contain a double space ("...METER  4 SOCKET..."). They are kept exactly as typed (a code that differs only by spaces would collide, so the database already compares codes ignoring case and edge spaces).

## 6. Open questions for the owner
1. What is inside `Item_img1-4` and `Item_Data_sheet` in your Excel: file names, web links, or pictures placed inside the sheet? (Our images live in private storage. Proposal: the import ignores these columns for now; images and PDFs are uploaded per item later, or in a later task if you have the files in a folder.)
2. Roughly how many rows?
3. Is the first sheet the item list, and is row 1 the header with the exact names above?
4. Do some rows have more than one barcode in a cell?
5. Are there duplicate Internal_Item_Codes in the Excel today? (They will show as errors.)

## 7. How to share the sample file
Copy a sample (20-50 rows) to `Inventory Management System\samples\` in the project folder. That folder is git-ignored, so the company data is never committed or pushed. Include the odd rows: empty barcode, IMPORT items, a long name, a duplicate. Remove anything the system does not need (prices, supplier names). The AI reads it only locally.

## 8. Test plan
Unit tests for column mapping, barcode splitting and row validation (`node --test`); DB test for `import_items` (permission denied, duplicates, all-or-nothing rollback, 2000-row cap); a real file run in the browser by the owner.
