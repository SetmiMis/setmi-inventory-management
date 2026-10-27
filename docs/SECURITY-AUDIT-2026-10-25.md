# Security, DevOps and UI/UX audit: 2026-10-25

Owner asked: "think like a hacker, a DevOps engineer and a UI/UX designer, try everything, then fix it".
Scope: the local app, the dev Supabase project, and the code. No real data was changed (database attacks ran inside rolled-back tests). The production site was NOT touched; nothing is deployed.

## 1. Attacks that were tried (hacker view) and what happened
| Attack | Result (actual output) |
|---|---|
| Anonymous read of 12 tables over REST (items, profiles, user_permissions, audit_log, bills, stock_balances, suppliers, cost tables, app_settings, permissions, units) | every one returned `[]` |
| Anonymous insert of an item | refused: row-level security |
| Anonymous "make everyone admin" on profiles | HTTP 204 but matched 0 rows (anonymous cannot see any row); no data changed |
| Anonymous call of admin_set_billing_enabled, create_stock_entry, dashboard_data | `permission denied for function` |
| GraphQL schema dump | extension not enabled |
| Anonymous list of the item-files storage bucket | `[]` |
| Self sign-up through the Auth API | `signup_disabled` (sign-up is OFF on the dev project) |
| Unauthenticated visits to /, /items, /dashboard, /admin/users, /reports/export, any /api path, /.env, /.git/config on a production build | all redirect to /login (307) |
| Fake server action from a foreign Origin | redirected to login, nothing executed |
| `?next=https://evil.example` on /login | page shows normally, no redirect to the other site |
Code audit (read-only, by an independent reviewer): no critical or high issues. Privilege escalation is closed (profiles, permissions and places are changed only by admin functions), the stock ledger is append-only, every definer function checks permission and place, cookies and URL parameters are allow-listed, uploads are verified by real bytes, no service-role key in code.

## 2. Found and fixed
| # | Finding | Fix |
|---|---|---|
| S1 | anon role held default table grants (safe only because RLS denied) and could execute 4 trigger functions | migration 28 revokes both |
| S2 | `app_settings`, `permissions`, `units` were readable by ANY signed-in account (even a stranger or a switched-off user) | migration 28: only active users |
| S3 | Storage upload policy did not check the file path | migration 28: path must be `items/<uuid>/image-or-datasheet-<uuid>.jpg/png/webp/pdf` |
| S4 | Raw database error text shown on 4 screens | now go through `friendlyDbError` |
| S5 | Reports accepted any date range (year 1 to 9999) | limited to 366 days |
| S6 | Tool folders `.claude`, `.claude-flow`, `.agentic-qe` not git-ignored | added to `.gitignore` |
| S7 | `X-Powered-By: Next.js` header | switched off |
| D1 | No automatic checks on every push | `.github/workflows/ci.yml` (typecheck, lint, tests, npm audit, build). Not yet run on GitHub: it runs on the next push |
| U1 | Dark mode: white text on buttons 2.45:1, error text 2.28:1, input borders 1.32:1 | new tokens (`--brand` darker in dark mode, `--danger`, `--line-strong`); input border 3:1 or better |
| U2 | Stock count "Save" replaced stock with no question | confirm added |
| U3 | After tapping a quantity box the next scan was typed into it | Enter in a quantity box goes back to the scan box; receipt scan box auto-focused |
| U4 | Small quantity/price boxes (30 px, text under 16 px zooms on iPhone) | 44 px high, 16 px text on phones |
| U5 | Phone menu: no Escape, no focus handling, tiny close button | Escape closes, focus moves in and returns, 44 px buttons, dialog role |
| U6 | Cancel draft / Cancel order / Void bill looked like harmless buttons | red `dangerButton` |
| U7 | 11 px labels in the phone bar | 12 px |

## 3. Known but NOT fixed yet (need a decision or bigger work)
- **Discount has no own permission** (any user with `bills.create` can bill up to 100% off). Needs a business rule from the owner (max percent, reason).
- **Shortage write-off / FOUND stock entries have no second approver.** Business rule for the owner.
- **Supabase dashboard settings (owner must do):** turn on leaked-password protection; confirm sign-up stays OFF; confirm Auth rate limits.
- **No Content-Security-Policy.** Needs a nonce set-up and testing; deferred (docs/DEPLOYMENT.md).
- **Excel import zip-bomb limit** (only 3 MB compressed file is checked). Plausible, low risk (needs `items.import`).
- **CSV export may be cut at the database row limit (about 1000 rows).** Not yet confirmed or fixed.
- **UI/UX list not done:** item form clears fields after a server error; ticking "Check by scanning" or Reset wipes counts without asking; search boxes have no debounce or "no results"; working screens are English only; money shown without ₹ and Indian grouping; tables on a phone scroll sideways; no unsaved-changes warning; no focus trap in the Ctrl+K dialog. Full list: see the audit report summary in the HANDOVER.
- 31 "signed-in users can execute SECURITY DEFINER function" advisor warnings: accepted, each function checks permission inside (tested).

## 4. How it was checked
- `backend/supabase/tests/018_security_hardening.sql`: 10 PASS lines (anon blocked from tables and trigger function; active admin still reads units, permissions, settings; item update trigger still works; a stranger account sees nothing). Run on the dev project, rolled back.
- `npm run typecheck`, `npm run lint`, `npm test` (42 of 42 pass), `npm run build` all OK after the changes.
- Tests 015 to 017 were NOT re-run after migration 28 (it only removes anonymous rights and tightens three read policies; test 018 covers those).
- Not seen on screen: the dark-mode colour changes, phone menu and 44 px inputs were checked by code and contrast numbers only.

## 5. Reference: the Setmi India website UI
Owner shared https://system-master-mu.vercel.app/. It uses Inter, brand #005A84 / #013556, a blue sweep header `linear-gradient(45deg,#4c9fc4,#013556)`, rounded white cards, small mono eyebrow labels and teal call-to-action buttons. The inventory system already shares the brand blue; the header sweep is available as `--header-gradient` in `globals.css` but not yet applied. Waiting for the owner to say how far to match it.
