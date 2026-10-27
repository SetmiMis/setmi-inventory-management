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

## 2026-10-25 Suppliers page (owner's mock)
`/suppliers` is rebuilt like the owner's two mocks: breadcrumb, title, Export, Add Supplier (split button), 5 cards (Total, Active, Inactive, Suppliers with Orders, Import Suppliers), filter bar (search, Supplier Type, Status, Country, Clear, Filter), table (#, code, avatar + name, type, country, city, contact person with phone, status, view/edit/more), numbered pagination, Rows per page, and a side panel (Overview / Contact / Orders tabs, the three counts Total Orders, Receipts Posted, Pending Orders, Edit Supplier, View Orders, Archive/Restore). New route `/suppliers/export` (CSV of the filtered list). The add and edit forms are still the old full pages (`/suppliers/new`, `/suppliers/<id>`), now with the new fields.
Database: migration 33 adds to `suppliers`: `code` (automatic SUP-001, SUP-002..., unique, from a sequence), `city`, `website`, `payment_terms`, `currency` (3 letters, default INR), all with length checks; and the invoker function `suppliers_page(...)`. Test `supabase/tests/023_suppliers_page.sql` run on the dev project: all PASS (code made automatically, bad currency refused, rows and numbers, countries list, filters together, `%` is text, bad type refused, stranger refused, anonymous denied). Unit tests for the new supplier fields added (47 pass).
**Dev data:** the suppliers table was empty, so 5 DEMO suppliers (SUP-001 to SUP-005, one inactive) were added to the dev project so the screen can be seen; `supabase/seed/remove_demo_data.sql` already removes suppliers whose name starts with "DEMO ".
Differences from the mock, on purpose: **Import** button (no supplier importer exists), **Delete** (suppliers are archived, never deleted), country **flags**, supplier **logos** and the "Manufacturer" tag, the **Products** and **Documents** tabs, row **checkboxes**, and **Total Received in rupees** (buying prices stay behind the receipts.cost permission; the panel shows the number of posted receipts instead).
Checked in the owner's Chrome (light): list, side panel, edit page with the new fields, CSV export (phone numbers start with a quote on purpose, against spreadsheet formula tricks), no console errors. NOT checked: dark mode of this page, phone width, Hindi, the Orders tab with real orders (no orders in the dev data), saving a new supplier from the form, Archive. Uncommitted.

## 2026-10-25 Warehouses page (owner's mock)
`/locations` (menu: Warehouses) is rebuilt like the owner's two mocks and shows warehouses AND shops: breadcrumb, title, Add Warehouse (split button), 4 cards (Total Places, Total Capacity, Products in Stock, Average Utilization with a bar), filter bar (search, Type, Status, City, Clear, Filter), table (#, code, name with type, address, city, capacity, products in stock, utilization bar, status, view/edit/more), numbered pagination, Rows per page, the charts "Stock by Warehouse" and "Warehouse Utilization" (donut), and a side panel (Overview / Stock / Team tabs, four tiles Product slots, Occupied, Available, Utilization, Edit Warehouse, Archive/Restore). The hidden in-transit place is never shown.
**What "capacity" means here (decision, please confirm):** the number of product slots (bins) a place has; every product that has stock in the place uses one slot, so utilization = products in stock / capacity. Quantities of different units (pieces, metres, boxes) are never added together, so the mock's "Total Stock Quantity 1,24,860" became "Products in Stock". Capacity is optional; without it the place shows "-".
Database: migration 34 adds optional `city`, `capacity` (0 to 10,000,000), `contact_person`, `phone`, `email` to `locations` (length and range checks) and the invoker function `locations_page(...)`. Test `supabase/tests/024_locations_page.sql` run on the dev project: all PASS (rows and numbers, in-transit place left out, filters and 0% use, negative capacity refused, `%` is text, transit type and bad status refused, a stranger sees no places, anonymous denied). The place form now has City, Capacity, Contact person, Phone, Email (still the old full page `/locations/new` and `/locations/<id>`); 1 new unit test (48 pass).
Dev data: the three DEMO places got a city, capacity and contact details so the page can be seen (Delhi 30, Mumbai 20, Gurgaon 15 slots).
Differences from the mock, on purpose: **Delete** is "Archive" (places are never deleted; the stock history points at them), **building pictures**, **GST number** (waits for the GST decision), **Locations (racks) tab**, **History tab**, **Blocked / Reserved** slice, row **checkboxes**. The email and website text in the panels of this page and of Suppliers now wraps (it pushed the page sideways).
Checked in the owner's Chrome (light): list, panel, both charts, no console errors. NOT checked: dark mode of this page, phone width, Hindi, saving a new place, Archive (the database may refuse to archive a place that still has stock). Uncommitted.

## 2026-10-25 Locations (Racks) page (owner's mock)
`/locations/racks` (menu: Locations (Racks), no longer "Coming soon") is built like the owner's two mocks: breadcrumb, title, Export, Add Location (split button), 4 cards (Total, Occupied, Available, Blocked / Reserved), filter bar (search by code, rack or product; Warehouse; Rack; Status), table (code, warehouse city, rack, level, bin, type badge Bin / Shelf / Pallet, status badge, current stock, capacity, utilization bar, view/edit/more), numbered pagination, Rows per page, and a side panel (details, tabs Items (N) and Notes, put a product in the bin by SKU, remove a product, Edit Location, Block / Unblock). Add and Edit open in the side panel. New route `/locations/racks/export` (CSV).
Database: migration 35 adds tables `storage_bins` (place, rack, level, bin, automatic code, type, capacity, blocked + reason, notes) and `item_bins` (which product sits in which bin; one bin per product per place), with row-level security (see: places the person may access, change: locations.manage), audit triggers, no delete for bins, and the invoker function `bins_page(...)`. Test `supabase/tests/025_storage_bins.sql` run on the dev project: all PASS (code made automatically, duplicate bin refused, bad rack and type refused, new bins Available, assigned product makes the bin Occupied with its stock, one bin per product per place, a bin cannot be used for another place, search by product, blocked filter, `%` is text, bad filters refused, assignment can be removed, bins cannot be deleted, a stranger sees no bins and cannot add one, anonymous denied). 3 new unit tests (51 pass). **See docs/ASSUMPTIONS.md: racks do not move stock; please confirm.**
Dev data: 8 DEMO bins (6 in DEMO-WH, 2 in DEMO-SHOP1; one blocked; one over capacity at 113% to show the red bar) and 6 product assignments; `supabase/seed/remove_demo_data.sql` now removes them first.
Differences from the mock, on purpose: **Bulk Import** (no importer yet), **History** and **Assignments** tabs, the location **photo**, row **checkboxes**, **Delete** (Block instead), and the **Level / Bin** numbers are free text of 1 to 6 letters or digits.
Checked in the owner's Chrome (light): list, side panel, Add form, refused SKU messages (unknown SKU, product already in another bin), no console errors. NOT checked: dark mode, phone width, Hindi, saving a new bin from the form, Block, Edit. Uncommitted.

## 2026-10-25 Customers page (owner's mock) and customer on the bill
`/customers` (menu: Customers, no longer "Coming soon", shown to people with customers.view or customers.manage) is built like the owner's two mocks: breadcrumb, title, Export, Add Customer (split button), 5 cards (Total, Active, Inactive, Total Orders, Total Sales Value), filter bar (search incl. GST number, Customer Type, Status, City), table (code, avatar + name, type badge Dealer / Distributor / Retailer / OEM / Project / Government, city and state, contact person and phone, status, orders, total sales, view/edit/more), numbered pagination, Rows per page, and a side panel (Overview / Contact / Address / Orders / Notes tabs, four tiles Total Orders, Total Sales, Credit Limit, Last Order, Edit Customer, Deactivate/Activate). Add and Edit open in the side panel. New route `/customers/export` (CSV).
**Billing change (money path, please look):** migration 36 replaces `create_bill` with the same function plus an optional `customer_id` in the header (checked: the customer must exist and be active; an empty name or phone on the bill is filled from the customer). The billing screen has a "Customer from your list (optional)" picker that fills the name and phone boxes. `bills.customer_id` is new and nullable. The old billing regression test 011 was re-run on the dev project after the change: every check that does not depend on the billing switch passed; B0, B1, B3 and B13 show FAIL only because billing is currently ON in the dev project (the test assumes OFF at the start). B18 was updated (anonymous now has no access at all, stricter since migration 28).
Database: migration 36 adds permissions `customers.view` / `customers.manage`, table `customers` (RLS: read for customers.view, customers.manage, bills.create, bills.view; change for customers.manage; audit; code never changes), `bills.customer_id`, the new `create_bill` and the invoker function `customers_page(...)`. Test `supabase/tests/026_customers.sql` run on the dev project: all 20 PASS. 3 new unit tests (54 pass). Assumptions are in docs/ASSUMPTIONS.md (GST only stored, credit limit is a note, no deletes).
Dev data: 8 DEMO customers (CUST-001 to CUST-008, one inactive); `supabase/seed/remove_demo_data.sql` removes DEMO customers that have no bill.
Differences from the mock, on purpose: **Import** button (no importer), **Delete** (Deactivate), **Outstanding** (no receivables), row **checkboxes**, **sparklines** on the cards. Orders and sales are 0 for the demo customers because no bill points at them yet.
Checked in the owner's Chrome (light): list, side panel, billing picker (shown in a shop, hidden in a warehouse), no console errors. NOT checked: dark mode, phone width, Hindi, saving a customer from the form, making a bill with a customer on screen (the database part is tested). Uncommitted.

## 2026-10-25 Purchase Orders page (owner's mock)
`/purchase-orders` (menu: Purchase Orders) is rebuilt like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Create Purchase Order (split button, second entry goes to the Reorder list), 6 cards (Total, Open, In Transit = sent and nothing received, Received (Partial), Completed, Overdue), filters (search PO number / supplier / item, Supplier, Order Type Import/Domestic, Status incl. Overdue, Date From/To, Clear, Filter), table with numbered pagination and Rows per page, and a side panel with tabs Overview / Items (N) / Receipts (N), supplier box with "View Supplier", Order Progress timeline, Print PO or Edit PO (draft), Receive Items and a "More" menu (full page, print, send, cancel).
Database: migration 37 adds the invoker function `purchase_orders_page(...)`. Needs purchase.view, purchase.create or purchase.approve. The order value is returned only to people with `receipts.cost`; others get null and the column and the three value boxes are hidden. Test `supabase/tests/027_purchase_orders_page.sql`: P1 to P13 all PASS (run in dev, rolled back).
**Order Type** comes from the supplier's type (Import supplier = Import order); an order has no type of its own. Overdue = sent or partly received and the expected date is before today (India time).
Dev data: 5 DEMO purchase orders (PO-000019 to PO-000023: overdue import, import in transit, domestic sent, domestic draft, cancelled). Numbers start at 19 because test runs used up some numbers. `supabase/seed/remove_demo_data.sql` now also removes POs of DEMO places or DEMO suppliers.
Differences from the mock, on purpose: **Import** button (no importer), **Documents** and **History** tabs, row **checkboxes**, **currency** is always INR (orders have no currency), the Approved step (there is no approval step; Created, Sent, Receiving, Completed/Cancelled are shown). No completed or partly received demo order exists, so those two states were only checked in the database test, not on screen.
Checked in the owner's Chrome (light): list, cards, filters (status, search), panel tabs, timeline, no console errors. NOT checked: dark mode, phone width, Hindi, the CSV download in the browser (blocked in my tool), Send / Cancel from the menu, Receive Items button.

## 2026-10-26 Import Shipments page (owner's mock)
`/import-shipments` (menu: Import Shipments, no longer "Coming soon", shown to people with shipments.view or shipments.manage) is built like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Add Import Shipment (split button), 6 cards (Total, In Transit, Arrived at Port, Customs Clearance, Delivered, Delayed), filters (search, Supplier, Status incl. Delayed, Port of Loading, Port of Discharge), table with numbered pagination and Rows per page, and a side panel with tabs Overview / Items (N) / Charges (N, only with receipts.cost) / History, supplier box with "View Supplier", Shipment Progress line with dates, Total Items / Total Value / Expenses, an "Update status" box (status + date + note) and Edit Shipment.
Adding is two steps: choose the purchase order (only sent Import orders), then fill the form; the item list shows how much of each line is still free to ship.
Database: migration 38 adds permissions `shipments.view` / `shipments.manage`, tables `import_shipments`, `import_shipment_lines`, `import_shipment_events` (status history), `import_shipment_charges` (all with RLS; read only, no direct writes), functions `save_import_shipment`, `set_import_shipment_status`, `add_import_shipment_charge`, `remove_import_shipment_charge` (SECURITY DEFINER, each checks permission and place) and the invoker function `import_shipments_page(...)`. Test `supabase/tests/028_import_shipments.sql`: S1 to S25 all PASS (run in dev, rolled back).
Business rules are in `docs/ASSUMPTIONS.md` (shipments never move stock; one PO per shipment; quantity limits; status flow; charges are information only). Please confirm the stock rule.
Dev data: 6 DEMO shipments (IMP-2026-001 to 006) on PO-000019 and PO-000020, in every status, with some charges; `supabase/seed/remove_demo_data.sql` removes them first.
Differences from the mock, on purpose: **Import** button (no importer), **Documents** tab and **Upload Documents** (no file storage yet), row **checkboxes**, **sparklines/percent** on the cards, supplier **flag and ship photo**, **Items** value per item shown only with receipts.cost. The mock's Container per shipment is one text field (not many containers).
Checked in the owner's Chrome: list, cards, panel, add flow (step 1 and 2, saved IMP-2026-006), status update (Booked to In Transit), dark mode of the panel. NOT checked: charges form, edit form saving, CSV download in the browser (blocked in my tool), phone width, Hindi, dark mode of the table and cards.

## 2026-10-26 Goods Inward (GRN) page (owner's mock)
`/receipts` (menu: Goods Inward (GRN)) is rebuilt like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Create GRN (split button), 6 cards (Total GRNs, Received Today, Pending (Draft), Posted (Stocked), Partly Received, Cancelled), filters (search GRN / PO / supplier / invoice / item, Warehouse, Supplier, Source Import/Domestic, GRN Status, Date From/To, Clear, Filter), table with numbered pagination and Rows per page, and a side panel with tabs Overview / Items (N) / History, supplier box with "View Supplier", Receiving Progress (Created, Stock Updated or Cancelled), Print GRN and Open GRN (Open / Post for a draft). The full receipt page (`/receipts/[id]`, `/receipts/new`, print, labels) is unchanged; posting and editing still happen there.
Database: migration 39 adds the invoker function `receipts_page(...)` only (no table change). Needs receipts.view, receipts.create or receipts.post. Test `supabase/tests/029_receipts_page.sql`: G1 to G15 all PASS (run in dev, rolled back).
Words differ from the mock because there is no quality check yet (see `docs/ASSUMPTIONS.md`): Draft / Posted / Cancelled instead of Pending Inspection / Accepted / Rejected. GRN numbers stay GRN-000001 style.
Dev data: 5 DEMO receipts (GRN-000027 to 031): partly received import order, full import order, full domestic order, a draft and a cancelled one. Posting them added DEMO stock in the Demo main warehouse; `remove_demo_data.sql` already removes receipts of DEMO places.
Differences from the mock, on purpose: **Import** button (no importer), **QC** and **Documents** tabs, Shipment No. and Container No. in the panel (no link to shipments), row **checkboxes**, **sparklines/percent** on the cards, supplier **flag and logo**.
Checked in the owner's Chrome: list, cards, panel (cancelled receipt), light and dark mode. NOT checked: CSV download in the browser (blocked in my tool), Create GRN split menu, filters on screen, phone width, Hindi.

## 2026-10-26 Quality Check page (owner's mock)
`/quality-check` (menu: Quality Check, no longer "Coming soon", shown to people with qc.view or qc.manage) is built like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), New Quality Check, 5 cards (Total QC Batches, Passed, Rejected, Pending, Rework), filters (search QC / GRN / PO / item / supplier, Warehouse, Supplier, Status, QC Date From/To, Clear, Filter), table with numbered pagination and Rows per page, and a side panel with tabs Overview / Items (N) / History, supplier box with "View Supplier", the "Quality Check Summary" (four rings: total, passed, rejected, rework), the table of rejected / rework items with reasons, View GRN and Record Results (Recheck once recorded).
How it works: New Quality Check lists posted receipts that have no check; choosing one makes a Pending check and opens the results form in the panel (passed starts as the full quantity, you type only the problem pieces). Saving checks that the numbers add up and that rejected / rework pieces have a reason.
Database: migration 40 adds permissions `qc.view` / `qc.manage`, tables `quality_checks` and `quality_check_lines` (RLS, read only, no direct writes), functions `create_quality_check`, `save_quality_check_results` (SECURITY DEFINER, each checks permission and place) and the invoker function `quality_checks_page(...)`. Test `supabase/tests/030_quality_checks.sql`: Q1 to Q21 all PASS (run in dev, rolled back), including "a quality check does not change stock".
Business rules are in `docs/ASSUMPTIONS.md` (a check is only a record; stock is not held back; status follows the numbers).
Dev data: 3 DEMO checks (QC-2026-001 rejected and rework on GRN-000027, QC-2026-002 passed on GRN-000028, QC-2026-003 pending on GRN-000029); `supabase/seed/remove_demo_data.sql` removes them before the receipts.
Differences from the mock, on purpose: **Import** button, **Images** and **Documents** tabs (no file storage), row **checkboxes**, **sparklines/percent** on the cards, the **Shipment No.** and **Container No.** fields (receipts are not linked to shipments), a separate **Recheck** button (Record Results is called Recheck once done), **Update Status** (status is calculated, not chosen), the SKU column in the rejected table (item code is shown).
Checked in the owner's Chrome (light): list, cards, panel, results form, a refused save (numbers not adding up) with the message shown. NOT checked: a successful save from the screen, the New Quality Check chooser, CSV download in the browser (blocked in my tool), dark mode of this page, phone width, Hindi.

## 2026-10-26 Current Stock page (owner's mock)
`/stock` (menu: Current Stock) is rebuilt like the owner's two mocks and now shows ALL the places the person works in (the old page showed only the current place): breadcrumb, title, Export (CSV with the same filters), Add Item (split button: new product, Quick Stock In/Out, Count stock, Count by scanning, Stock history), 6 cards (Total Items SKU, Total Stock Quantity, Stock Value INR, Low Stock, Out of Stock, Over Stocked), filters (search SKU / name / category / barcode / rack, Category, Warehouse, Stock Status, Clear, Filter), table (picture, SKU, name, category, warehouse, rack, current / min / max stock, status, actions) with numbered pagination and Rows per page, and a side panel for one product in one place: tabs Overview / Stock Movement / Locations, picture, details, min/max form (current place only), "Stock by Warehouse" bars, "Recent Stock Movement" with the running balance, Open Product and Stock History.
Database: migration 41 adds the invoker function `current_stock_page(...)` only (no table change). Needs stock.view. Test `supabase/tests/031_current_stock_page.sql`: C1 to C12 all PASS (run in dev, rolled back).
Rules (status, average cost, what is shown) are in `docs/ASSUMPTIONS.md`. Please confirm the average-cost rule.
Differences from the mock, on purpose: **Import** button, **Brand** filter and field, **HSN Code** (GST waits), **Reserved / Available stock**, **Documents** tab, row **checkboxes**, **sparklines/percent** on the cards, picture gallery (only the first picture).
Checked in the owner's Chrome (light): list with pictures placeholders, cards (value shown for an admin), panel, movement balance, no page-wide sideways scroll. NOT checked: the filters on screen, the Add Item menu, saving min/max from the panel, CSV download in the browser (blocked in my tool), dark mode of this page, phone width, Hindi. Demo products have no pictures, so the picture column shows the grey box.

## 2026-10-26 Stock Ledger page (owner's mock)
`/stock/movements` (menu: Stock Ledger) is rebuilt like the owner's two mocks, for ALL the places the person works in (the old page showed only the current place): breadcrumb, title, Export (CSV with the same filters), Print (prints the screen), Stock Ledger Report (goes to Reports), 6 cards (Total Transactions, Stock In, Stock Out, Transfer, Adjustment, Return), filters (search SKU / name / reference / remarks / place, Item Category, Warehouse, Transaction Type, Date From/To, Clear, Filter), table (date and time, type, reference, SKU, item, warehouse, in, out, balance, user, remarks) with numbered pagination and Rows per page (15 by default), and a side panel for one product in one place: tabs Overview / Stock Ledger / Warehouse Stock, details, "Stock Balance Trend (Last 30 Days)" line, "Recent Transactions (This Item)" with the running balance.
Database: migration 42 adds `stock_ledger_page(...)` (SECURITY INVOKER, needs stock.view; the balance is a running sum over the movements the person may see) and the small helper `person_name(uuid)` (SECURITY DEFINER; gives only "First L." and only to people with stock.view). Test `supabase/tests/032_stock_ledger_page.sql`: L1 to L16 all PASS (run in dev, rolled back).
Rules and words are in `docs/ASSUMPTIONS.md`. Differences from the mock, on purpose: **Brand**, **HSN**, **Reserved / Available stock**, **Documents** tab, **User** filter (the light mock has none), row **checkboxes**, **sparklines/percent** on the cards, product picture gallery; the panel's Average Cost and Stock Value are not repeated (see Current Stock).
Checked in the owner's Chrome (light): list, cards, panel, trend line, no page-wide sideways scroll. NOT checked: the filters on screen, Print, CSV download in the browser (blocked in my tool), dark mode, phone width, Hindi. Demo data is only a day old, so the 30-day trend is nearly flat.

## 2026-10-26 Stock Transfer page (owner's mock)
`/transfers` (menu: Stock Transfer) is rebuilt like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Print, New Stock Transfer, 4 cards (Total, Completed, In Transit, Cancelled), filters (search transfer no / SKU / item name, From Warehouse, To Warehouse, Status, Date From/To, Clear, Filter), table (transfer no, date, from, to, items, total qty, status with a Shortage tag, requested by, actions) with numbered pagination and Rows per page, and a right panel with two tabs like the mock: "Create Transfer" (the existing editor: receiving place, notes, scan or search items, suggest from minimum levels, save draft, send) and "Transfer Details" (details, Transfer Progress, items with sent and received, and the Receive form, Recall button, Print Note and Open Full Page / Edit Draft where the person may).
Database: migration 43 adds the invoker function `transfers_page(...)` only (no table change; needs a transfers permission; place rules apply). Test `supabase/tests/033_transfers_page.sql`: T1 to T14 all PASS (run in dev, rolled back). The editor now returns to this page after saving or sending (before: the full page).
Rules and differences are in `docs/ASSUMPTIONS.md`. Differences from the mock, on purpose: **Date** and **Reference No.** fields (a transfer has only remarks), **From Warehouse** as a choice (it is the place you work in), item **pictures** and **Available** column in the form, row **checkboxes**, **sparklines/percent** on the cards, one "Submit" button (two buttons: save draft, send).
Dev data: 4 more DEMO transfers (TRF-000023 in transit, TRF-000024 received with a shortage, TRF-000025 draft, TRF-000026 cancelled) next to the old demo one; `remove_demo_data.sql` already removes transfers of DEMO places.
Checked in the owner's Chrome (light): list, cards, Create tab with the form, Details tab with progress and items, no page-wide sideways scroll. NOT checked: saving or sending a transfer from the new panel, receiving from the panel, filters on screen, Print, CSV download in the browser (blocked in my tool), dark mode, phone width, Hindi.

## 2026-10-26 Stock Adjustment page with manager approval (owner's mock)
`/stock/entry` (menu: Stock Adjustment) now shows the mock: breadcrumb, title, Export (CSV with the same filters), Print, New Adjustment, 6 cards (Total Adjustments, Increase Qty, Decrease Qty, Pending Approval, Approved, Rejected), filters (search adjustment no / SKU / item / reference, Warehouse, Adjustment Type, Status, Date From/To, Clear, Filter), table (date and time, adjustment no, first SKU and "+N more", item, warehouse, type, signed quantity, reason, status, requested by, actions) with numbered pagination and Rows per page, two charts under it (Adjustment Reasons this month as a donut, Adjustment Trend last 30 days as paired columns), and a right panel with the tabs "Create Adjustment" (the existing Stock In / Out form: scan or search items, reason, reference, remarks) and "Adjustment Details" (details, progress Requested to Approved or Rejected, items, and for a manager the Approve / Reject box).
**Approval (stock path changed, please look):** migration 44 adds the permission `stock.approve`, the columns status / decided_by / decided_at / decision_note on `stock_entries`, the functions `approve_stock_entry`, `reject_stock_entry` (SECURITY DEFINER), and replaces `create_stock_entry` so an entry by a person WITHOUT stock.approve stays PENDING and writes no stock movement; the movement is written when a manager approves (after checking the stock again). A person WITH stock.approve is approved at once. Old entries are marked Approved. The guard trigger now allows only one change on an entry: PENDING to APPROVED or REJECTED. Also `stock_adjustments_page(...)`; and the ledger function now accepts the type STOCK_IN (the ledger screen got "Stock in" in its type list).
Test `supabase/tests/034_stock_entry_approval.sql`: A1 to A5 and A7 to A24 PASS (run in dev, rolled back). The earlier A5 and A6 "direct update refused" were wrong as first written (a plain update without a policy changes zero rows and raises nothing); the test now checks that the row stays unchanged, and I checked once by hand, as table owner, that the guard trigger refuses an update of a pending entry (it did).
Business rules are in `docs/ASSUMPTIONS.md`: manager's own entry is approved at once (please confirm); no new reasons; counts and opening stock stay on the Physical Count page.
Dev data: 5 DEMO adjustments (SE-000020 to 024): two approved (sample out, found in), one approved from the screen (damaged), one pending (customer return), one rejected (lost); `supabase/seed/remove_demo_data.sql` now removes them. In dev the only user is an admin, so entries made by him are approved at once; the pending ones were inserted directly to show the screen. **Nobody else can approve until you give `stock.approve` to a manager on the Users & Roles page.**
Differences from the mock, on purpose: **Date** and **Warehouse choice** in the form (the place you work in), **Current Stock** column and item pictures in the form, row **checkboxes**, **sparklines/percent** on the cards, one table row per adjustment (first item plus "+N more", not one row per item).
Checked in the owner's Chrome (light): list, cards, both charts, Create tab with the existing form, Details tab, an approval from the screen (pending to approved, two stock movements written). NOT checked: saving a new adjustment from the panel as a non-manager, reject from the screen, filters on screen, Print, CSV download in the browser (blocked in my tool), dark mode, phone width, Hindi.

## 2026-10-26 Physical Count page with count sheets (owner's mock)
`/stock/count` (menu: Physical Count, visible with stock.view, stock.adjust or stock.approve) is rebuilt like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Print, New Physical Count, 6 cards (Total Counts, Completed, In Progress with "N waiting for approval", Pending, Total Variance Qty, Variance Value), filters (search count no / place / SKU / item, Warehouse, Count Type, Status, Date From/To, Clear, Filter), table (count no, date, warehouse, type, total items, counted, variance qty, variance value, status, created by, actions) with numbered pagination and Rows per page, two charts (Variance Analysis this month by reason, Variance Trend last 30 days), and a right panel with the tabs "Create New Count" (type Full / Cycle / Location, category or rack, notes) and "Count Details" (details, Count Progress bar with Counted / Remaining / Variance, progress steps, the first differences, and the Approve / Send back / Cancel box). The count sheet itself is a page of its own, `/stock/count/[id]`: a quantity box and a reason for every item, a search box, "Save progress" and "Save and send for approval".
**New flow and approval (stock path changed, please look):** migration 45 adds tables `physical_counts` and `physical_count_lines` (RLS, read only, no direct writes) and functions `create_physical_count` (freezes the system quantity), `save_physical_count_progress`, `submit_physical_count`, `approve_physical_count`, `reject_physical_count`, `cancel_physical_count` (SECURITY DEFINER, each checks permission and place), the internal `physical_count_apply` (writes ADJUSTMENT movements of the differences) and the invoker function `physical_counts_page(...)`. Status: PENDING, IN_PROGRESS, WAITING_APPROVAL, COMPLETED, CANCELLED. It reuses the permissions stock.adjust (count) and stock.approve (approve).
Test `supabase/tests/035_physical_counts.sql`: P1 to P30 all PASS (run in dev, rolled back): frozen quantities, scope, reasons needed, staff wait for a manager, send back, only the difference is applied (goods received meanwhile are kept), a manager's own count at once, an approval that would make stock negative is refused, filters, viewer without prices, permissions.
Rules and words are in `docs/ASSUMPTIONS.md`. **Open question:** "Count by scanning" (/stock/scan) still changes stock at once without a sheet or approval.
Dev data: 4 DEMO counts (PC-2026-001 full count completed with differences, 002 cycle count half done, 003 rack count not started, 004 shop count that I approved from the screen, so it is now Completed and DEMO-HDMI-10M in Demo shop 1 went from 6 to 3); `remove_demo_data.sql` removes them. In dev the only user is an admin (a manager), so his own counts are applied at once; the waiting one was set directly to show the screen. **Nobody else can approve until you give `stock.approve` to a manager on the Users & Roles page.**
Differences from the mock, on purpose: **Team Members**, **Reference No.**, **Planned Date** and the Date field in the form (a count has notes only; the date is the day it was made), **Warehouse choice** (the place you work in), row **checkboxes**, **sparklines/percent** on the cards; the mock's Reasons list (Missing, Extra, Wrong Location, Damage/Expiry, Others) is the reason list of the sheet.
Checked in the owner's Chrome (light): list, cards, both charts, Create tab, Details tab, an approval from the screen (Waiting Approval to Completed, stock corrected), the count sheet page. NOT checked: making a new count from the form, saving progress and sending from the sheet as staff, send back, filters on screen, Print, CSV download in the browser (blocked in my tool), dark mode, phone width, Hindi.

## 2026-10-26 Sales Orders page (owner's mock)
`/sales-orders` (menu: Sales Orders under Sales & Dispatch; it used to open the Bills list) is a NEW module built like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Print, New Sales Order, 6 cards (Total Orders, Pending Confirmation, Confirmed, In Packing, Dispatched, Cancelled), filters (search order no / customer / SKU, Channel, Status, Date From/To, Customer, Clear, Filter), table (order no, date, customer, channel badge, items, order value, status, dispatch date, actions) with numbered pagination and Rows per page, two charts (Sales Orders Trend last 30 days: columns for the order count and a line for the value; Order Status Distribution donut), and a right column with the tabs "Create New Order" (customer with a + button to add a customer, order date, channel, expected dispatch date, shipping address that fills from the customer, item search with price and stock, qty and rate per line, remarks, Sub Total / Discount / Shipping Charges / Grand Total, Save Order / Reset) and "Order Details" (details, Order Progress, items with amounts, totals, Confirm Order / Cancel Order, Edit Order) and the "Recent Orders" table under it.
Database: migration 46 adds permissions `sales_orders.view` / `.create` / `.confirm`, tables `sales_orders` and `sales_order_lines` (RLS, read only, no direct writes), functions `save_sales_order`, `confirm_sales_order`, `cancel_sales_order` (SECURITY DEFINER; each checks permission and place), the invoker function `sales_orders_page(...)`, and widens the customer read rule so staff with the sales order permissions can read customers. **It does not touch stock or billing.** Test `supabase/tests/036_sales_orders.sql`: O1 to O24 all PASS (run in dev, rolled back), including "sales orders do not change stock".
Rules are in `docs/ASSUMPTIONS.md` (no tax, no reservation, who confirms, only Pending is editable). The Bills list is now an extra entry "Bills" (Quick Action, search box, phone bar) because "Sales Orders" now means this page.
Dev data: 10 DEMO orders (SO-2026-0001 to 0010) over the last 30 days in every status and channel (In Packing and Dispatched were set directly, the pages for those steps do not exist yet), plus SO-2026-0011 which I made and confirmed from the screen; demo items have no selling price, so their rates are small numbers I typed. `remove_demo_data.sql` removes the orders before the DEMO customers.
Differences from the mock, on purpose: **Tax (18%)** line (owner chose no tax), **Available** column and item pictures in the form lines (the stock is shown in the search result and under the item name), row **checkboxes**, **sparklines/percent** on the cards, **Import**, a separate "Warehouse" field (the place you work in is used).
Checked in the owner's Chrome (light): list, cards, charts, create form with item search, saving an order from the screen (SO-2026-0011), the Details tab, confirming from the screen. NOT checked: editing a pending order, cancel from the screen, filters on screen, Print, CSV download in the browser (blocked in my tool), dark mode, phone width, Hindi.

## 2026-10-26 Picking & Packing page (owner's mock)
`/picking` (menu: Picking & Packing under Sales & Dispatch, shown with `picking.view` or `picking.manage`) is built like the owner's two mocks: breadcrumb, title, Print Pick List (of the chosen order, `/picking/<order id>/print`), Export (CSV with the same filters), Start Picking, 6 cards (Total Orders, Pending Picking, In Picking, In Packing, Ready to Dispatch, Delayed; each opens the list with that status), filters (search order no / customer / SKU, Warehouse, Channel, Status incl. Delayed, Date From/To, Clear, Filter), table (order no, date, customer, channel badge, items, Picking x / n, Packing x / n, status, priority, actions) with numbered pagination and Rows per page, three charts (progress donut, Orders by Status columns, Channel Wise Open Orders donut), and a right column with the tabs "Picking & Packing" (start with a priority; Scan & Pick Items box with a +1 per scan, a Picked number box per item with the rack shown; Packing Details with Packing Type, Box No, Weight, L x W x H, Remarks, Mark as Packed / Reset; Stop picking) and "Order Details", plus "Recent Picking & Packing Activity".
Database: migration 47 adds permissions `picking.view` / `picking.manage`, tables `pick_pack_jobs` and `pick_pack_lines` (RLS, read only, no direct writes), functions `start_picking`, `set_pick_quantity`, `mark_packed`, `cancel_picking` (SECURITY DEFINER; each checks permission and place) and the invoker function `picking_page(...)`. **It does not touch stock.** Test `supabase/tests/037_picking_packing.sql`: K1 to K30 all PASS (run in dev, rolled back), including "picking and packing do not change stock".
Flow: Sales Orders "Confirmed" -> Start Picking (order shows "In Packing" in Sales Orders) -> pick every item -> Mark as Packed (job "Ready to Dispatch"). Dispatch (not built) will set the order Dispatched and take stock out. Rules are in `docs/ASSUMPTIONS.md`.
Dev data: SO-2026-0002 packed (Ready), SO-2026-0007 half picked, SO-2026-0011 packed from the screen (box PB-77). SO-2026-0003 and 0010 were set "In Packing" directly earlier, so they have no pick sheet and show as In Picking with a note. `remove_demo_data.sql` removes the jobs before the orders.
Differences from the mock, on purpose: **Team Members / Assign To**, row **checkboxes**, **sparklines/percent** on the cards, a Warehouse field in the form (the place you work in is used).
Checked in the owner's Chrome: list, cards, charts, scan (1 of 4 counted), packing form error and a successful Mark as Packed, Details tab, dark mode list, Print Pick List page. NOT checked: Start Picking from the screen, typed quantity box, Stop picking, filters on screen, CSV download in the browser (blocked in my tool), phone width, Hindi. The server log shows a "Date.now() while prerendering" warning for every page of the app (not only this one); pages still load.

## 2026-10-26 Dispatch page (owner's mock)
`/dispatch` (menu: Dispatch under Sales & Dispatch, shown with `dispatch.view` or `dispatch.manage`) is built like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Print Label (of the chosen dispatch, `/dispatch/<id>/label`), Create Dispatch, 6 cards (Total to Dispatch = packed orders waiting, Dispatched Today, In Transit, Delivered, Delivery Failed, RTO), filters (search order no / customer / AWB / courier, Courier Partner, Dispatch Status, Date From/To, Clear, Filter), table (order no, dispatch date, customer, channel badge, courier, AWB, status, delivery date, actions) with numbered pagination and Rows per page, three charts (Dispatch Trend last 30 days: dispatched columns and a delivered line; Status Distribution donut; Courier Partner this month bars), and a right column with the tabs "Create / Update Dispatch" (packed order chosen from a list, dispatch date, courier partner with "Add a courier to the list", service type, AWB typed by hand, Add Insurance, Print Label, pickup reference, remarks, Mark as Dispatched / Reset, and the "Items in Order" table) and "Order Details" (details, Parcel History, Change Status, Edit courier details, Print Label), plus "Recent Dispatch Activity".
Database: migration 48 adds permissions `dispatch.view` / `dispatch.manage`, tables `couriers` (7 starting couriers), `dispatches`, `dispatch_events` (RLS, read only, no direct writes), functions `create_dispatch`, `update_dispatch`, `set_dispatch_status`, `add_courier` (SECURITY DEFINER; each checks permission and place) and the invoker function `dispatch_page(...)`. **`create_dispatch` TAKES THE STOCK OUT** (one SALE movement per item for the packed quantity) and makes the sales order Dispatched. Test `supabase/tests/038_dispatch.sql`: D1 to D36 all PASS (run in dev, rolled back), including stock going out, no double dispatch, no dispatch without stock, duplicate AWB, and that status changes and RTO do not move stock.
Rules are in `docs/ASSUMPTIONS.md` (stock at dispatch, manual courier status, no AWB generation, no cancel of a dispatch).
Dev data: 3 DEMO dispatches set directly for SO-2026-0004 (Delivered), 0005 (In Transit), 0009 (Delivery Failed); their stock was not taken out (those orders were set Dispatched directly earlier), and their history lines are only approximate. SO-2026-0011 (box PB-77) was dispatched from the screen with DTDC, AWB DEMO-D7123456789, then set In Transit: its stock went 204 -> 200 (checked in the database) with one SALE movement. SO-2026-0002 is packed and still waiting. `remove_demo_data.sql` removes the dispatches before the pick jobs and orders.
Differences from the mock, on purpose: **Bulk AWB Upload** (needs a file format and checks; not built), **Generate AWB** (needs a courier connection, a paid outside service), row **checkboxes**, **sparklines/percent** on the cards, **Date Range** is two date boxes, a "Dispatched" status is added to the chart (a new parcel before the courier moves it).
Checked in the owner's Chrome: list, cards, charts, dark mode list, choosing a packed order (items table appears), Mark as Dispatched from the screen (stock and order status checked in the database), Change Status to In Transit, the shipping label page. NOT checked: Edit courier details, Add a courier from the screen, filters on screen, CSV download in the browser (blocked in my tool), phone width, Hindi, real printing.

## 2026-10-26 Returns page (owner's mock)
`/returns` (menu: Returns under Sales & Dispatch, shown with `returns.view`, `returns.manage` or `returns.approve`) is built like the owner's two mocks: breadcrumb, title, Export (CSV with the same filters), Print, Create Return, 6 cards (Total Returns, Pickup Pending, In Transit, Under Inspection, Approved, Rejected), filters (search return ID / order no / customer / SKU / pickup AWB, Return Reason, Return Status, Channel, Date From/To, Clear, Filter), table (return ID, order no, date, customer, channel badge, items, reason, status, Refund / Replacement, actions) with numbered pagination and Rows per page, three charts (Returns Trend last 30 days: columns for returns made and a line for approved; Return Reasons this month donut; Return Status donut), and a right column with the tabs "Return Details" (a NEW return: choose the dispatched order, return date, reason, pickup AWB typed by hand, tick the items that come back with quantity and condition, customer remarks, Save Return; or the details of the chosen return with History and Update Status) and "Inspection & Resolution" (condition of each item, Refund or Replacement, pickup AWB, note, Save Inspection, then Approve Return / Reject Return with a reason), plus "Recent Return Activity".
Database: migration 49 adds permissions `returns.view` / `.manage` / `.approve`, tables `sales_returns`, `sales_return_lines`, `sales_return_events` (RLS, read only, no direct writes), functions `create_return`, `set_return_status`, `save_inspection`, `approve_return`, `reject_return` (SECURITY DEFINER; each checks permission and place), and the invoker functions `return_order_items(order)` and `returns_page(...)`. **`approve_return` puts only the items marked Good back into stock** (SALE_RETURN movement, "Customer return RT-..."); Damaged and Used items do not come back. Making, moving or rejecting a return does not touch stock. Test `supabase/tests/039_returns.sql`: R1 to R38 all PASS (run in dev, rolled back).
Rules are in `docs/ASSUMPTIONS.md` (only dispatched orders, per-item quantity limit, good items only, refund/replacement as a record, hand-set status, who approves).
Dev data: RT-2026-0001 (Pickup Pending), 0002 (In Transit) and 0003 (made Under Inspection, then I saved the inspection as Refund and approved it from the screen: stock of DEMO-EXT-BOARD-4S went 543 -> 544 and one SALE_RETURN movement exists), plus RT-2026-0004 made from the screen for SO-2026-0011 (Pickup Pending). Those demo orders were set Dispatched directly earlier, so their stock never left; approving 0003 therefore added one piece of demo stock. `remove_demo_data.sql` removes the returns before the dispatches and orders.
Differences from the mock, on purpose: **Generate Return AWB** (needs a courier connection), row **checkboxes**, **sparklines/percent** on the cards, **Date Range** is two date boxes, the Update Status dropdown only moves forward (In Transit, Under Inspection); approving and rejecting are their own buttons in the Inspection tab.
Checked in the owner's Chrome (light): list, cards, charts, the New Return form with the item tick-list, saving a return from the screen, saving an inspection and approving from the screen (stock and status checked in the database). NOT checked: dark mode, Update Status from the screen, Reject from the screen, filters on screen, Print, CSV download in the browser (blocked in my tool), phone width, Hindi. Note: on this computer the save buttons spin for several seconds before the page updates (the same on Dispatch); the saves did go through.

## 2026-10-27 Inventory Reports page (owner's mock)
`/reports/inventory` (menu: Inventory Reports under Reports; needs `reports.view`, and the numbers need `stock.view`) is built like the owner's two mocks: breadcrumb, title, Export and Print, 6 cards (Total Items (SKU), Total Stock Quantity, Total Stock Value, Low Stock, Out of Stock, Slow Moving; the last three and the quantity/value open the matching tab), filters (Date From/To, Warehouse, Category, Stock Status, Movement Type, search SKU / item name, Clear, Apply), three charts (Stock Value by Category donut with the five biggest and Others, Stock Quantity by Warehouse columns, Stock Movement last 30 days with Stock In columns and a Stock Out line), the tab row with a table per tab (Current Stock, Low Stock, Out of Stock, Slow Moving, Fast Moving, Stock Ageing, Stock Movement, Location Wise) with numbered pagination and Rows per page, "Download Excel (CSV)", and four bottom cards (Stock Status Distribution donut, Top 5 High Value Items, Low Stock Items Top 5, Recent Stock Activity).
Database: migration 50 adds the read-only function `inventory_report(...)` (SECURITY INVOKER, so row-level security decides what a person sees). No new table, no stock change. Test `supabase/tests/040_inventory_reports.sql`: I1 to I21 all PASS (run in dev, rolled back). Note: the dev database got the Stock in / Stock out movement types by a small patch of the function after the first apply; the migration file holds the final text.
Rules are in `docs/ASSUMPTIONS.md` (slow / fast moving, ageing, reserved, value, what Stock In / Out mean).
The old `/reports` page (sales per day, sales per item, dead stock, low stock, stock by place, with CSV) is still there; "Sales Reports" in the menu still opens it. Only the menu item "Inventory Reports" moved to the new page.
Differences from the mock, on purpose: **Batch / Serial** tab (the system has no batch or serial tracking), **Generate Report** button (the filters already apply with Apply), **Columns** chooser, row **checkboxes**, **sparklines/percent** on the cards, "Download Excel" gives a CSV that opens in Excel (a real .xlsx needs a new library, which needs your approval), the Location column shows the warehouse and rack.
Checked in the owner's Chrome (light): cards, filters row, three charts, the Current Stock, Stock Ageing and Stock Movement tabs, the four bottom cards. NOT checked: dark mode, Low / Out / Slow / Fast / Location Wise tabs on screen, filters on screen, Print, CSV download in the browser (blocked in my tool), phone width, Hindi. In the dev data almost every line counts as Slow Moving (31 of 36) because very little was sold; that is the rule, not a bug.

## 2026-10-27 Purchase Reports page (owner's mock; first of the 5 reports/admin pages the owner sent together)
`/reports/purchase` (menu: Purchase Reports under Reports; needs `reports.view`, and `purchase.view` / `.create` / `.approve` for the numbers) is built like the owner's two mocks: breadcrumb, title, Export and Print, 6 cards (Total Purchase Orders, Total Purchase Value, Received Value (GRN), Pending PO Value, Average Order Value, Active Suppliers), filters (Date From/To, Supplier, Category, Status incl. Overdue, Warehouse, search PO no / supplier / item, Clear, Apply), three charts (Purchase Value Trend last 6 months with a PO-count line, Supplier-wise top 5, Category-wise donut), the tab row with a table per tab (Purchase Orders, GRN / Goods Received, Pending Deliveries, Supplier Wise, Category Wise, Item Wise, Monthly, Comparative) with numbered pagination and Rows per page, "Download Excel (CSV)", and four bottom cards (PO Status Distribution, Monthly Purchase Value, Top 5 Purchased Items, Recent Purchase Activity).
Database: migration 51 adds the read-only function `purchase_report(...)` (SECURITY INVOKER). No table, no stock change. Test `supabase/tests/041_purchase_reports.sql`: P1 to P24 all PASS (run in dev, rolled back).
Rules are in `docs/ASSUMPTIONS.md`. Differences from the mock, on purpose: the **Payment Status** column and tab (the system has no supplier payments; owner chose to leave it for later), the **On Hold** status (does not exist in Purchase Orders), **Generate Report**, **Columns** chooser, row **checkboxes**, **sparklines/percent** on the cards, Excel is a CSV.
Checked in the owner's Chrome (light): cards, filters row, trend / supplier / category charts, the Comparative tab. NOT checked: dark mode, the other tabs and bottom cards on screen, filters on screen, Print, CSV download in the browser (blocked in my tool), phone width, Hindi.
Still to build from the owner's list of five: Sales Reports, Stock Valuation, Users & Roles, Settings (one at a time).

## 2026-10-27 Sales Reports page (owner's mock; second of the five pages)
`/reports/sales` (menu: Sales Reports under Reports; needs `reports.view`, and `sales_orders.view` / `.create` / `.confirm` for the numbers) is built like the owner's two mocks: breadcrumb, title, Export and Print, 6 cards (Total Orders, Total Sales, Total Items Sold, Average Order Value, Total Customers, Return Orders), filters (Date From/To, Sales Channel, Category, Customer Type, search order / customer / city / SKU, Clear, Apply), three charts (Sales Trend last 30 days with orders as columns and sales value as a line, Channel-wise Sales donut, Category-wise Sales bars), three top-5 tables (Products, Customers, Cities), the tab row with a table per tab (Sales Orders, Product Wise, Channel Wise, Customer Wise, City Wise, Monthly, Comparison) with numbered pagination and Rows per page, and "Download Excel (CSV)".
Database: migration 52 adds the read-only function `sales_report(...)` (SECURITY INVOKER). No table, no stock change. Test `supabase/tests/042_sales_reports.sql`: S1 to S22 all PASS (run in dev, rolled back). Note: the dev database got a small patch of the function (dispatch status falls back to "Dispatched" for a person who may not see dispatches); the migration file holds the final text.
Rules are in `docs/ASSUMPTIONS.md`. Differences from the mock, on purpose: the **Payment Status** filter, column and **Payment Wise** tab (no customer payments exist), **Generate Report**, **Columns** chooser, row **checkboxes**, **sparklines/percent** on the cards, Excel is a CSV.
Checked in the owner's Chrome (light): cards, filters row, trend / channel / category charts, the three top-5 tables, the Sales Orders tab. NOT checked: dark mode, the other tabs on screen, filters on screen, Print, CSV download in the browser (blocked in my tool), phone width, Hindi.
Still to build from the owner's list of five: Stock Valuation, Users & Roles, Settings (one at a time).

## 2026-10-27 Stock Valuation page (owner's mock; third of the five pages)
`/reports/valuation` (menu: Stock Valuation under Reports; needs `reports.view`, plus BOTH `stock.view` and `receipts.cost` for the numbers) is built like the owner's two mocks: breadcrumb, title, Export and Print, 6 cards (Total Stock Value, Total Items (SKU), Fast Moving Stock Value, Slow Moving Stock Value, Low Stock Value, Out of Stock Value), filters (Valuation Method = Average Cost only, Warehouse, Category, Supplier, Stock Status, search, Clear, Apply), three charts (Stock Value by Category donut, Stock Value by Warehouse columns, Stock Ageing Value donut), the tab row with a table per tab (SKU-wise Valuation, Category-wise, Warehouse-wise, Supplier-wise, Ageing-wise, Fast / Slow Moving, Low Stock, Out of Stock) with numbered pagination and Rows per page, "Download Excel (CSV)", and four bottom cards (Stock Status Value, Top 5 High Value Items, Top 5 Low Stock Value Items, Recent Stock Valuation Activity). A yellow note shows how many stock lines have stock but no priced receipt (19 in the dev data).
Database: migration 53 adds the read-only function `stock_valuation(...)` (SECURITY INVOKER). No table, no stock change. Test `supabase/tests/043_stock_valuation.sql`: V1 to V21 all PASS (run in dev, rolled back). The total (₹5,04,072 in dev) equals the total on Inventory Reports.
Rules are in `docs/ASSUMPTIONS.md`. Differences from the mock, on purpose: **FIFO** and **Date As On** (owner chose Average Cost now), the **Damaged** status value (no damaged-goods place exists), **Generate Report**, **Columns** chooser, row **checkboxes**, **sparklines/percent**, the row "chart" action, Excel is a CSV; the "Normal" movement type is kept.
Checked in the owner's Chrome (light): cards, filters, the three charts, the SKU-wise table, the four bottom cards. NOT checked: dark mode, the other tabs on screen, filters on screen, Print, CSV download in the browser (blocked in my tool), phone width, Hindi.
Still to build from the owner's list of five: Users & Roles, Settings. Both touch login and permissions, so I will ask before changing anything there.

## 2026-10-27 Users & Roles page (owner's mock; fourth of the five pages)
`/admin/users` (menu: Users & Roles under Administration; ADMINISTRATORS ONLY) was rebuilt like the owner's two mocks: breadcrumb, title, Activity Log, Export (CSV), Add User, 5 cards (Total Users with "n invited", Active, Inactive, Total Roles, Departments), tabs Users / Roles / Permissions / Departments / Access Logs. Users tab: filters (search, Role, Department, Status), table (name with avatar, email, role badge, department, status, last login, actions), pagination, and a right panel with the person (status, email, department, last login) and tabs "Role & Permissions" (Assigned Role, Change Role, then Allow Login, Administrator, the permission checkboxes and the places), "Profile" (name, role label, department) and "Activity Log" (changes about this person). Add User opens the invite form. Roles tab: list of roles with users and permission counts, edit / switch off, New Role with the permission checkboxes. Permissions tab: a read-only grid of which role gives which permission. Departments tab: add, rename, switch off. Access Logs tab: the changes to users, roles, permissions, places and invites from the audit log.
Database: migration 54 (applied to dev on 2026-10-27 with the owner's OK) adds tables `roles`, `role_permissions`, `departments`, `user_invites`, columns `profiles.role_id` / `department_id`, functions `admin_save_role`, `admin_set_role_active`, `admin_save_department`, `admin_set_user_profile`, `admin_apply_role`, `admin_invite_user`, `admin_cancel_invite`, `admin_users_page`, `admin_access_log` (all SECURITY DEFINER and all check is_admin()), and CHANGES the sign-up trigger `handle_new_user` so that a first sign-in with an invited email is set up at once. The old functions (`admin_set_user_active`, `_admin`, `_permissions`, `_locations`) are unchanged and still used by "Save Access". Test `supabase/tests/044_users_roles.sql`: U1 to U36 all PASS (run in dev, rolled back), including that a non-admin can do none of it, that a role copies its permissions, that nobody can remove their own admin right, and that an un-invited sign-in stays inactive.
Dev data now: roles Admin + 5 starting roles (Operations Manager, Sales Executive, Warehouse Staff, Purchase Executive, Accountant) with permission sets I chose; 6 departments (Management, Operations, Sales, Stock, Purchase, Accounts); the owner's account has the Admin role. I tried Add User from the screen with a demo email and removed that demo invite afterwards.
Rules are in `docs/ASSUMPTIONS.md`. Differences from the mock, on purpose: **the 2FA, e-mail notification and department-wide toggles** (not built), **phone number**, row **checkboxes**, **sparklines/percent**, the grid view button, "Add User" does not create the login (it is made in the Supabase dashboard), Access Logs shows admin changes and not every sign-in.
Checked in the owner's Chrome (light): the page with the cards, the list, the detail panel and Change Role, and saving an invite from Add User (it appeared as "Invited" with its role and permission count). NOT checked: dark mode, the Roles / Permissions / Departments / Access Logs tabs on screen, saving access or profile from the panel, cancelling an invite from the screen, Export in the browser (blocked in my tool), phone width, Hindi, and a real first sign-in with an invited email (only tested in the database).
Still to build from the owner's list of five: Settings.

## 2026-10-27 Settings page (owner's mock; fifth and last of the five pages)
`/admin/settings` (menu: Settings under Administration; ADMINISTRATORS ONLY) was rebuilt like the owner's two mocks: breadcrumb, title, the row of 11 tabs (General, Company, Modules, Inventory, Sales, Purchase, Notifications, Integrations, Backup & Data, Appearance, Audit Log) and on General the six cards (Business Information, System Preferences, Email & Notifications, Document Settings, Inventory Settings, Security Settings). Every card and every switch carries a clear label: "Works now", "Fixed" (shows how the system works today, not a switch), or "Not built yet" (switched off, greyed), so nothing looks active that does nothing (owner chose this).
What REALLY works: (1) **Company information** (name, tagline, GST, PAN, address, phone, email, website): saved with a "Save Company Information" button (General and Company tabs) and printed on the pick list, shipping label, goods receipt, purchase order, transfer note and bill (they used a fixed "SETMI INDIA" before). (2) **Billing ON/OFF** (on the Modules tab, with the old explanation). (3) **Audit Log tab**: every important change, newest first, with search, area, dates, pagination. (4) The Modules, Inventory, Sales and Purchase tabs describe how the system works today (read-only facts).
NOT built (shown as such): e-mail server and notifications, 2-factor login, IP restriction, login attempt limit, session timeout / password expiry (those are Supabase settings), number prefixes and next numbers, batch / serial / expiry tracking, negative stock, FIFO, backup and restore, integrations, company logo change, "Reset All Settings".
Database: migration 55 (applied to dev) lets `app_settings` hold keys `company.*`, adds `company_info()` (anybody signed in may read it), `admin_save_company(jsonb)` (admin only; checks GST format, PAN format, e-mail, phone, website, lengths) and `admin_audit_page(...)` (admin only). Test `supabase/tests/045_company_settings.sql`: C1 to C17 all PASS (run in dev, rolled back). New file `src/lib/company.ts` reads the company information.
Checked in the owner's Chrome (it was in dark mode at the time): the General tab with all six cards, saving the company information from the screen (a demo address and phone were saved, then shown on the pick list print page, then I cleared them again), and the Audit Log tab. NOT checked: the other tabs on screen (Company, Modules, Inventory, Sales, Purchase, Notifications, Integrations, Backup, Appearance), the billing switch in its new place, the other printed papers (only the pick list), light mode of this page, phone width, Hindi.
All five pages the owner sent together (Purchase Reports, Sales Reports, Stock Valuation, Users & Roles, Settings) are now built.

## 2026-10-27 Check-up of the new pages (dark mode, phone width, Hindi)
Done in the owner's Chrome: **Dark mode** looked at on Returns, Inventory Reports, Purchase Reports, Sales Reports, Stock Valuation, Users & Roles, and earlier on Picking & Packing, Dispatch and Settings: texts, cards, tables, charts and badges are readable; no problem found. **Hindi** (cookie `ims_lang=hi`): the menu is in Hindi and Picking & Packing, Stock Valuation and Settings open without any error; the BODY of these pages is still English (the owner's Hindi phase 2, "translate the working screens", is not done for any of the working pages). **Phone width: NOT checked.** My tools could not do it: the Chrome extension window resize does not change the page width, and the app refuses to be shown inside a frame (X-Frame-Options DENY, which is a good security setting and was not changed). To check it, open the pages in Chrome, press F12, choose the phone icon (device toolbar), and look for sideways scrolling; or tell me and I will ask you to log in once inside the built-in browser pane.

## 2026-10-27 Add Product / SKU page (owner's mock)
`/items/new` (needs `items.create`) was rebuilt like the owner's two mocks: header with Back to Products, Save as Draft, Save Product; 8 tabs. Basic Information shows the six mock cards (Basic Product Information, Key Attributes, Product Images, Status & Visibility, Tags & Keywords, Additional Information). Tabs 2 to 6 (Specifications, Inventory & Stock, Pricing, Supplier & Purchase, Images & Documents) carry the real system fields that are not in the mock picture (Unit, safety factor, SETMI barcode switch, Selling Item Name, selling price, Purchase Source, Import Item Code). **Variants / SKUs and SEO & Other say "Not built yet"** (owner choice). The edit page `/items/[id]` now also shows and saves the new fields (see the next entry).
Database: migration 56 (applied to dev) adds optional columns on `items` (see `docs/DATA.md`), raises the image limit 4 to 6, and makes three switches real: **Show in Sales Order off** = `save_sales_order` refuses the item and the sales order item search hides it; **Show in Purchase Order off** = `save_purchase_order` refuses it, the purchase item search hides it and a scan says it is switched off; **Low Stock Alert off** = `stock_overview.is_low` is never true for it (dashboard, bell, Low Stock report, anything built on that view) and `reorder_suggestions` leaves it out. Test `supabase/tests/046_add_product_fields.sql`: P1 to P13 all PASS (dev, rolled back).
Save as Draft saves the item inactive (needs only name and code). Save Product needs name, code, category and short description. After the item is created the browser uploads the chosen images one by one (first = Main) and, if one fails, says which, and the product stays saved. Uploading images needs `items.edit`. HSN is stored only, no tax is calculated. The description box is plain text (no bold/italic buttons).
NOT covered by the Low Stock switch: other functions that read `min_qty` directly (`current_stock_page`, `items_page`, `inventory_report`, `stock_valuation`, `report_stock_by_place`, `suggest_transfer_lines`); they still show such an item as low if they have their own low flag. Existing items got all three switches ON.
Checked in the owner's Chrome: light and dark view; Save as Draft (item saved inactive, toggles saved); Save Product with an image (image attached, redirect to the item page). My two test items were then deleted. NOT checked: phone width, Hindi, tags and brand typing on screen, an upload failing, the other tabs on screen, and the switches' effect on the Sales/Purchase order screens (tested in the database only).

## 2026-10-27 Whole-project clean-up round 1 (README, item edit, Hostinger plan)
Owner asked to finish the whole project and make it deploy ready; hosting is **Hostinger Business Web Hosting, subdomain `inventory.setmiindia.com`, the same Supabase database** (owner's answers). Nothing was deployed and no DNS or hosting setting was touched.
Done: (1) `README.md` rewritten (it still said "Item Master not built"). (2) `docs/DEPLOYMENT.md` now targets Hostinger: new section 10 with the steps (Node.js app from the private GitHub repo, Node 24, `npm run build` / `npm start`, the two env variables set BEFORE the build, Supabase Site URL change, smoke test, rollback). `.env.example` wording changed. Hostinger's own guides disagree on whether the Business plan includes "Node.js Apps": the owner must open hPanel and confirm before go-live. (3) The item EDIT page now shows and saves the Add Product fields (brand, HSN, descriptions, size, weight, tags, keywords, the three switches). Checked in the owner's Chrome: page shows the fields; saving a brand and tags changed the database (duplicate tag removed); the test value was then cleared. (4) The design file "Sales Analytics Dashboard" turned out to be the dark version of Sales Reports, already built.
Checks: typecheck, lint, build pass; `npm test` 54/54.
Still open: Content-Security-Policy header, phone-width check (owner with F12), Hindi page bodies, deleting the two unused files (needs owner's yes), a page-by-page visual compare of the other mocks (done earlier page by page at build time, not re-done today), Supabase dashboard settings (sign-up off, leaked-password protection), real company info and users.
