# DEPENDENCIES

From `package.json` (all added by the official `create-next-app` scaffold on 2026-10-24; no extra packages were added by hand).

| Package | Version spec | Purpose |
|---|---|---|
| next | 16.4.3 | Web framework |
| react / react-dom | 19.3.0 | UI library |
| typescript | ^5 | Type checking |
| tailwindcss | ^4 | Styling |
| @tailwindcss/turbopack | ^4 | Tailwind integration for Next's Turbopack. Checked on npm registry: v4.3.3, maintained by the Tailwind team |
| eslint, eslint-config-next | ^9 / 16.4.3 | Linting |
| @types/node, @types/react, @types/react-dom | ^20 / ^19 / ^19 | Type definitions |

`npm install` result: 357 packages, 0 vulnerabilities (npm audit summary at install time).

## Notes
- npm flags `eslint@9.39.5` as deprecated. Upgrade needs approval.
- `unrs-resolver` has a postinstall script that npm did not run (allowScripts). Not needed so far.
- Run `npm audit` again before any release.

## Added 2026-10-24 (P1, owner authorised building the app)
| Package | Version | Why |
|---|---|---|
| @supabase/supabase-js | ^2.118.0 | Supabase client (database, auth) |
| @supabase/ssr | ^0.12.7 | Cookie-based sessions for Next.js server code |
| zod | ^4.6.7 | Server-side validation of form input |

`npm install` after adding: 0 vulnerabilities.

Not installed yet: Excel library for import (choose carefully; some spreadsheet parsers have had security issues), test runner.
