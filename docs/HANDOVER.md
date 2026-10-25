# HANDOVER

Newest entry on top. Read this first, update it last.

## 2026-10-25 (night 6): UI/UX pass with the owner's logos and colours (Claude Sonnet 5.5)

### Done (verified by command output)
- Logos from `Setmi_india_logos` resized into `public/brand` and `src/app/icon.png`; colours #005A84 and #EEF8FF in `src/app/globals.css`; grouped menu; Ctrl+K search with quick actions; phone bottom bar; 44 px touch targets; empty states; Help section. Details: `docs/features/FEATURE-015-UX-AND-BRAND.md`.
- `typecheck`, `lint`, `build` pass; unit tests 42/42; login page seen in a browser. Pushed as `d942ba8` (repo private).

### Not done / owner must do
- Open the home page after signing in, press Ctrl+K, try the phone view; tell me what feels hard.

## 2026-10-25 (night 5): repo private again, UI/UX skill installed

- Repo was made private again by the owner (anonymous page and API give 404); `8d8f672` pushed after that. Earlier commits were visible while it was public: no secrets were ever committed (scanned before every push), but the code and the Supabase project name were exposed.
- Installed the `ui-ux-pro-max` skill into `.claude/skills/ui-ux-pro-max/` (project level, not committed). Use in a NEW session; run `python .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system` (see its LOCAL-NOTE.md). Details: `docs/DEPENDENCIES.md`.

## 2026-10-25 (night 4): Zoho and Odoo comparison, Zoho-style dashboard widgets

### Done (verified by command output)
- G1/G2 pushed as `c6abc95`. **The GitHub repo turned out to be PUBLIC** (it was private before; every check until then said 404). Owner must make it private again (GitHub > Settings > Danger Zone). Until that is confirmed, new work is committed locally only and NOT pushed.
- `docs/REFERENCE-ZOHO-ODOO.md`: honest comparison. Inventory side is on par with Zoho/Odoo core; the sales and accounting side (customers, sales orders, invoices, credit notes, GST) is the large gap.
- Dashboard: top stocked items, top vendors, receive history (migration 27). DB test 015 13/13; typecheck, lint, build pass.

### Not done / owner must do
- Make the repo private; then say so and the local commits get pushed.
- Decide the next big step: customers + sales orders (no tax) or the sheet gaps G3/G7/G4 first.

## 2026-10-25 (night 3): quick Stock In/Out (G1) and automatic reorder (G2) (Claude Opus 5.5)

### Done (verified by command output)
- Read the owner's shop sheet 'IMS For Shop' (forms, AppSheet, Apps Script effects, reorder and indent tabs): `docs/REFERENCE-SHOP-SHEET.md` lists 8 gaps (G1-G8).
- G1 `/stock/entry`: Stock Out / Stock In with a reason (sold in Zoho, sample, damaged ...), scan, reference, English and Hindi; permission `stock.entry`.
- G2: item planning fields (lead time, safety factor, MOQ); `/reorder` with target and order quantity from real consumption, then one click to a draft purchase order.
- Migrations 23, 24, 25 applied; DB tests 016 21/21; unit tests 42/42; typecheck, lint, build pass. Details: `docs/features/FEATURE-014-QUICK-ENTRY-AND-REORDER.md`. Pushed as `c6abc95`.

### Not done / owner must do
- Give `stock.entry` to the shop staff in Admin > Users; fill Reorder planning on items (or wait for the sheet import, G7).
- Share the Apps Script code; answer the three questions at the end of `docs/ASSUMPTIONS.md`.
- Next gaps: G3 indent with approval, G7 import from the sheet, G4 daily closing report.

## 2026-10-25 (night 2): business dashboard (Claude Opus 5.5)

### Done (verified by command output)
- Language phase 1 pushed as `2250bf9`.
- `/dashboard`: sales with change vs the previous period, bills, average bill, low/out of stock, open and late purchase orders, goods on the way, receipts to post, sales-per-day chart, top items, payment mix, low stock by place, reorder list, latest movements; filters Today/7/30/90 days and place; English and Hindi. Data from `dashboard_data` (migrations 21, 22). DB tests 015 10/10; typecheck, lint, build, 35 unit tests pass; `motion` added (0 vulnerabilities). Details: `docs/features/FEATURE-013-DASHBOARD.md`. Pushed as `ace1134`.

### Not done / owner must do
- Open `/dashboard` after signing in and check the look (it could not be seen without signing in).

## 2026-10-25 (evening): English + Hindi screens, phase 1 (Claude Sonnet 5.5)

### Done (verified by command output)
- Usability work pushed as `843ef76`.
- Language switch English / Hindi on the login page and top bar (cookie `ims_lang`). Menu, top bar, login, home and the whole Help page are in both languages; Devanagari font added. Details and limits: `docs/features/FEATURE-012-LANGUAGES.md`. `typecheck`, `lint`, `build` pass; the login switch was clicked in the browser. NOT committed yet.

### Not done / owner must do
- Phase 2: translate the working screens module by module. Ask a Hindi-reading staff member to read the Hindi Help and menu and list wrong words.

## 2026-10-25 (later): usability pass, easy for anyone to use (Claude Sonnet 5.5)

### Done (verified by command output)
- Help page `/help` (Hinglish, 16 sections), context Help button on every screen, Help in the menu, home page rebuilt around jobs, admin first-time checklist from real data, clear message when a page is not allowed (`/?denied=1`). Details: `docs/features/FEATURE-011-EASY-TO-USE.md`.
- `typecheck`, `lint`, `build` pass; unit tests 35/35. P9 is pushed as `c6d77b7`; the usability work is pushed as `843ef76`.

### Not done / owner must do
- Look at the new home page and Help page after signing in; watch one new person do a job with only the app and tell me where they get stuck.
- Answer the language question at the end of `docs/ASSUMPTIONS.md`.

## 2026-10-25 (night): P9 purchase orders built from ideas in the owner ERP repo (Claude Sonnet 5.5)

### Done (verified by command output)
- Read `SetmiMis/erp` (public): see `docs/REFERENCE-ERP-REPO.md` for what was taken, what was left and why.
- P9: migrations 17 to 20 applied to the dev project (20 = fixes from the independent review). Purchase orders (draft, sent, partial, completed, cancelled), receipts against an order, close-short with a reason, A4 print, "Late" tag. DB tests `013_purchase_orders.sql` 37/37 PASS; old `009_receiving.sql` 32/32 still PASS; typecheck, lint, build pass; unit tests 35/35. Details: `docs/features/FEATURE-010-PURCHASE-ORDERS.md`.
- New permissions `purchase.view`, `purchase.create`, `purchase.approve` (admins have everything; give the others in Admin > Users).
- The test run found a real bug in the price guard (fixed by migration 18).
- P9 pushed as `c6d77b7` (previous: `124cb10` P8).

### Not done / owner must do
- Click through Purchase orders and Receipts-against-order in a browser (sign-in needed).
- Answer the three questions at the end of `docs/ASSUMPTIONS.md` (over-delivery tolerance, edit after send, approval limit).
- QC on receiving, customers, batch/lot, BOM/production were left out on purpose (see the reference file).


## 2026-10-25 (late): P8 reports built; UI polish pushed; deployment plan written (Claude Sonnet 5.5)

### Done (verified by command output)
- Owner asked for the whole system, built "like a DevOps, full-stack developer, boss, manager and employee". Done: online research, a review by role (ROADMAP "Review by role"), P8 reports, error pages, security headers, `.env.example`, `docs/DEPLOYMENT.md`.
- P8: migrations 15 and 16 applied to the dev project; DB tests `012_reports.sql` 19/19 PASS; unit tests 35/35; lint, typecheck and build pass. Screen `/reports`, CSV download `/reports/export`. See `docs/features/FEATURE-009-REPORTS.md`.
- A second agent (ruflo verifier) reviewed the reports code; its 3 low findings were fixed.
- UI polish pushed as `aa208e2` (colours from setmiindia.com).
- Permissions `reports.view` and `reports.export` exist but nobody has them yet except admins: give them in Admin > Users.

### Not done / owner must do
- Nothing is deployed. Deployment, DNS and a production Supabase project need the owner's explicit yes (see `docs/DEPLOYMENT.md`, day-one checklist).
- Dashboard settings: disable public sign-up, enable leaked password protection.
- Click through every screen in a browser (sign-in needed); try a scanner and printers.
- Open: GST/invoice rules, returns and credit notes, purchase orders, stock valuation, CSP header, `remove_demo_data.sql` does not remove bills.


## 2026-10-25: P6 pushed; P7 billing built behind an ON/OFF switch (Claude Sonnet 5.5)

### Done (verified by command output)
- Brand colours now follow setmiindia.com (read from its CSS on 2026-10-25): primary #005a84, hover #0a5075, page background #f2f5f7, text #3a3a3a/#4B4F58, accent red #b50505, font Inter. Tokens live in `src/app/globals.css` (change colours only there).
- UI polish (uncommitted): new look with sidebar + top bar, design tokens in `src/app/globals.css` (light and dark), shared classes in `src/lib/ui.ts`, `src/components/badge.tsx`, `nav-links.tsx`, icons from `lucide-react` (new dependency, see DEPENDENCIES.md). Legacy neutral/blue Tailwind shades are re-pointed to the new palette in globals.css, so older screens change colour without edits. Checked: typecheck, lint, build, 31 unit tests, login page in the browser. NOT checked: screens behind login (owner must sign in), mobile menu, dark mode on inner pages, printing. Billing/receipt print pages keep plain white paper.
- P7 committed and pushed as `beb401f` (`git ls-remote` = local HEAD, repo anonymous check 404 = private). Owner will click through all screens in the browser; printer size: no fixed choice (print at any size). Owner to enable Supabase "leaked password protection". Next: P8 reports (plan to be approved first).
- P6 committed and pushed as `981259d` (`git ls-remote` = local HEAD at that time).
- P7 per `docs/features/FEATURE-008-BILLING.md`: migrations 13 and 14 applied; DB tests 37/37; unit tests 31/31; lint/typecheck/build pass. After the tests the real database still has `billing_enabled = false` and 0 bills.
- Owner instruction: billing is done in Zoho now, so billing is built but switchable; tax left out for now (D-025).
- **Uncommitted and not pushed:** all of P7 (plus a ROLLBACK.md note about P6).

### What the owner must know
- The switch is OFF. Admin > Settings > "Switch billing ON" turns it on. While OFF, Zoho sales do not reduce stock here.
- Items need a selling price (item page, needs `items.edit_price`). Admins have it.
- These bills are not tax invoices.

### Owner to try (browser)
1. Item page: set a Selling price on a DEMO item. Settings: switch billing ON. Switch to a DEMO shop in the header, Billing: scan/search, complete a bill, print the receipt, then void it with a reason. Check Stock/History. Switch billing OFF again.
2. Still untried in the browser: uploads, barcode print/scan, Excel import, locations, stock, scan-count, receipts, transfers.

### Open
- Tax / GST / invoice numbers (owner postponed), returns with credit notes, customers, Zoho sales import, Excel import of prices.
- `remove_demo_data.sql` does not remove bills (see DATA.md).

### Next
P8 reports (stock by place incl. in-transit, low stock, sales per day, history export to Excel) or follow-ups from the owner's browser test.

---

## 2026-10-25 (earlier): P6 transfers built (Claude Sonnet 5.5)

### Done (verified by command output)
- P5 was pushed earlier as `83f8d1c`.
- P6 per `docs/features/FEATURE-007-TRANSFERS.md` section 0: migrations 11 and 12 applied; DB tests 38/38; unit tests 28/28; lint/typecheck/build pass; advisor has no new kind of warning; `remove_demo_data.sql` now also removes demo receipts and transfers (rolled-back test passed).
- The owner's reply to the P6 questions was empty ("1)"), so the plan's DEFAULTS were used (D-024).
- **Uncommitted and not pushed:** all of P6.

### Owner to try (browser)
1. Admin Users page: give a warehouse user `transfers.create` + `transfers.send` + `stock.view` and the DEMO warehouse; give a shop user `transfers.receive` + `transfers.view` + `items.view` + `stock.view` and a DEMO shop. (As admin you can do all steps yourself: switch place in the header.)
2. Transfers > New transfer (from the DEMO warehouse): scan or search items, or press "Fill from the other place's minimum levels" (some DEMO shop items are below minimum on purpose). Save and send. Switch to the shop, open the transfer, receive with "check by scanning", try a shortage. Look at Stock and History on both places.
3. Still untried in the browser: uploads, barcode print/scan, Excel import, locations, stock, scan-count, receipts.

### Open
- **GST / e-way bill** for stock moved between your places (ask the accountant). Until then only a plain dispatch note exists.
- Shortage booked as a loss with a note, or kept open?
- Older DB tests assume an empty database (see TESTING.md).

### Next
P7 billing at the shop (scan barcode, bill uses Selling_Item_Name, SALE movements; needs the invoice/GST rules from the accountant) or P8 reports (stock by place incl. in-transit, low stock, history export).

---

## 2026-10-25 (earlier): P5 pushed; P6 transfers planned (Claude Sonnet 5.5)

- P5 committed as `83f8d1c` and **pushed**: `git ls-remote origin` = local HEAD. Pre-push checks clean again (repo 404 without login, no secrets in any commit, no env file). Known-good for `docs/ROLLBACK.md` is now `83f8d1c` with the database at migration 010.
- P6 plan only: `docs/features/FEATURE-007-TRANSFERS.md` (DRAFT -> SENT -> RECEIVED, hidden "IN TRANSIT" system place, shortage booked visibly, scan to check on arrival, suggest from minimum levels). No code or database change. Waiting for the owner's "haan" and the six questions in section 7, especially the GST / e-way bill question for transfers between places (accountant).
- Uncommitted: that plan doc and this note.

## 2026-10-25 (earlier): scan-count pushed; P5 receiving built (Claude Sonnet 5.5)

### Done (verified by command output)
- Scan-to-count committed as `065e20f` and **pushed** (`git ls-remote` = local HEAD). Known-good for `docs/ROLLBACK.md` is now `065e20f` (database at migration 009).
- P5 per `docs/features/FEATURE-006-RECEIVING.md` section 0: migration 10 applied; DB tests 32/32; unit tests 28/28; lint/typecheck/build pass; advisor shows no new warning.
- The owner's reply to the P5 questions was empty, so the plan's DEFAULTS were used (D-023). Easy to change.
- **Uncommitted and not pushed:** all of P5 (migration 10, tests, suppliers + receipts screens, label/beep refactor, docs).

### Owner to try (browser)
1. Admin Users page: give a user `suppliers.manage`, `receipts.create`, `receipts.post`, `receipts.cost`, `items.view`, `stock.view` and a place. (As admin you already have everything.)
2. Suppliers > New supplier. Receipts > New receipt: scan or search items, quantities, prices, Save draft, then "Save and post". Check Stock for the added quantity and the History page for the RECEIPT line. Print the receipt and its labels.
3. Still untried in the browser: uploads, barcode print/scan, Excel import, locations, stock, scan-count.

### Open
- GRN numbers can have gaps (sequence). Does the owner need gap-free numbers per financial year?
- Purchase orders, returns to supplier, landed cost: not built; tell the AI if wanted.
- Printer model and label size; which real items are sold per metre.

### Next
P6 transfers (warehouse to shop with an in-transit state) or P7 billing with barcode scan. The ledger already supports TRANSFER and SALE movements.

---

## 2026-10-25 (earlier): Odoo Barcode docs read; scan-to-count built (Claude Sonnet 5.5)

- Owner asked to read Odoo's Barcode docs (Setup, Daily operations), check against our system and develop. Read (partially, see FEATURE-003 section 0b); findings written there and in ROADMAP.
- Built `/stock/scan`: count by scanning, per FEATURE-003 section 0c. lint/typecheck/build pass, unit tests 25/25. No new migration, no new dependency.
- Not verified: with a real scanner or in a browser.
- Uncommitted and not pushed: scan-count code (actions.ts refactor + new screen + label tip), docs, and the P5 plan doc from before.
- P5 (receiving) plan is still waiting for the owner's "haan" and its seven questions.

## 2026-10-25 (earlier): P4 pushed; P5 planned (Claude Sonnet 5.5)

- P4 committed as `2fab60a` and **pushed**. `git ls-remote origin refs/heads/main` = `2fab60a` = local HEAD. Pre-push checks again clean (repo 404 without login, no secrets in any commit, no env file staged). Known-good commit for `docs/ROLLBACK.md` is now `2fab60a` (database at migration 009).
- P5 plan only: `docs/features/FEATURE-006-RECEIVING.md` (suppliers, goods receipts DRAFT -> POSTED, scan to add lines, labels for received quantities, cost behind its own permission). No code or database change. Waiting for the owner's "haan" and the seven questions in section 7.
- Uncommitted: that plan doc and this note.
- Still untried by the owner in a browser: uploads, barcode print/scan, Excel import, locations, stock (with the DEMO data).

---

## 2026-10-25: pushed to GitHub; P4 stock built (Claude Sonnet 5.5)

### Done (verified by command output)
- P3 committed (`e2eb995`) and **pushed**: `git ls-remote origin` shows `main` at `e2eb995`. Pre-push checks: repo is not visible without login (404), secret scan over all commits clean, no `.env` tracked. See D-022.
- P4 per `docs/features/FEATURE-005-STOCK.md`: migrations 7-9 applied, DB tests 28/28 + 4/4, unit tests 25/25, lint/typecheck/build pass, demo data loaded (and its removal tested). Rollback record: `docs/ROLLBACK.md`.
- **Uncommitted and not pushed:** all of P4 (code, migrations 7-9, tests, seed scripts, docs).

### Owner to do (Supabase dashboard / browser)
1. Open Stock (header link): you are admin, so you see all DEMO places; use the header switcher. Try: count stock, opening-stock tick, History, min/max level, the "Low stock only" filter (some DEMO items are below minimum on purpose), an item page's unit dropdown.
2. Supabase dashboard > Authentication > Providers/Password: turn ON "leaked password protection" if your plan allows (advisor warning).
3. Still untried in the browser: uploads, barcode print/scan, Excel import, locations.

### Questions answered / open
- Answered: dummy data first; cables sold per metre; minimum levels wanted.
- Open: which REAL items are sold per metre (all are PCS until told); reel-to-metre conversion; printer model and label size.

### Next
Commit P4 (and push if you say so). Then P5: receiving goods from suppliers into a place (supplier list, receipt document, stock +). Or P4b: Excel import of stock counts. Tell the AI which first.

---

## 2026-10-25: Odoo docs read; P3 locations built (Claude Sonnet 5.5)

### Done (verified by command output)
- Odoo Inventory docs read (partially: several pages were only tables of contents, long pages cut near the end). What was taken, and what was not, is in `docs/ROADMAP.md` ("What we took from Odoo").
- P3 built per `docs/features/FEATURE-004-LOCATIONS.md` section 0: screens, working-location switcher, migration 6 (applied), DB tests 17/17, unit tests 23/23, lint/typecheck/build pass.
- Commit `5ecf6ae` (P2c, local). Everything of P3 is uncommitted.

### Owner to do
1. Items > Locations > New location: create the real warehouses and shops (codes like WH-MAIN, SHOP-01). Tell the AI the names if you want them reviewed.
2. Users page: assign each user to their place(s). A shop user then sees only that shop.
3. Still untried in the browser: uploads, barcode print/scan, Excel import, locations.

### Next
P4: stock ledger and balances per item per location, manual stock count/adjustment with a reason, stock view. Design follows the Odoo lessons (movements have from/to, "outside" for suppliers and customers).
Open questions for P4: opening stock (how will today's stock be loaded: Excel count per location?), units (metres/reels?), minimum stock levels per item per location.

---

## 2026-10-25: P3 plan written (Claude Sonnet 5.5)

- P2c committed locally as `5ecf6ae` (not pushed). Working tree was clean after that commit.
- Plan for warehouses and shops: `docs/features/FEATURE-004-LOCATIONS.md`. Only a document; no code or database change. Waiting for the owner's "haan" and the five answers in its section 7 (names/codes of warehouses and shops, shop details, multi-location users, racks, who creates locations).
- Still untried by the owner in the browser: uploads (P2b), barcode print and scan, Excel import (P2c).

---

## 2026-10-24: P2c Excel import (Claude Sonnet 5.5)

### Done (verified by command output)
- Commit `1ef206d`: barcode feature (local only).
- Import built per `docs/features/FEATURE-002-EXCEL-IMPORT.md` section 0 and D-020. Migration 5 applied, DB tests 16/16, unit tests 20/20, real `.xlsx` parsed OK, lint/typecheck/build pass, `npm audit` 0.
- `read-excel-file` installed (owner approved). `next.config.ts` server-action body limit 4 MB.

### Owner to try (needs login)
1. Google Sheet: File > Download > Microsoft Excel (.xlsx).
2. Items > Import Excel > choose the file > "Check file". Expected: about 36 rows ready, rows from 37 on skipped as empty, nine categories listed as new.
3. Look at the problems list (if any), keep "Generate SETMI barcode" ticked, press Import. Then open Items.
Also still untried by the owner: uploads (P2b), barcode print and scan (barcode feature).

### Things the owner may want to decide next
- Sheet row 10 (TW-17-INDIAN marked IMPORT) may be wrong.
- Printer type and label size (label presets are generic).
- Image and datasheet columns are not imported.

### Uncommitted
Import code, migration 5, tests, docs, `next.config.ts`, `package.json`.

### Next
After the owner's browser test: fix what they find. Then P3: locations (warehouses and shops) screens.

---

## 2026-10-24: barcode generation, labels, scan jump (Claude Sonnet 5.5)

### Done (verified by command output)
- Migration 4 applied; DB tests 13/13; unit tests 12/12; ZXing independent decode 2112/2112; lint, typecheck, build pass. Details in `docs/features/FEATURE-003-BARCODE.md` section 0 and `docs/TESTING.md`.
- UI: generate on item create (default on) and by button; label page with size presets; scan jump from the item search box; header hidden when printing.
- Internal_Item_Code limit 120 (D-019).

### Owner to try
1. Create an item (leave "Generate a SETMI barcode" ticked) -> see the barcode on the item page.
2. "Print labels" -> pick size -> Print one label on your label printer, margins None, scale 100%.
3. Scan it with your scanner into the Items search box: it should open the same item.
Tell the AI the printer model and label size so a preset can match it.

### Not done
- Billing (P7) uses the same scan lookup later. Excel import (P2c) still waits for the library "haan".
- Uncommitted: migration 4, tests, barcode code, label page, docs, the 120-length fix.

---

## 2026-10-24: barcode request + real sheet reviewed (Claude Sonnet 5.5)

- Owner shared a Scribd link (a 54-page student report; only a summary was readable, nothing useful for barcodes) and the Google Sheet with the real item master. Findings are in `docs/features/FEATURE-002-EXCEL-IMPORT.md` section 5b.
- **Bug found and fixed from the sample:** Internal_Item_Code max length was 64 but real codes reach about 85. Now 120 in `lib/validation/item.ts` and the item form (the database column has no limit). Unit test added with the real row. 7/7 tests, lint, typecheck pass. Uncommitted.
- New plan: `docs/features/FEATURE-003-BARCODE.md` (EAN-13 internal numbers starting with 2, label printing from the browser, scanner lookup). Not implemented. Waiting for "haan" and printer/label size.
- Plan P2c unchanged otherwise; the owner's Excel can be exported from the Google Sheet as .xlsx.

---

## 2026-10-24: P2c plan written (Claude Sonnet 5.5)

- P2b committed locally as `fbb2483` (not pushed). The owner has not yet tried uploads in the browser.
- Plan: `docs/features/FEATURE-002-EXCEL-IMPORT.md`. Proposed library `read-excel-file` (npm audit: 0 vulnerabilities); `xlsx` rejected (high, no fix); `exceljs` rejected (stale, moderate).
- `samples/` folder created and git-ignored for the owner's sample Excel.
- Nothing installed, no code written for P2c. Waiting for: owner's "haan" on the library, sample file in `samples/`, answers to section 6 of the plan.
- Uncommitted: `.gitignore` (samples/), the plan doc, this note.

---

## 2026-10-24: P2b images and datasheet upload (Claude Sonnet 5.5)

### Done (verified by command output)
- Commit `968d9fd`: P2a (local only).
- Upload flow per `docs/FLOW.md` / D-017: ticket -> direct upload -> server confirms real bytes. Up to 4 images (JPG/PNG/WebP, 5 MB) and 1 PDF datasheet (10 MB), shown on the item page via signed links, removable.
- `npm test` added (7/7 pass); storage policy DB tests (all pass); lint, typecheck, build pass.

### NOT verified
- Uploading a real file in the browser, 4-image limit in the UI, replace/remove, signed links. Please try on an item page: upload 1-2 JPGs, a PDF, try a renamed .txt file (should be rejected), remove one.
- Orphan files if an upload is never confirmed (documented limit).

### Uncommitted
P2b code, tests, docs, `tsconfig.json` and `package.json` (test script) changes.

### Next
P2c: Excel import. Needs a sample of the owner's Excel file and approval of one Excel library (the common `xlsx` package from npm has had security problems; the AI will propose a safer option first).

---

## 2026-10-24: P2a Item Master screens (Claude Sonnet 5.5)

### Done (verified by command output)
- Migration 3 applied (guards, created_by); 7/7 DB tests pass.
- Screens: item list (search by code/name/barcode, filters, 25 per page), new item, item page (edit, barcodes, archive/restore), categories page, nav link. Flow in `docs/FLOW.md`.
- lint, typecheck, build pass.
- Owner reported the login works.

### NOT done / NOT verified
- Item screens never clicked through with a real user. Please try: add a category, add an item (watch Selling Name copy Item Name), add/remove a barcode, search, archive/restore.
- Item images and datasheet upload (spec: 4 images JPG/PNG/WebP up to 5 MB, 1 PDF up to 10 MB; bucket `item-files` exists) -> P2b.
- Excel import -> P2c (need a sample file and the Excel library choice).
- The admin account holds every permission, so the permission-limited views (read-only item page, hidden buttons) are untested; try them later with a second user.
- Create item is two DB calls, not one transaction (documented limit).
- Rows are untyped in code (Supabase types not generated into the repo).

### Uncommitted
Migration 3, tests, all P2a code and docs.

### Next
P2b: image and datasheet upload with server-side type/size checks.

---

## 2026-10-24: P1 app code, login + guard + admin users (Claude Sonnet 5.5)

### Done (verified by command output)
- Commit `8c5e5a3`: Task 002/003 docs and migrations (local only).
- Installed `@supabase/supabase-js`, `@supabase/ssr`, `zod`. Created `.env.local` (git-ignored) with the project URL and publishable key.
- Code: `src/proxy.ts`, `src/lib/supabase/*`, `src/lib/auth.ts`, login (page/form/action), `(app)` layout with sign-out and inactive guard, home page, `/admin/users` with permission and location toggles. Flow in `docs/FLOW.md`.
- Template `src/app/page.tsx` removed (replaced by `(app)/page.tsx`); page title updated.
- lint, typecheck, build pass; unauthenticated `/` and `/admin/users` redirect (307).

### NOT verified
- A real login and the admin Save button: no user exists yet. Untested.
- Supabase rows are untyped in code (types file not generated into the repo yet).

### Owner steps still needed (Supabase dashboard)
1. Authentication settings: turn OFF "Allow new users to sign up".
2. Authentication > Users > Add user (email + password, auto-confirm). Tell the AI the EMAIL only; it will mark that user admin + active by SQL.

### Update (same day): first admin created
- Owner confirmed signups were turned off and created the first user in the Supabase dashboard. The only user (`mis@setmiindia.org`) was set `is_admin = true`, `is_active = true` by SQL (verified by the query result).
- P1 committed locally as `0247be3`. Not pushed.
- Real browser login still to be done by the owner (the AI never enters passwords).

### Next
Owner logs in on `npm run dev` and checks `/` and `/admin/users`. Then P2: categories and Item Master screens.

---

## 2026-10-24: Task 003, roadmap and database design (Claude Sonnet 5.5)

### Done
- Owner asked for the full project plan (warehouses + shops) and for development to start. `docs/ROADMAP.md` written (phases P0 to P9).
- Supabase project `setmi-inventory-management` (ref `arvdzlsimnofguwxkzev`) found by read-only listing; it has no tables and no migrations. Whether it is the intended IMS project is inferred from its name and creation date (today): owner to confirm.
- Two migration files written: `supabase/migrations/20261024000001_foundation.sql`, `20261024000002_item_master.sql`. Described in `docs/DATA.md`.

### Update (same day): migrations APPLIED
- Owner confirmed the project and allowed `apply_migration`. Both migrations applied to `arvdzlsimnofguwxkzev`. Owner confirmed this is the IMS project (closes A-011).
- DB tests 20/20 pass, data rolled back (see `docs/TESTING.md`). Security advisor: 7 accepted WARNs (see `docs/DATA.md`).

### Owner/dashboard steps still open
- Disable public signups in Supabase Auth settings.
- Create the first user (email + password) in Authentication > Users, then tell the AI the email so it can set `is_admin` + `is_active` by SQL.
- Auth URL/redirect settings when the site URL is known.

### Not done
- No app code for Supabase, auth or items yet.
- Nothing committed since `370f412`. Nothing pushed.

### Next
P1 app code: install `@supabase/supabase-js`, `@supabase/ssr`, `zod`; login page; server-side permission guard; admin users page. Needs the project URL and publishable key in `.env.local` (names only in docs).

---

## 2026-10-24: Task 002, Item Master requirements (Claude Sonnet 5.5)

### Done
- Spec written: `docs/features/FEATURE-001-ITEM-MASTER.md`. Owner answers recorded as D-007 to D-011 in `docs/DECISIONS.md` and A-001 to A-015 in `docs/ASSUMPTIONS.md`.
- Documentation only. No code, database or dependency changes.

### Key decisions
- `Selling_Item_Name` (bill name) is required, prefilled from `Item_Name`.
- Permissions are admin-configurable per user, not fixed roles.
- Archive only. Manual entry and Excel import both wanted.

### Still open (do not turn into DB constraints yet)
Category (list vs free text), whether `Internal_Item_Code` can change, Excel size/format, first users. Settled later the same day: `Import_item_code` optional and unique when filled; barcode value belongs to one item. Proposed, awaiting owner: separate barcodes table (several per item).

### State
Task 001 is committed locally (`370f412`, not pushed). Task 002 docs are uncommitted.

### Next recommended task
Task 003: database schema design (design document `docs/DATA.md` only, no migration, no Supabase access).

---

## 2026-10-24: Task 001, project base (Claude Sonnet 5.5)

### Done (verified)
- Git repo initialised locally, branch `main`, remote `origin` = `https://github.com/SetmiMis/setmi-inventory-management`. The GitHub repo was empty (`git ls-remote` returned no refs).
- Next.js 16.4.3 + React 19.3.0 + TypeScript + Tailwind v4 + ESLint scaffolded with `create-next-app` (App Router, `src/`, alias `@/*`).
- Added npm script `typecheck` (`next typegen && tsc --noEmit`). Reason: plain `tsc --noEmit` fails on a fresh checkout because `LayoutProps` is a Next-generated type.
- Docs created: README, CLAUDE, and docs/ HANDOVER, ARCHITECTURE, DECISIONS, ASSUMPTIONS, DEPENDENCIES, ENVIRONMENT.

### Checks run (actual results)
| Command | Result |
|---|---|
| `npm install` | 357 packages, 0 vulnerabilities |
| `npm run lint` | exit 0, no output |
| `npm run typecheck` (from clean, `.next` removed) | exit 0 |
| `npm run build` | exit 0, routes `/` and `/_not-found` static |
| `npm run dev -p 3100` + HTTP GET `/` | HTTP 200, stopped afterwards |

No automated tests exist yet.

### Not done
- Nothing committed or pushed.
- Supabase, auth, Item Master, deployment, DNS: not started.
- Default scaffold page (`src/app/page.tsx`) and title "Create Next App" are still the template's.

### Known warnings
- `npm install`: eslint 9.39.5 reported deprecated by npm.
- `npm install`: install script of `unrs-resolver` was not run (npm allowScripts). Lint and build still work. Revisit if tooling breaks.
- `next dev` may rewrite the generated block in `AGENTS.md`.

### Do not touch without permission
DNS, Vercel/production, any Supabase project, git history.

### Next recommended task
Task 002: finalize Item Master requirements (spec only, no code). Open questions are in `docs/ASSUMPTIONS.md`.

## 2026-10-25 audit session (hack / DevOps / UI-UX)
Read `docs/SECURITY-AUDIT-2026-10-25.md`. Migration 28 (security hardening) applied to the dev project, test `supabase/tests/018_security_hardening.sql` (10 PASS). CI workflow added at `.github/workflows/ci.yml` (never run yet). UI fixes: dark-mode contrast tokens, 44 px inline inputs, Enter returns to scan box, confirm on stock-count save, phone-menu keyboard handling, red cancel/void buttons. All of this is UNCOMMITTED, waiting for the owner's OK. Open items: discount permission, shortage approval, CSP, Supabase dashboard settings, rest of the UI list, matching the website look (owner link https://system-master-mu.vercel.app/).

## 2026-10-25 ERP-look pass (D-034)
Owner asked to copy the inventory UI/UX of `github.com/SetmiMis/erp`, full copy with indigo colours. Done: indigo tokens, top bar with drop-down menu (desktop), Stock and Stock ledger screens restyled, login gradient. Checked on screen: login page only (light). NOT seen: anything behind login (no test login available to Claude), dark mode, phone width. typecheck, lint, 42 tests and build pass. UNCOMMITTED. Other screens only pick up colours and table styling through `globals.css`; their layouts were not redone one by one.

## 2026-10-25 New login page (owner's mock)
Login page rebuilt like the owner's mock: teal on mint, two columns on a computer (left: tagline, 4 feature icons, picture, 3 trust points; right: sign-in card), card only on a phone. Logo: the round Setmi badge from `Setmi_india_logos` (the cube logo in the mock is NOT in that folder). Picture: right part of `Industrial Automation & Connectivity.png` from the same folder (saved as `public/brand/login-hero.jpg`), because the mock's warehouse photo is not available. Added: show/hide password, soft slide-up animation (off with "reduce motion"), English/Hindi texts. NOT added on purpose: "Forgot password", "Remember this device", "Sign in with Microsoft" (no working backend for them; would be fake buttons). Checked on screen at computer and phone width. The rest of the app is still indigo (D-034); login is teal. Uncommitted.

### Login page update (same day, owner request)
Logo is now the owner's round blue badge (`public/brand/setmi-round-192.png` and `-512.png`, cut from `SETMI INDIA Circular Tech Logo.png`). Added two working features: **Remember this device** (ticked = stays signed in; unticked = sign-in ends when the browser closes, done with the cookie `ims_session_only`, see `src/lib/supabase/session-cookie.ts`) and **Forgot password** (`/forgot-password` asks for the email, always shows the same answer; the email link opens `/auth/callback`, which exchanges the code and opens `/reset-password`). Still NOT added: "Sign in with Microsoft" (needs a Microsoft/Azure app and a Supabase provider; owner must decide).
**Owner to-do before Forgot password can send a working email:** in the Supabase dashboard, Authentication > URL Configuration > Redirect URLs, add `http://localhost:3000/auth/callback` (and the real site address later). Without it the link falls back to the Site URL. Supabase's built-in email sender has a low hourly limit; a custom SMTP is the fix later (new service: ask first).
Checked: login, forgot-password at computer and phone width; the request step answered correctly for an unknown email. NOT tested (needs a real login or a real email): the unticked "Remember" cookie in a real browser, and the whole email-link-to-new-password path. 45 unit tests pass (3 new), typecheck, lint, build OK. Uncommitted.

### Login page, second pass (new mock + browser tests)
Matched the new mock: big round logo + gradient "SETMI INDIA" wordmark and tagline top left, bigger logo in the card, language drop-down (globe + chevron, `components/language-dropdown.tsx`) also on forgot-password. Tested in the owner's real Chrome (Claude in Chrome) and in the built-in browser at 320x568, 375x812, 768x1024, 812x375 (phone sideways), 1024x768, 1280-1920 wide: no sideways scroll at any size. Found and fixed: the global heading rule overrode the big login headings (`main[data-auth]` now opts out); the left panel and wave had a colour step; on short screens (under 780 px high) the page needed scrolling (compact spacing added); drop-down stayed open after choosing a language; very small phones got tight padding. Known: tablets (768-1023 px wide) show only the sign-in card, the left panel starts at 1024 px. Not done: "Sign in with Microsoft", the warehouse photo (robot picture used instead), "Employee ID" login (the system signs in with email only). Window resizing through the Chrome extension did not change the real viewport, so the width tests came from the built-in browser's device emulation. Uncommitted.

## 2026-10-25 New dashboard shell and dashboard (owner's mock)
Whole app shell now follows the owner's dashboard mock: white left menu in groups (Master data, Purchase, Inventory, Sales, Reports, Administration), top bar (round logo + wordmark, hamburger that hides/shows the menu on a computer, wide search with Ctrl+K, bell = number of low-stock items, help, Light/Dark switch, user menu with name, role, language, sign out). The app colour is now teal (tokens at the top of `globals.css`); **Light is the default, Dark is a switch** (`data-theme` on `<html>`, remembered in this browser, set before first paint by a tiny fixed script in `src/app/layout.tsx`). After sign-in people with dashboard rights land on `/dashboard` (`/` redirects there). Favicon and apple icon are the round Setmi logo.
Dashboard page (`dashboard/page.tsx`) shows only real data: 5 cards (products, stock value at SELLING price, purchase orders, transfers on the way, bills), stock status donut, 30-day stock in/out, top categories, recent purchase orders and goods inward, low stock, transfers donut, recent activity, plus the older sales charts. Migration 29 adds `dashboard_extra(p_location)` (invoker function; test `supabase/tests/019_dashboard_extra.sql`, run on the dev project: admin gets all sections, a stranger gets `{}`, anonymous denied). NOT in the mock because the system has no such feature: Import Shipments, Sales Orders, Picking, Dispatch, Returns, Quality Check, Customers, Categories page.
Checked in the owner's real Chrome after the owner signed in: light and dark, theme saved across pages, user menu, Quick action menu, menu hide/show, 8 pages open without sideways scroll or console errors. NOT checked: phone and tablet widths of the new shell (Chrome extension cannot resize the window and the X-Frame-Options header blocks framing; needs a login in the built-in browser), Hindi on the dashboard. `src/app/(app)/top-nav.tsx` is now unused (deleting needs the owner's OK). Uncommitted.

### Dashboard, second pass: "exactly like the photo" (owner request)
Menu is now item for item the menu of the mock (Master data, Purchase & Import, Inventory, Sales & Dispatch, Reports, Administration). Items the system does not have yet are shown dimmed and open `/coming-soon/<name>` ("Coming soon", nothing faked): Locations (Racks), Customers, Import Shipments, Quality Check, Picking & Packing, Dispatch, Returns, Purchase Reports, Stock Valuation. Mapped to real screens: Categories, Warehouses (our Locations), Sales Orders (our Bills), Sales Reports. Jobs that are not in the mock's menu (Reorder, New bill, Help) are in Quick Action, the search box and the phone bar. The top bar no longer shows the "Working in" box (it is in the account menu; the dashboard has its own Warehouse box). The old sales charts section was removed from the dashboard. Cards have small 30-day trend lines (migration 30 `dashboard_spark`, test `supabase/tests/020_dashboard_spark.sql`: every line has 30 days, stranger gets nothing, anonymous denied; run on the dev project). Card names stay honest where the feature differs: "Transfers" (mock: Import Shipments), "Sales Bills" (mock: Sales Orders), "Transfers Status" (mock: Dispatch Status). Fixed while testing in the owner's Chrome: an invisible chart table stretched the page by 560 px; low stock table was cut off.
Checked in Chrome: light and dark, menu, Quick Action, coming-soon page, no console errors. Still NOT checked: phone and tablet widths of the new shell. Uncommitted.

## 2026-10-25 Product / SKU Master page (owner's mock)
`/items` is rebuilt like the owner's two mocks (light and dark): breadcrumb, title, Import / Export / Add Product (split button), 5 cards (Total, Active, Low Stock, Out of Stock, Inactive; each opens the matching filter), filter bar (search incl. barcode, Category, Source, Status, Clear, Filter), table with picture, SKU, name, category, unit, current stock, reorder level, status, source, actions (view, edit, more), numbered pagination with Rows per page, and a side panel for the chosen product (picture + thumbnails, tabs Details / Stock / Documents / History, barcode drawing, Edit Product, Print Barcode). The chosen product is in the address (`?sel=`), so everything is a plain server page.
Data: migration 31 `items_page(...)` (invoker function: rows with total stock and reorder level added over the places the person may see, status in/low/out/inactive, the five numbers); test `supabase/tests/021_items_page.sql` run on the dev project: admin gets rows and the 5 numbers, filters work, `%` and quote text are harmless, bad status refused, stranger refused, anonymous denied (all PASS). New route `/items/export` (CSV of the filtered list, up to 5000 rows, needs items.view).
Differences from the mock, on purpose: **Supplier** column/filter is "Source" (LOCAL/IMPORT) because items have no supplier field; **Brand, HSN code, Dimensions, Weight, Default location** are not shown (not Item Master fields; tax/HSN waits for the GST decision); **row checkboxes** are not shown (no bulk action exists); "Low Stock" means below its reorder level in at least one of the person's places (tooltip says so). Status filter in the old URL (`active/archived`) is replaced by the new values.
Checked in the owner's Chrome: light and dark, panel tabs (Stock, History), Low filter, CSV export, no console errors. NOT checked: phone width, pictures (no item in the dev data has an image), Hindi. The item edit page (`/items/[id]`) still has the old look. Uncommitted.

## 2026-10-25 Product Categories page (owner's mock)
`/items/categories` is rebuilt like the owner's two mocks: breadcrumb, title, Add Category (split button), 4 cards (Total, Active, Inactive categories, Total products), filter bar (search by name/code/description, Status, Sort By, Clear, Filter), table (#, picture, code, name, description, products, status, created on, view/edit/more), numbered pagination, Rows per page, and a side panel (Category Details with tabs Overview / Products, Category Image, Edit Category, Deactivate or Activate). Add and edit open in the side panel (`?new=1`, `?edit=<id>`); after saving the details of that category show.
Database: migration 32 adds two OPTIONAL columns to `categories`: `code` (up to 12 capital letters, digits or "-", unique) and `description` (up to 300 characters), and the invoker function `categories_page(...)` (rows with product count and a picture from the first product that has one, the numbers, filters, sort). Test `supabase/tests/022_categories_page.sql` run on the dev project: all PASS (rows and numbers, duplicate code refused, bad code refused, long description refused, search by code, `%` is text, bad status and sort refused, stranger refused, anonymous denied). Existing categories keep working with no code (shown as "-").
Differences from the mock, on purpose: **Delete Category** is "Deactivate Category" (nothing in this system is deleted; products keep pointing at their category); **Sub Categories** tab and **Created by / Updated by** are not shown (no such data); the **category image** is the picture of the first product in it, there is no "Change Image" (no place to store it yet); row **checkboxes** are not shown (no bulk action).
Checked in the owner's Chrome (light): list, side panel, Add form, Edit form, saving an unchanged edit (redirects to the details), no console errors. NOT checked: dark mode of this page, phone width, Hindi, saving a NEW category (not done, to keep the demo data clean), Deactivate. Uncommitted.
