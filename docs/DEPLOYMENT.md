# DEPLOYMENT (plan and checklist, nothing is deployed yet)

**Status:** NOT deployed. No Vercel project, no DNS, no production database exists. The owner must say "deploy" first (rule in CLAUDE.md). This file is the DevOps plan so that when the owner says yes, it is a short, safe job.

## 1. Target
- App: Vercel, project from the private GitHub repo `SetmiMis/setmi-inventory-management`, branch `main`.
- Database/Auth/Storage: Supabase. Today the only project is the development one (`setmi-inventory-management`, ref `arvdzlsimnofguwxkzev`).
- Address: `inventory.setmiindia.com` (CNAME at the DNS provider of setmiindia.com).

## 2. Decision for the owner: one Supabase project or two?
| Option | Good | Bad |
|---|---|---|
| A. Use the current project as production | No copy work | The demo data and test users live there; mistakes during development hit real data |
| B. Create a second (production) project, apply the 22 migrations, keep the current one for testing | Clean separation; safe testing | May cost money on the Supabase plan (needs the owner's yes); one more place to keep migrations in step |
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
2. Database changes first: apply new migrations to the target project, run the matching test file in `supabase/tests/`, run the Supabase security advisor.
3. Push to `main`; Vercel builds. Open the preview/production URL.
4. Smoke test: sign in; open Items, Stock, Receipts, Transfers, Bills, Reports; make one test receipt and post it; print one label.
5. Record the commit in `docs/ROLLBACK.md` as known-good.

## 6. Rollback
- App: Vercel > Deployments > pick the previous good deployment > "Promote to Production" (instant, no rebuild).
- Database: migrations are forward-only. Take a backup/export BEFORE a migration; restore only for a real disaster. See `docs/ROLLBACK.md` for per-migration notes.

## 7. Security headers
Set in `next.config.ts` (X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS). Checked on a local production build with `curl -I`. A Content-Security-Policy is NOT set yet: Next.js needs nonce handling, so it must be added and tested on its own. `Permissions-Policy` blocks the camera: if a phone-camera scanner is ever added, change it then.

## 8. Monitoring (not set up)
Recommended once live: Vercel runtime logs (built in), Supabase logs and advisors weekly, an uptime check on the login page, and error tracking (e.g. Sentry) if the owner wants it (new dependency, needs approval).

## 9. Day-one checklist for the owner
- [ ] Say "deploy" (and choose option A or B above)
- [ ] Do the dashboard settings in section 4
- [ ] Give DNS access or add the CNAME Vercel shows
- [ ] Create the real users, locations and permissions
- [ ] Load real items (Excel import) and opening stock (scan count), then switch billing ON only when Zoho is switched off for that shop
- [ ] Remove the DEMO data with `supabase/seed/remove_demo_data.sql` (void any DEMO bills first; the script does not remove bills yet)
