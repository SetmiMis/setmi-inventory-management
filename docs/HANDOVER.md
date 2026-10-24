# HANDOVER

Newest entry on top. Read this first, update it last.

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
