# SETMI INDIA Inventory Management System

Internal company system for SETMI INDIA, a retail/trading business that buys finished electronic goods (cables, connectors, plugs, sockets, adapters) from Indian (LOCAL) and overseas (IMPORT) suppliers and sells them to customers.

**Status:** built and tested on a development database; NOT deployed yet. The current state, what is verified and what is not, is always in [docs/HANDOVER.md](docs/HANDOVER.md). Deployment plan: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What is built

Master data (products / SKU with barcodes and Excel import, categories, suppliers, warehouses and racks, customers), purchasing (purchase orders, import shipments, goods inward, quality check), inventory (current stock, stock ledger, transfers, adjustments with approval, physical count, reorder suggestions), sales (sales orders, picking and packing, dispatch, returns, optional billing behind an ON/OFF switch), reports (inventory, purchase, sales, stock valuation), administration (users and roles, settings, audit log), English and Hindi menus, light and dark mode.

Not built (shown as "Not built yet" on screen): tax / GST calculation, e-mail notifications, 2-factor login, courier connections, product variants, SEO fields, backup and restore screen. See `docs/ASSUMPTIONS.md`.

## Stack

| Part | Choice |
|---|---|
| Web app | Next.js 16 (App Router, Cache Components), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database / Auth / Storage | Supabase (Postgres with Row Level Security; writes only through checked database functions) |
| Hosting (planned) | Hostinger Node.js web app, `inventory.setmiindia.com` |

## Prerequisites

- Node.js 24 (developed on it; Hostinger also offers 22 and 24) and npm
- Git
- A Supabase project (URL and publishable key)

## Run it on your computer

```bash
npm install
cp .env.example .env.local     # then fill the two public Supabase values
npm run dev                    # http://localhost:3000
```

## Commands

```bash
npm run dev          # dev server
npm run lint         # ESLint
npm run typecheck    # next typegen && tsc --noEmit
npm run build        # production build
npm start            # run the production build (honours the PORT variable)
npm test             # unit tests for validation rules (Node built-in runner)
```

Database tests are SQL scripts in `supabase/tests/` (see `docs/TESTING.md`). Database changes are the files in `supabase/migrations/`, applied in file-name order. On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd`.

## Environment variables

Only two, both public by design: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)). They are written into the app when it is built, so they must be set BEFORE `npm run build`. The Supabase service-role key is never used. Never commit `.env*` files; they are git-ignored.

## Documentation

- [CLAUDE.md](CLAUDE.md): rules for AI sessions
- [docs/HANDOVER.md](docs/HANDOVER.md): current state and next task
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): how to go live
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA.md](docs/DATA.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)
- [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md), [docs/TESTING.md](docs/TESTING.md), [docs/ROLLBACK.md](docs/ROLLBACK.md)
