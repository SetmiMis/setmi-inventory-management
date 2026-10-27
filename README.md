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
| Hosting | Not final. Now on Vercel (frontend only). Planned: frontend + backend together (owner decides later; Hostinger VPS with PM2 and Nginx is one option) |

## Prerequisites

- Node.js 24 (developed on it; Hostinger also offers 22 and 24) and npm
- Git
- A Supabase project (URL and publishable key)

## Project layout (since 2026-10-27)

```text
frontend/   Next.js app (pages, forms, charts). Its own package.json. Port 3000.
backend/    Express REST API (TypeScript) and backend/supabase/ (database migrations, SQL tests, seed). Port 4000.
docs/       Documentation. CLAUDE.md and AGENTS.md are the rules for AI sessions.
```

The website still works on its own (its server actions talk to the database). The REST API in `backend/` is being built module by module (done so far: health check, sign-in check, products); see `docs/ARCHITECTURE.md` and `docs/HANDOVER.md`.

## Run it on your computer

```bash
cd frontend && npm install && cp .env.example .env.local   # fill the two public Supabase values
npm run dev                                                 # http://localhost:3000
```

```bash
cd backend && npm install && cp .env.example .env.local     # fill the two public Supabase values
npm run dev                                                 # http://localhost:4000/health
```

## Commands

In `frontend/`:

```bash
npm run dev | lint | typecheck | build | start | test
```

In `backend/`:

```bash
npm run dev | typecheck | build | start | test
```

Database tests are SQL scripts in `backend/supabase/tests/` (see `docs/TESTING.md`). Database changes are the files in `backend/supabase/migrations/`, applied in file-name order. On Windows PowerShell, if `npm` is blocked by the execution policy, use `npm.cmd`.

## Environment variables

Frontend: only two, both public by design: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Backend: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_URL`, `PORT` (see `backend/.env.example` and [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)). They are written into the app when it is built, so they must be set BEFORE `npm run build`. The Supabase service-role key is never used. Never commit `.env*` files; they are git-ignored.

## Documentation

- [CLAUDE.md](CLAUDE.md): rules for AI sessions
- [docs/HANDOVER.md](docs/HANDOVER.md): current state and next task
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): how to go live
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA.md](docs/DATA.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)
- [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md), [docs/TESTING.md](docs/TESTING.md), [docs/ROLLBACK.md](docs/ROLLBACK.md)
