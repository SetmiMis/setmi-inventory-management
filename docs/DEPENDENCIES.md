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

Added 2026-10-24 (P2c, owner approved): **read-excel-file ^9.3.12** (MIT) to read the owner's `.xlsx` for the item import. Chosen after `npm audit` of three candidates (xlsx: 1 high with no fix; exceljs: 2 moderate; this one: 0). Read only, server side only. `npm audit` for the project after adding: 0 vulnerabilities. Review again before each release.

Not installed yet: Excel library for import (choose carefully; some spreadsheet parsers have had security issues), test runner.

Added 2026-10-25 (UI polish, owner said "use the best UI/UX libraries and icons"): **lucide-react ^1.61.0** (ISC licence), icon set used as React components; `npm install` reported 0 vulnerabilities. Everything else in the new look is plain Tailwind CSS (already installed), so no component framework was added. This keeps the bundle small and the code easy for a beginner to read.

Added 2026-10-25 (languages): the font **Noto Sans Devanagari** (SIL Open Font Licence) through `next/font/google`, so Hindi letters show correctly. It is downloaded when the app is built; it is not an npm package and adds no dependency to package.json.

Added 2026-10-25 (dashboard): **motion ^14.6.0** (MIT), the animation library recommended first in the blog the owner shared; used for card reveal, count-up numbers and growing chart bars, and it respects "reduce motion". `npm audit --omit=dev`: 0 vulnerabilities. Charts are hand-made SVG, so no chart library was added.

Added 2026-10-25 (tooling, not an app dependency): the **ui-ux-pro-max** Claude skill (MIT, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), copied into `.claude/skills/ui-ux-pro-max/` (73 files, ~3.5 MB; Python standard library only, no network calls, nothing installed globally; scripts and SKILL.md were read first). It is NOT in `package.json` and not shipped with the app. It is not committed (the `.claude/` folder stays out of git). To remove: delete that folder. See its `LOCAL-NOTE.md`.
