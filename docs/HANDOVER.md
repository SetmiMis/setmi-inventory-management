# HANDOVER

Newest entry on top. Read this first, update it last.

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
