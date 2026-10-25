# FEATURE-014: Quick Stock In / Out (G1) and automatic reorder (G2)

**Status:** IMPLEMENTED 2026-10-25 (migrations 23, 24, 25 applied). DB tests 21/21 PASS; unit tests 42/42; `typecheck`, `lint`, `build` pass. NOT yet used on screen (behind login).
**Source:** gaps G1, G2 and G6 found in the owner's shop sheet "IMS For Shop" (see `docs/REFERENCE-SHOP-SHEET.md`). Owner: "first build G1 and G2".

## G1: Quick Stock In / Out with a reason (`/stock/entry`)
Replaces the Google Form / AppSheet "In/Out" entries.
- Two big buttons **Stock Out / Stock In**, reason chips, scan or search items, quantity, optional reference (for example the Zoho bill number) and remarks, **Save entry**. Stock changes at once. English and Hindi words on this screen.
- Reasons. Out: Sold (billed in Zoho), Sample, Damaged, Own use, Lost, Returned to supplier, Other. In: Found, Customer return, Other. "Other" needs a remark.
- Database: `stock_entries` (`SE-000001`, place, direction, reason, reference, remarks, who/when) and `stock_entry_lines`; movement types `STOCK_OUT` / `STOCK_IN` with the entry number as reference. `create_stock_entry` (security definer) checks the new permission **`stock.entry`**, the user's place, item, quantity and decimals, and that a stock out does not exceed the stock (it names the short item); all or nothing. Entries can never be edited or deleted (trigger); a mistake is corrected with an opposite entry. Read: `stock.entry` or `stock.view` plus the place.
- Not a replacement for receiving goods from a supplier (use a goods receipt) or for counting (use a stock count).

## G2: Automatic reorder (`/reorder`) and planning fields on the item
Rebuilds the sheet's "science" from the real ledger.
- Item fields (Reorder planning, needs `items.edit`): **lead time (days)**, **safety factor** (1 to 10, empty = 1.5), **MOQ**.
- `reorder_suggestions(place, days)` (security invoker; needs `stock.view` and `items.view`), per item and place:
  - consumption in the last N days (30, 60 or 90) = sales + stock outs + transfers sent away - sale returns (counts/corrections are not consumption);
  - average daily use = consumption / N;
  - **target** = average daily use x lead time x safety factor (the sheet's Max Level); if the item has no lead time, the manual maximum of that place is used;
  - **order** = target - (in stock + still due on open purchase orders + transfers on the way), rounded up to the unit's decimals and to a multiple of the MOQ, never below 0;
  - days left = in stock / average daily use (red when shorter than the lead time).
- Screen: place and period filters, "only items to order" by default, then tick items, choose a supplier, **Create draft order**: one draft purchase order for that place opens (nothing is sent; prices are added by the buyer). Needs `purchase.create`.

## Rules to confirm with the owner (also in ASSUMPTIONS.md)
- The sheet's own reorder rule lives in its Apps Script, which could not be read; the formula above follows the sheet's Max Level formula. Please share the script so it can be matched exactly.
- Default average period is 30 days (owner did not choose yet).
- Transfers sent away count as consumption for the sending place (a warehouse that feeds shops). Should they?
- Open purchase orders are only counted for people who may see purchase orders.

## Limits
- Not seen on screen yet. The reorder screen is English only for now.
- The dashboard does not yet show "items to order".
- Planning fields are not in the Excel import yet (G7).

## Update after review (2026-10-25)
- Demand for the reorder formula = sales + transfers sent away + stock outs with the reason "Sold" (billed in Zoho). Damaged, lost, sample, own use and returned-to-supplier are NOT demand. A recalled transfer is not demand. Migration 26.
