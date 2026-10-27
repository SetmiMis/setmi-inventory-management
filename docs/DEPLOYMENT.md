# DEPLOYMENT (live on Vercel since 2026-10-27; checklist below)

**Status (2026-10-27): DEPLOYED to Vercel at https://setmi-inventory-management.vercel.app (same Supabase project as development, custom address not added yet). See docs/HANDOVER.md, newest entry. The text below is the original plan and still applies for what is not done yet.

**Owner's choice changed on 2026-10-27: Vercel (the Hostinger notes in section 10 are kept only as a fallback).** Wherever this file says "Vercel" it is current.

## 1. Target
- App: Hostinger Node.js web app (hPanel > Websites > Add Website > Node.js Apps), imported from the private GitHub repo `SetmiMis/setmi-inventory-management`, branch `main`. Hostinger lists Next.js as supported and Node.js 18, 20, 22, 24 (checked on Hostinger's pages on 2026-10-27; their guides disagree on whether Business or only Cloud plans include Node.js apps, so open hPanel and confirm "Node.js Apps" is offered on the plan BEFORE planning the go-live day).
- Database/Auth/Storage: Supabase (not Hostinger's MySQL: the app is built on Supabase Auth, Row Level Security and Storage). Today the only project is the development one (`setmi-inventory-management`, ref `arvdzlsimnofguwxkzev`).
- Address: `inventory.setmiindia.com` (subdomain added in hPanel / DNS of setmiindia.com).

## 2. Decision for the owner: one Supabase project or two?
| Option | Good | Bad |
|---|---|---|
| A. Use the current project as production | No copy work | The demo data and test users live there; mistakes during development hit real data |
| B. Create a second (production) project, apply the 27 migrations, keep the current one for testing | Clean separation; safe testing | May cost money on the Supabase plan (needs the owner's yes); one more place to keep migrations in step |
Recommendation: **B** once real stock is entered. Until then A is fine.

## 3. Environment variables (Vercel > Project > Settings > Environment Variables)
| Name | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | project URL | public by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key | public by design |
No service-role key is used by the app and none must be added. See `.env.example`.

## 4. Supabase settings to do in the dashboard (the AI cannot do these)
1. Authentication > Sign In / Providers: **disable "Allow new users to sign up"** (users are created by the admin only).
2. Authentication > Password: enable **leaked password protection**; set minimum length 10 or more.
3. Authentication > URL configuration: Site URL = the final address (`https://inventory.setmiindia.com`).
4. Project settings > Backups: check that daily backups are on (paid plans have them; on the free plan take a manual export before every release).
5. Make the first admin (a one-time SQL step, see `docs/HANDOVER.md`).

## 5. Release steps (every release)
1. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass on the commit.
2. Database changes first: apply new migrations to the target project, run the matching test file in `backend/supabase/tests/`, run the Supabase security advisor.
3. Push to `main`; Vercel builds. Open the preview/production URL.
4. Smoke test: sign in; open Items, Stock, Receipts, Transfers, Bills, Reports; make one test receipt and post it; print one label.
5. Record the commit in `docs/ROLLBACK.md` as known-good.

## 6. Rollback
- App: Vercel > Deployments > pick the previous good deployment > "Promote to Production" (instant, no rebuild).
- Database: migrations are forward-only. Take a backup/export BEFORE a migration; restore only for a real disaster. See `docs/ROLLBACK.md` for per-migration notes.

## 7. Security headers
Set in `next.config.ts`: X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS and (since 2026-10-27) a **Content-Security-Policy**: only this site's own scripts, styles, fonts and requests; images and connections also to the Supabase project address (read from `NEXT_PUBLIC_SUPABASE_URL` at build time, so that variable must be set before the build); no plugins, no framing, forms post only to this site. It is NOT the strict nonce version: nonces need every page rendered on each request, which does not work with Cache Components (Next.js guide says so), so scripts and styles still allow `'unsafe-inline'`. Checked on a local production build with `curl -I` and in Chrome (dashboard, sales report, Add Product with an image upload to Supabase Storage and the signed image shown again: no console errors). If a new outside service is ever added (analytics, maps, a font host), add its address to the policy. `Permissions-Policy` blocks the camera: if a phone-camera scanner is ever added, change it then.

## 8. Monitoring (not set up)
Recommended once live: Vercel runtime logs (built in), Supabase logs and advisors weekly, an uptime check on the login page, and error tracking (e.g. Sentry) if the owner wants it (new dependency, needs approval).

## 9. Day-one checklist for the owner
- [ ] Say "deploy" (and choose option A or B above)
- [ ] Do the dashboard settings in section 4
- [ ] Give DNS access or add the CNAME Vercel shows
- [ ] Create the real users, locations and permissions
- [ ] Load real items (Excel import) and opening stock (scan count), then switch billing ON only when Zoho is switched off for that shop
- [ ] Remove the DEMO data with `backend/supabase/seed/remove_demo_data.sql` (void any DEMO bills first; the script does not remove bills yet)

## 10. Hostinger steps (when the owner says "deploy")
Prepared, NOT done. Settings that only the owner can do are marked (owner).
1. (owner) hPanel: confirm the plan offers **Node.js Apps**. If it does not, upgrade the plan or use another host; do not buy anything before asking.
2. (owner) Make the subdomain: hPanel > Domains > Subdomains > create `inventory` under `setmiindia.com`. If DNS of the domain is elsewhere, add the record Hostinger shows.
3. (owner) hPanel > Websites > Add Website > Node.js Apps > Import Git repository > connect GitHub, install the Hostinger GitHub app and give it access to the PRIVATE repo `setmi-inventory-management` only. Branch `main`.
4. Framework Next.js, Node version **24** (or 22), build command `npm run build`, start command `npm start` (Next.js reads the PORT Hostinger sets). Keep the install command `npm ci`.
5. (owner) Environment variables, set BEFORE the first build because `NEXT_PUBLIC_*` values are written into the app at build time:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   Nothing else. No service-role key. If a value is changed later, redeploy (rebuild) so the new value is used.
6. Attach the subdomain to the app; turn on the free SSL certificate; open `https://inventory.setmiindia.com/login`.
7. Do section 4 (Supabase dashboard settings). **Site URL and Redirect URLs must be the new address**, or the password-reset e-mail will point to the wrong place.
8. Smoke test (section 5 step 4). Then remove DEMO data (section 9) and create the real users.
9. Rollback: redeploy the last good commit from the Hostinger deployments list (or revert on GitHub and push). Database changes are forward-only (see `docs/ROLLBACK.md`).
Known limits to expect: Hostinger builds on its own servers (a build needs about 2 GB memory; if it fails with "out of memory", tell the AI); no preview URLs per branch; logs are read in hPanel. Uploads go from the browser straight to Supabase Storage, so Hostinger's body-size limit does not affect images.
Supabase is in another country than Hostinger's server may be: check the Supabase project region (nearest to India: Mumbai / Singapore) once, because every page waits on it. Changing region means a new project, so decide before real data is entered (this is the same choice as option A / B in section 2).
