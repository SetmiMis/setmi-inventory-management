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
backend/supabase/migrations, backend/supabase/tests   database source and tests
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


## 2026-10-27 Separated frontend and backend (owner's architecture document)
Owner's sketch: `setmi_hostinger_frontend_backend_architecture.md`. Decisions and differences:
- **Folders:** `frontend/` (the Next.js app, moved as it was) and `backend/` (new Express API + `backend/supabase/` with migrations, tests, seed). `deploy/` (PM2 and Nginx files) is NOT made yet: the owner will decide hosting later.
- **Backend rules:** every request carries the person's Supabase access token (`Authorization: Bearer`); the backend creates a client with THAT token, so Row Level Security and the permission checks inside the database functions apply. The sketch's service-role client was left out on purpose (a secret key that bypasses all database rules is not needed, and `CLAUDE.md` forbids spreading it). Permissions come from `profiles.is_admin` and `user_permissions` (the sketch used `roles(...)` tables with other names). Errors are JSON with plain messages (`401` not signed in, `403` no right, `400` bad request); never a redirect, never database text.
- **Not taken over from the sketch:** the table and column names in its items example (`internal_code`, `name`, `is_primary`, `create_item_with_barcodes_tx`) do not exist in this database; the real ones (`internal_item_code`, `item_name`, `item_barcodes.is_generated`) are used. `middleware.ts` is NOT a fix in Next.js 16: the file is called `proxy.ts` there (it is deprecated to call it middleware), so `frontend/src/proxy.ts` stays.
- **Migration plan (module by module, the website keeps working at each step):** 1 products (done: list, one product, create, bulk, SKU suggestion), 2 files and barcodes, 3 categories, suppliers, locations, customers, 4 purchase orders, import shipments, receipts, quality check, 5 stock (movements, transfers, adjustments, counts), 6 sales (orders, picking, dispatch, returns), 7 reports, 8 admin (users, roles, settings). Then the frontend pages switch from server actions to `apiClient` one module at a time; the old server action is deleted only after its page works on the API and the owner agrees.
