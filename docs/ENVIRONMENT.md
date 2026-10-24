# ENVIRONMENT

No environment variables are used yet.

When Supabase is added, list here: variable NAME, public or secret, where configured (local `.env.local`, Vercel preview, Vercel production). Never write values in this file.

Rules:
- `NEXT_PUBLIC_*` variables are visible in the browser. Only non-secret values may use that prefix.
- The Supabase service-role key must never use `NEXT_PUBLIC_` and must never reach client code.
- `.env*` is git-ignored (verified in `.gitignore`).
- Use a separate Supabase project for IMS; do not reuse the CRM project.
