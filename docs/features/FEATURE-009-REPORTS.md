# FEATURE-009: Reports (P8)

**Status:** IMPLEMENTED 2026-10-25 (migrations 15 and 16 applied). Database tests and unit tests pass (see TESTING.md). An independent review by a second agent found no security problem and three small issues, all fixed. The screens have not yet been clicked through by the owner in a browser (sign-in needed).
**Owner decision:** "Build the whole system." The three open questions of the plan were answered with the AI's recommended defaults: CSV download (no new library), no stock valuation yet, permission by admin toggle.

## 1. What the owner gets (screen `/reports`)
| Report | Question it answers | Needs |
|---|---|---|
| Stock by place | How much of each item is in each place, and how much is on its way to that place (sent, not yet received)? | `reports.view` + `stock.view` (+ a transfers permission to see "on the way") |
| Low stock | What is at or below its minimum, and by how much, most short first? | `reports.view` + `stock.view` |
| Sales per day | Bills, subtotal, discount, total per day and place, split cash/UPI/card/other. Voided bills are not counted. India time. | `reports.view` + `bills.view` |
| What sold | Per item: quantity and amount in a date range, using the name and price saved on the bill. | `reports.view` + `bills.view` |
| Slow stock | Items in stock that were not sold from that place for N days (default 90), with the date of the last sale. A sale that was later voided does not count. | `reports.view` + `stock.view` |
Filters: place (all my places or one), dates, days. "Download CSV" gives the same rows as an Excel-friendly file (needs `reports.export`).

## 2. Design
- Five database functions `report_*` (migrations 15, 16). They are `SECURITY INVOKER`: they run as the signed-in person, so the existing row rules still decide which places and bills are visible. If a needed permission is missing, the function says which one instead of showing empty data.
- The download is a server route (`/reports/export`) that checks sign-in, active account and both report permissions, then runs the same function.
- Inputs: dates must be real calendar dates, the range at most 366 days, days 1..3650, place must be a UUID; anything else falls back to a safe default or is refused. Every report returns at most 20,000 rows.
- CSV: UTF-8 with byte-order mark (Excel shows Hindi correctly), CRLF, quotes where needed, and text starting with `= + - @` gets a leading apostrophe so Excel cannot run it as a formula.
- No purchase cost appears anywhere (it stays behind `receipts.cost`).
- One definition list (`src/lib/reports.ts`) feeds both the page and the download, so they cannot differ.

## 3. Alternatives considered
| Option | Why not (now) |
|---|---|
| Real `.xlsx` export | Needs a new library; CSV opens in Excel already. Can be added on request. |
| Stock valuation (quantity x cost) | Cost is protected by `receipts.cost`; a value report must be designed with the owner (which cost: last, average?). |
| Charts | Tables answer the daily questions; charts can be added later without changing the data functions. |
| Security-definer report functions | They would bypass row rules; invoker functions keep one set of rules. |

## 4. Review findings and what was done (2026-10-25)
| Finding | Action |
|---|---|
| Slow stock counted a voided sale as a sale (the ledger keeps the old SALE row) | Fixed in migration 16 and tested (R6b). A person who has `stock.view` but not `bills.view` cannot see which bills are voided, so for them a voided sale still counts as a sale (the item looks slightly less slow). Accepted and documented. |
| Missing companion permissions gave quiet zeros/empty tables | Fixed in migration 16: the report names the missing permission (tested R8a, R8b). "On the way" still needs a transfers permission and shows 0 without it. |
| A calendar-invalid date such as 2026-13-45 gave a database error | Fixed: dates are checked in the app with `z.iso.date()`. |

## 5. Limits and open points
- Not checked in a browser yet: layout, date pickers, the download button, mobile view; the CSV has not been opened in Excel.
- Sales are taken from bills made in this system. While billing is OFF (Zoho in use) the sales reports are empty.
- No ABC analysis, turnover or stock valuation yet.
