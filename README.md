# SETMI INDIA Inventory Management System

Internal company system for SETMI INDIA, a retail/trading business that buys finished electronic goods (cables, connectors, plugs, sockets, adapters) from Indian (LOCAL) and overseas (IMPORT) suppliers and sells them to customers.

**Status:** base project only. Item Master is not built yet. See [docs/HANDOVER.md](docs/HANDOVER.md) for the current state.

## Planned stack

| Part | Choice | Status |
|---|---|---|
| Web app | Next.js (App Router) + TypeScript | Installed |
| Styling | Tailwind CSS | Installed |
| Database / Auth / Storage | Supabase | Not set up yet |
| Hosting | Vercel, `inventory.setmiindia.com` | Not set up yet |

## Prerequisites

- Node.js (developed on v24) and npm
- Git

## Commands

```bash
npm install          # install dependencies
npm run dev          # dev server on http://localhost:3000
npm run lint         # ESLint
npm run typecheck    # next typegen && tsc --noEmit
npm run build        # production build
```

There is no automated test suite yet. `lint`, `typecheck` and `build` are the current checks.

## Environment variables

None are required yet. Names will be listed in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) when added. Never commit `.env*` files; they are git-ignored.

## Documentation

- [CLAUDE.md](CLAUDE.md): rules for AI sessions
- [docs/HANDOVER.md](docs/HANDOVER.md): current state and next task
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md)
- [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md)
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
