# DECISIONS

Format: context, options, choice, reason, date, model.

## D-001: Stack
- **Choice:** Next.js + TypeScript + Tailwind, Supabase (Postgres/Auth/Storage), Vercel.
- **Source:** specified by the owner. Not re-evaluated by the AI.
- **Date:** 2026-10-24

## D-002: Scaffold via official `create-next-app`
- **Options:** (a) official scaffold, (b) hand-written `package.json`.
- **Choice:** (a). Lower risk of missing defaults.
- **Detail:** the project folder name ("Inventory Management System") is not a valid npm package name, so the scaffold was generated in a temporary folder as `setmi-inventory-management` and its files copied in. The scaffold's own `.git` was not copied.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-003: `typecheck` script uses `next typegen`
- **Problem:** `tsc --noEmit` alone failed with `Cannot find name 'LayoutProps'` before the first build, because Next generates that type.
- **Choice:** `"typecheck": "next typegen && tsc --noEmit"`.
- **Verified:** passes from a clean state (`.next` deleted).
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-004: Item Master has separate `Item_Name` and `Selling_Item_Name`
- **Status:** owner-stated requirement, NOT yet implemented.
- **Meaning (owner):** `Selling_Item_Name` is the name shown on customer bills. It can differ from the supplier/stock-side name. The future billing module is to use it.
- **Open details:** see `docs/ASSUMPTIONS.md`.
- **Date:** 2026-10-24

## D-005: `Internal_Item_Code` is entered manually
- **Status:** owner-stated, NOT yet implemented. The system does not auto-generate it.
- **Open:** uniqueness and format rules (see `docs/ASSUMPTIONS.md`).
- **Date:** 2026-10-24

## D-006: System is multi-user
- **Status:** owner-stated. Several company users will use it, so login, authorization and RLS are required. Users are not decided yet.
- **Date:** 2026-10-24

## D-007: Admin-configurable permissions instead of fixed roles
- **Owner decision:** an admin panel where the admin switches permissions on/off per user, per menu/action.
- **Options:** (a) fixed roles (Admin/Editor/Viewer), (b) per-user permission toggles. (a) was the AI's first proposal; owner chose (b).
- **Why (b):** user list and duties are not known yet, and new modules will need new permissions.
- **Trade-offs:** more tables and more careful testing; a bug in permission checks affects every module. Mitigation: deny by default, enforce on server and in RLS, log permission changes, test unauthorized access explicitly.
- **Revisit if:** permission list becomes too large to manage; then group permissions into roles that are only shortcuts for toggles.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-008: `Selling_Item_Name` is required and prefilled
- **Owner decision ("haa"):** required; on create it is prefilled from `Item_Name` so a bill never has an empty name.
- **Date:** 2026-10-24

## D-009: Archive only, no real delete
- **Owner decision ("haa").** Items are archived, not deleted, so future stock and billing history keep a valid reference.
- **Date:** 2026-10-24

## D-010: Two data-entry paths
- **Owner decision:** manual entry and Excel import both supported. Import design is a separate task.
- **Date:** 2026-10-24

## D-011: Barcode purpose
- **Owner statement:** barcode is scanned at selling time to pick the item for a bill, and used for inventory management.
- **Owner decision:** works like standard barcode billing: one barcode value belongs to exactly one item, so it is globally unique.
- **Proposed, not yet confirmed:** barcodes stored in their own table so an item can have several. Costs one extra table now, avoids a migration later.
- **Date:** 2026-10-24

## D-013: Whole-project plan, AI decides details (owner instruction 2026-10-24)
- Owner asked for a full plan including warehouses and shops, and said to decide sensibly and change after it is built. Plan: `docs/ROADMAP.md`.
- AI decisions inside it: one `locations` table (WAREHOUSE/SHOP); append-only stock ledger; stock changes only via Postgres functions; user-to-location scope; bills snapshot names; `numeric(12,3)` quantities with `unit`.
- Still requires explicit owner approval: push, deploy, DNS, paid resources.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-014: Admin-only user management, `is_admin` flag
- Permission toggles are changed only by `admin_*` SQL functions that require `is_admin()`. No client write policy exists on profiles, user_permissions, user_locations. This avoids a user with a "manage users" toggle promoting themselves.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-015: Category as a managed table
- Owner undecided (list vs free text). A `categories` table gives a list that admins can extend, so it behaves like free text with no typo duplicates. `items.category_id` is nullable. Change later if owner prefers.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-016: Auth approach for P1
- **Choice:** Supabase email + password; server-only Supabase client (`@supabase/ssr`); no browser-side Supabase client yet; login via a server action; `getUser()` (asks the Auth server) for page guards and `getClaims()` (signature check) in the proxy.
- **Alternatives:** browser-side login (more code in the browser, more attack surface); trusting the cookie only (a revoked session would still pass).
- **Trade-off:** one extra network call per page for `getUser()`. Acceptable for an internal tool; revisit if pages feel slow.
- **No self-signup page** (signups disabled in Supabase): admins create users in the Supabase dashboard for now. An in-app "create user" would need the service-role key on the server; postponed on purpose.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-017: Direct-to-storage uploads with server confirmation
- **Problem:** images up to 5 MB and datasheets up to 10 MB; Vercel limits request bodies to about 4.5 MB, so sending files through server actions would fail in production.
- **Options:** (a) file through a server action (simple, breaks above 4.5 MB on Vercel; also needs a raised Next body limit); (b) browser uploads straight to Storage with a signed ticket, then the server confirms; (c) public bucket with client-side permission checks (rejected: breaks "server decides").
- **Choice:** (b). The server issues the ticket after checking permission/type/size, then re-reads the stored file, checks size and real content bytes, and only then links it to the item.
- **Why bytes, not type:** declared type and file name come from the uploader and can lie; the signature bytes of a real JPEG/PNG/WebP/PDF cannot be faked by renaming.
- **Trade-offs:** one extra round trip; orphan files if confirmation never happens (cleanup later); files are private and shown through 1-hour signed links.
- **SVG is not allowed** (can carry scripts).
- **Also:** `allowImportingTsExtensions` added to tsconfig and an `npm test` script (Node's built-in test runner, no new package) so pure rule files can be unit-tested.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-018: Barcodes are EAN-13 starting with 2, generated by the database
- **Owner request:** system creates a barcode per item, owner prints it, scans it for billing.
- **Choice:** EAN-13 = `2` + 11-digit sequence number + check digit; stored in `item_barcodes` (`is_generated`); drawn by our own small encoder as SVG; printed from the browser.
- **Why:** the 2-prefix range is reserved for in-store use (no clash with manufacturers); every common scanner reads EAN-13; a sequence cannot hand out the same number twice; no new package.
- **Rejected:** Code 128 of the item code (codes up to ~85 chars, bars too wide), QR (cheap scanners often cannot read it), a barcode library (a small encoder was verified against an independent reader instead).
- **Revisit if:** the owner's scanners/printers cannot read EAN-13, or items need several generated barcodes (per pack size).
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-019: Internal_Item_Code limit raised to 120
- The owner's real codes are "SETMI-" + full item name, up to about 85 characters (found in the real sheet). The earlier limit of 64 would have rejected them.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-020: Excel import design
- **Owner approved** the library `read-excel-file` and the two-step flow (preview, then confirm).
- **Choices:** the database function is the final judge (the app only parses); one transaction, default all-or-nothing with an option to skip bad rows; create-only (never overwrites an existing item); duplicates are checked against the database AND inside the file; headers matched loosely; rows with no Item_Name are skipped as empty (the owner's sheet has placeholder rows); image and datasheet columns ignored; SETMI barcodes can be generated for all new items.
- **Alternatives:** parse in the database only (cannot read xlsx), insert row by row from the app (partial imports on failure), update-existing mode (rejected for now: one wrong Excel could silently rewrite items).
- **Trade-offs:** the browser sends parsed rows back for the commit, so the server validates them again; limits 3 MB / 2000 rows; zip unpacked in memory.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-021: Stock design (P4), informed by Odoo's Inventory docs
- **Choices:** append-only ledger with from/to places (empty end = outside); balances changed only by a trigger on the ledger; no negative stock; users cannot write stock tables directly, only through `apply_stock_count`; quantities `numeric(14,3)` with the allowed decimals decided by the item's unit (units table); minimum/maximum per item per place; count sheet where the user enters the COUNTED number and the database computes the difference.
- **Odoo ideas adopted:** per-place stock, from/to movements, adjustment = count vs on-hand, reordering minimum/maximum, units of measure, movement history. **Not adopted:** lots/serials, expiry, putaway, routes, valuation.
- **Differences from Odoo:** negative stock is refused (Odoo allows it). Revisit if shops must bill before the system knows the stock.
- **Trade-offs:** a wrong count is fixed by a new count (history is never edited); the ledger cannot be cleaned, so demo data needs the special remove script; unit cannot change after stock exists.
- **Owner inputs:** dummy data first, cables are sold per metre (so MTR with 3 decimals), minimum levels per item per place wanted.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-022: First push to GitHub
- **Owner instruction (2026-10-25):** commit and push. Before pushing: repo not visible without login (404, so private), a secret scan of all commits found nothing, no `.env` file tracked. Plain push, no force. Remote `origin/main` = `e2eb995` afterwards.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-023: Goods receipts (P5) built on the plan's defaults
- **Context:** the owner's reply to the seven questions arrived empty ("1)"). The owner had earlier said to decide sensibly and change afterwards, so the plan's proposals were used and are listed in FEATURE-006 section 0.
- **Choices:** draft then post; posting is the only way stock goes up from a receipt; posted documents are immutable; prices in a separate table with their own permission; the same supplier invoice cannot be received twice; scan-to-add like the scan-count screen; labels for received pieces.
- **Alternatives:** purchase orders first (more work, owner has not asked), editing posted receipts (breaks the audit trail), prices in the lines table with hidden columns on screen only (shop staff could read them through the API).
- **Trade-offs:** GRN numbers may have gaps; a wrong posted receipt is fixed with a stock count, not by editing; people who receive need `items.view` as well.
- **Revisit if:** the owner wants purchase orders, gap-free numbers per financial year, landed costs, or returns to suppliers.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-024: Transfers through a hidden "in transit" place (P6)
- **Context:** goods must not vanish between two places and must not count as available at either end while on the way. The owner's reply to the six questions was empty again, so the plan's defaults were used.
- **Choice:** one system place `IN-TRANSIT`; send = source -> transit; receive = transit -> destination; shortage = transit -> outside (own movement type); recall = transit -> source. Documents DRAFT -> SENT -> RECEIVED/CANCELLED, immutable once sent. Place names are copied onto the document.
- **Alternatives:** a separate "in transit quantity" table per transfer (a second source of truth, new "never negative" logic); moving stock to the destination at send time (the shop would sell goods it does not have yet); a transit place per transfer (hundreds of useless places).
- **Trade-offs:** the system place is a special case in a few places (lists, counts, permissions); transit totals are visible only to admins until the P8 reports; a shortage is booked as a loss, not held open.
- **Open (owner):** GST/e-way bill rules for transfers between your places; whether shortages should stay open instead.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-025: Billing built behind an admin switch, no tax (P7)
- **Owner:** billing is done in Zoho today; build it anyway, with an ON/OFF option; tax later.
- **Choice:** switch stored in the database, OFF by default, enforced by the bill-creating function itself; single-call atomic bill; snapshot of name/price on the bill; void instead of delete; selling price on the item with its own permission; narrow receipt print.
- **Why:** lets the owner finish and test billing without risking double billing next to Zoho; the database, not the menu, is the control.
- **Trade-offs:** while OFF, Zoho sales do not reduce stock here (counts needed); without a tax design these bills are not invoices.
- **Revisit if:** the owner moves billing here (then tax, invoice numbers, returns/credit notes and customers must be designed), or wants a Zoho sales import.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-012: `Import_item_code` is optional
- **Owner decision:** some items need it, some do not. It is optional, unique when filled, and not tied to LOCAL/IMPORT by a database rule.
- **Date:** 2026-10-24

## D-026: Reports as invoker database functions with CSV download (P8)
- **Owner:** "build the whole system"; the AI's defaults were used for the plan's open questions.
- **Choice:** five read-only `report_*` functions that run as the caller (row rules still apply) and also need `reports.view` plus the matching stock or bills permission; CSV (not xlsx) with a separate `reports.export` permission; no cost or valuation; at most 20,000 rows and one-year date ranges.
- **Why:** one set of access rules, no new library, no way to see another place's numbers through a report.
- **Trade-offs:** a person with `reports.view` but no `stock.view`/`bills.view` gets a clear refusal (by design); CSV instead of .xlsx.
- **Revisit if:** the owner wants valuation, charts or .xlsx.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-027: Security headers added to next.config.ts (config change)
- **Owner:** "build the whole system, ready to use" (the CLAUDE.md rule asks approval for config changes; this is reported here so the owner can object).
- **Choice:** five safe response headers on every page; no Content-Security-Policy yet.
- **Why:** cheap protection against clickjacking, MIME sniffing and downgrade; verified with `curl -I` on a local production build.
- **Revisit if:** a phone-camera scanner is added (Permissions-Policy blocks the camera) or a CSP is added.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-028: Purchase orders linked to receipts, ideas taken from the owner ERP repo (P9)
- **Owner:** "take from the ERP repo what you can use".
- **Choice:** PO flow draft -> sent -> partial -> completed / cancelled enforced by triggers; receipts can be made against an order; over-receiving is refused; prices behind `receipts.cost`; numbers from sequences; two read-only helpers so warehouse staff need no purchase permission.
- **Why:** closes the "purchase orders" gap, and shows the manager what is still due; avoids the repo own mistakes (last-id numbering, stock changes without reversal).
- **Trade-offs:** no tolerance for over-delivery; a sent order cannot be edited (cancel and re-make); no QC step yet.
- **Revisit if:** the owner wants over-delivery tolerance, QC on receiving, tax on orders or supplier e-mails.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-029: Usability pass: Help page, job-based home, permission message
- **Owner:** "make it so easy that anyone can use it".
- **Choice:** a Hinglish Help page with a context Help button on every screen; home built from jobs; an admin first-time checklist driven by real data; a visible message instead of a silent redirect when a page is not allowed.
- **Why:** the users are not technical; training should not be needed for the basic jobs.
- **Trade-offs:** the Help text is in the code and must be kept in step with the screens; screens stay in English.
- **Revisit if:** a real new user gets stuck (watch them once), or the owner wants Hindi screens.
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-030: Two screen languages, English and Hindi, in phases
- **Owner:** "give it in both" (English and Hindi).
- **Choice:** a cookie-based language switch (login page and top bar); a typed word list for the shell (menu, top bar, login, home); a full Help in both languages; Devanagari font. The working screens are phase 2.
- **Why:** every user sees the shell and the Help; the working screens carry money and stock, so they should be translated module by module and read by a Hindi-speaking staff member.
- **Trade-offs:** in Hindi mode the working screens are still English; the Hindi words are AI-written and unreviewed.
- **Revisit if:** staff cannot work with the English screens (then do phase 2 first for the screens they use most, probably Receipts, Count stock, Billing).
- **Date / model:** 2026-10-25, Claude Sonnet 5.5

## D-031: Business dashboard with hand-made SVG charts and the Motion library
- **Owner:** "like Blinkit: metrics and analysis"; shared a blog of animation libraries.
- **Choice:** one invoker database function for all numbers; tiles, column chart, bar lists and lists; charts in plain SVG (no chart library); Motion for calm animations that respect reduce-motion; English and Hindi words.
- **Why:** same access rules as everywhere; no heavy chart dependency; Motion is MIT and the standard for React; 3D and scroll libraries do not fit a work tool.
- **Trade-offs:** hand-made charts must be maintained by us; animations start hidden until JavaScript loads.
- **Revisit if:** many more chart types are needed (then consider a chart library), or the owner wants profit and stock value (needs a cost decision).
- **Date / model:** 2026-10-25, Claude Opus 5.5
