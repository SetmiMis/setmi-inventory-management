# ARCHITECTURE

## Current state (implemented)
A single Next.js App Router app with the template's default home page. No database, auth, storage or API routes exist yet.

```
src/app/layout.tsx   root layout (fonts, global CSS)
src/app/page.tsx     template home page (placeholder)
src/app/globals.css  Tailwind entry
```

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
