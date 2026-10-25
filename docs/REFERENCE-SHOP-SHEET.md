# Reference: the current shop sheet "IMS For Shop" (Google Sheets + Forms + AppSheet + Apps Script)

**Read on 2026-10-25** (read-only, through the Sheets API): tab names, headers, sample rows and the formulas. The Apps Script code itself could NOT be read: a script bound to a sheet is not reachable through the Sheets API. What the script does is inferred from the values it writes (cells that hold plain numbers where a formula would be expected). To confirm, the owner can copy the code from Extensions > Apps Script.

## 1. How the sheet works (the "science")
| Tab | What it is | How it is filled |
|---|---|---|
| Form responses 1 | Google Form "Stock In/Out": In/Out, date, item name, quantity, reason (for example Adjustment), remarks (~160 entries) | Google Form |
| Stock Inward (Shop) (Responses) | Second form: date, item, qty, remarks, time, **person who brought it**, **mode of transport**, In/Out, SKU, email | Google Form (hidden tab) |
| AppSheet_In / AppSheet_Out | Entries from an AppSheet phone app: timestamp, SKU, In/Out, date, qty | AppSheet |
| In/Out (Form) | The first form re-shaped; SKU looked up from the item name (`XLOOKUP`) | `QUERY` formula |
| In/Out (Manual) | All other channels stacked into one list: Stock Inward form + AppSheet_In + AppSheet_Out (only after 08/09/2026) | `QUERY` formula |
| Item List | ~390 SKUs (codes like `SET-AVC-001-15`): name, category, **Average Daily Consumption**, **Lead Time (indent to receipt, days)**, **Safety Factor** (1.5), MOQ (empty), **Max Level**, Material In Transit (empty) | Avg daily consumption is a plain number (likely written by the script) |
| Max Level formula | `Max Level = Average Daily Consumption x Lead Time x Safety Factor` (array formula in H1) | formula |
| IMS | Matrix: one row per SKU, one column per day (from 25/09/2026), the stock at the end of each day, plus today's Closing Stock | plain numbers (written daily by the script) |
| Daily Closing | Today's closing stock per SKU | plain numbers (script) |
| Reorder Sheet | Per SKU: MOQ, Max Level, Closing Stock, **Reorder Quantity**, "Place Order (y/n)" | Closing and Reorder Quantity are plain numbers (script); the exact formula is not visible |
| Indent Link | Indent number, SKU, MOQ, Max, Closing, Reorder Quantity, **Approved** (a purchase request that needs approval) | empty so far |
| Link | Links to the Stock In/Out form and the Stock Inward response sheet | text |

## 2. Problems seen in the sheet data (why a real system helps)
- **Negative stock**: for example `2RCA-2RCA CABLE 1.5 MTR` shows -1,390 for weeks in the IMS matrix. Nothing stops a stock-out larger than the stock.
- **Three input channels merged by formulas**, with a date cut-off in the formula (AppSheet_Out only after 08/09/2026). Easy to double count or lose rows.
- Rows in **AppSheet_Out are labelled "In"** in the In/Out column. Either the label or the tab name is wrong.
- **Stale numbers**: the Reorder Sheet's Closing Stock (for example 1,600) differs from the IMS closing (3,125) for the same SKU on the same day.
- **Reorder Quantity does not follow from the visible numbers** (DIAPHRAGM: max 150, closing 1,310, reorder 1,120). The rule lives only in the script.
- MOQ and Material In Transit are empty for all rows. Items are matched by **name** in one form, so a renamed item breaks the lookup.
- No audit trail, no permissions per person (anyone with the form link can post), no barcode.

## 3. What our system lacks compared with the sheet (gaps)
| # | Gap | Sheet has | Our system now | Size |
|---|---|---|---|---|
| G1 | **Quick Stock Out / Stock In entry with a reason** (sold in Zoho, sample, damaged, own use, found) | Form + AppSheet, used daily | Only a full stock count, or a bill (billing is OFF) | Must have while Zoho bills |
| G2 | **Automatic reorder science**: average daily consumption from real outflow, lead time, safety factor, MOQ, Max level, reorder quantity including stock in transit | Item List + Reorder Sheet | Only a manual minimum/maximum per item and place | Must have |
| G3 | **Indent (purchase request) with approval**, turned into a purchase order | Indent Link (Approved) | Purchase orders with send/approve, but no "reorder list -> request -> PO" step | Should have |
| G4 | **Daily closing history**: stock of every item at the end of each day, exportable | IMS matrix, Daily Closing | The ledger has all the data, but no "stock on a date" report | Should have |
| G5 | **Inward details**: who brought the goods, mode of transport, time, remarks | Stock Inward form | Receipts have supplier invoice and notes only; transfers have notes | Nice to have |
| G6 | Item fields for planning: lead time (days), safety factor, MOQ | Item List | Not on the item | Part of G2 |
| G7 | **Moving the existing data in**: ~390 SKUs, categories, opening stock from Daily Closing | the sheet | Excel import exists for items; no import for planning fields or opening stock from this sheet | Needed before go-live |
| G8 | A very quick phone screen for In/Out (AppSheet-like) | AppSheet app | Works on a phone, but no "two taps" quick-entry screen | Nice to have |

## 4. Where our system is already stronger
Stock can never go negative; one ledger instead of three merged inputs; every change has who/when; permissions per person and place; barcodes and scanning; warehouses, shops and transfers with in-transit; purchase orders linked to receipts; billing with a switch; reports and a dashboard; English and Hindi.

## 5. Suggested order
G1 (quick Stock Out/In with reasons) -> G2 + G6 (reorder science on the items) -> G3 (indent with approval, one click to a draft purchase order) -> G7 (import from this sheet) -> G4 (daily closing report) -> G5, G8.
Open question for the owner: the exact reorder rule in the Apps Script (please share the code), and whether "average daily consumption" should use the last 30, 60 or 90 days.
