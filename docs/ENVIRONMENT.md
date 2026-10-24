# ENVIRONMENT

| Name | Public or secret | Where set | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | local `.env.local` (set 2026-10-24); Vercel later | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public by design | local `.env.local`; Vercel later | Supabase publishable key. Safe in the browser because RLS protects data |

No secret variable is used. A service-role key is NOT used anywhere in the code. Never write values in this file.

Rules:
- `NEXT_PUBLIC_*` variables are visible in the browser. Only non-secret values may use that prefix.
- The Supabase service-role key must never use `NEXT_PUBLIC_` and must never reach client code.
- `.env*` is git-ignored (verified in `.gitignore`).
- Use a separate Supabase project for IMS; do not reuse the CRM project.
