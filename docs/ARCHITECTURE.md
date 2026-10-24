# ARCHITECTURE

## Current state (implemented)
Next.js App Router app with Supabase login, a permission guard and an admin users page. The database (9 tables, RLS) exists; no Item Master screens yet. See `docs/FLOW.md` for the real request flow.

```
src/proxy.ts                     session refresh + redirect to /login (convenience)
src/lib/supabase/{env,server}.ts Supabase clients (server only, runs as the signed-in user)
src/lib/auth.ts                  getCurrentUser, requireUser/Admin/Permission, can()
src/app/login/                   login page, form, server action
src/app/(app)/layout.tsx         signed-in shell, inactive-account guard, sign out
src/app/(app)/page.tsx           home (shows the user's access)
src/app/(app)/admin/users/       admin: users, permission toggles, location access
supabase/migrations, supabase/tests   database source and tests
```
Cache Components is on (scaffold default), so anything reading the session sits inside `<Suspense>` (done in the `(app)` layout).

## Planned (NOT implemented)
- Supabase PostgreSQL for data, Supabase Auth for company users, Supabase Storage for item images and datasheets.
- Server-side authorization for every protected operation, plus Row Level Security.
- Hosting on Vercel at `inventory.setmiindia.com`.
- Separation of UI, business rules and database access.

## Module boundaries
- Item Master: owns product identity (codes, names, category, purchase source, images, datasheet, barcode).
- Future, separate modules: stock receiving/outward, locations, transfers, ledger, billing, reports. Stock quantity and location are not Item Master data.

## Trust boundaries (planned)
Browser (untrusted) to Next.js server (validates and authorizes) to Supabase (RLS as second line of defence).

Update this file when real modules, routes or services are added.
