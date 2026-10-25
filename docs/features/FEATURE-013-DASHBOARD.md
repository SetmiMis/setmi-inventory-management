# FEATURE-013: Business dashboard ("Blinkit-style" metrics and analysis)

**Status:** IMPLEMENTED 2026-10-25 (migrations 21, 22 applied). Database tests 10/10 PASS; `typecheck`, `lint`, `build`, 35 unit tests pass; `npm audit --omit=dev` 0 vulnerabilities. NOT yet seen on screen: the dashboard is behind login, and making a login-free preview would mean changing the login rule, which needs the owner's approval. Please open `/dashboard` after signing in.
**Owner request:** "Make the whole system like Blinkit, the way it gives metrics and analysis; build everything well so everyone can use it, like my business." Animation library ideas from the blog the owner shared (Motion, GSAP, React Spring, Three.js, Lenis, ...).

## 1. What the owner sees (`/dashboard`, also first in the menu and on Home)
Filters in one row at the top: **Today / 7 days / 30 days / 90 days** and **place** (all my places or one). Everything below follows the filters.

| Part | What it shows | Needs |
|---|---|---|
| Sales (big number) | Total of completed bills, counting up, with **% change against the same number of days before** (green up, red down) | `bills.view` |
| Bills, Average bill | Number of bills; total divided by bills | `bills.view` |
| Low stock, Out of stock, Items in stock | Item-and-place pairs below their minimum, at zero with a minimum, and with stock | `stock.view` + `items.view` |
| Open purchase orders | Sent or partly received orders, with how many are **late** | any purchase permission |
| Goods on the way to you | Transfers sent to your places and not yet received (and the ones you sent) | any transfers permission |
| Receipts waiting to post | Draft goods receipts | any receipts permission |
| Sales per day | Column chart, hover or keyboard shows the day's total and bills; "Show as a table" lists every day | `bills.view` |
| Top selling items | Top 5 by amount, with quantity | `bills.view` |
| How customers paid | Cash / UPI / Card / Other | `bills.view` |
| Low stock by place, Needs reordering | Where the low items are; the 8 most short items with quantity / minimum | stock |
| Latest stock movements | The last 8 movements in your places | stock |
Every tile links to the screen where you act on it (bills, low-stock report, purchase orders, transfers, receipts). A part you have no permission for is simply not shown.

## 2. Design
- **Data:** one read-only database function `dashboard_data(from, to, place)`. It runs as the signed-in person (security invoker), so the existing row rules decide which places, bills and documents count; each part is only filled when the person has that area's permission. Voided bills never count. No purchase cost is used. Range at most one year.
- **Charts:** drawn by hand in SVG (`src/components/charts.tsx`), no chart library, following the data-viz rules: one series in the brand colour, columns at most 24 px with a 4 px rounded top, hairline gridlines, labels in text colours, a tooltip on hover and keyboard focus with a hit area bigger than the column, a table view so nothing depends on hovering, no dual axis.
- **Animation:** the **Motion** library (MIT; the blog's first recommendation for React): cards slide in one after another, numbers count up, columns and bars grow. It obeys the computer's "reduce motion" setting (then everything just appears). GSAP, Three.js, Lenis and the copy-paste kits were not added: an inventory tool needs calm, fast screens, not 3D or scroll effects.
- **Languages:** the dashboard words are in English and Hindi (same switch as FEATURE-012).

## 3. Limits and open points
- Not seen in a browser yet (see Status). Layout on a phone, the tooltip position and the Devanagari text in the tiles need a look.
- Sales numbers come only from bills made in this system; while billing runs in Zoho the sales parts stay at zero.
- "Low stock" counts only items that have a minimum level set for that place.
- No profit or stock value yet (needs a decision about which cost to use, and the cost permission).
- Before the page's JavaScript loads, animated columns start hidden (standard for Motion); on a very slow connection they appear a moment later.

## Update (2026-10-25): Zoho-style widgets
The dashboard now also shows Top stocked items (by quantity), Top vendors (by posted receipts) and Receive history, as on the Zoho Inventory demo dashboard. See `docs/REFERENCE-ZOHO-ODOO.md` for the full comparison with Zoho and Odoo.
