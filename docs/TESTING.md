# TESTING

## App checks (no automated test suite yet)
```bash
npm run lint
npm run typecheck
npm run build
```
Results 2026-10-24 (Task 001): all exit 0. See `docs/HANDOVER.md`.

## Database tests: `supabase/tests/001_rls_and_constraints.sql`
Run in the Supabase SQL editor or with `execute_sql`. It creates temporary users, switches database role to test as each kind of user, and ends with a deliberate exception so everything is rolled back. The "error" text is the report.

**Run 2026-10-24 on project `arvdzlsimnofguwxkzev`: 20 of 20 PASS.** Afterwards the tables were verified empty (0 auth users, 0 profiles, 0 items, 0 audit rows).

| Test | What it proves |
|---|---|
| T0 | New profiles are inactive by default |
| T1-T3 | Admin can insert; a user with no permission sees nothing and cannot insert |
| T4 | A non-admin cannot call `admin_set_user_permissions` |
| T5 | A user cannot make themselves admin |
| T6 | A user without `audit.view` reads no audit rows |
| T7-T8 | Permitted user sees and edits items |
| T9 | Changing `selling_item_name` needs `items.edit_selling_name` |
| T10 | Archiving needs `items.archive` |
| T11 | Delete affects 0 rows (no delete policy) |
| T12 | Duplicate `internal_item_code` rejected (case and spaces ignored) |
| T13-T14 | Many items may have no import code; a filled import code must be unique |
| T15-T16 | Blank name rejected; more than 4 images rejected |
| T17 | One barcode value cannot belong to two items |
| T18 | An inactive user sees nothing even if permissions exist |
| T19 | Anonymous user sees nothing |
| T20 | Changes are written to the audit log |

## P1 app checks (2026-10-24)
| Check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` (clean `.next`) | exit 0 |
| `npm run build` | exit 0; routes `/` and `/admin/users` partial-prerender, `/login` static, Proxy active |
| `npm run start` then GET without a session | `/login` 200; `/` 307; `/admin/users` 307 (redirect target not captured in the output) |
| `/login` HTML | contains "Sign in"; does not contain "service_role" |

Note: a stale `.next` folder after deleting a page can break `typecheck`; delete `.next` and rerun.

## P2a Item Master checks (2026-10-24)
| Check | Result |
|---|---|
| DB tests `supabase/tests/002_item_guards.sql` | 7/7 PASS (created_by/updated_by forced, archive-only cannot edit, archive and restore work) |
| `npm run lint` / `typecheck` / `build` | all exit 0. New routes: `/items`, `/items/new`, `/items/[id]`, `/items/categories` |
| Search filter syntax sent to PostgREST (anonymous request) | HTTP 200, `[]` (syntax accepted; RLS shows nothing without login) |

NOT run: the item screens in a browser with a real user (no add/edit/archive/barcode/search click-through yet), the 25-per-page paging with real data, categories page.

## P2b file upload checks (2026-10-24)
| Check | Result |
|---|---|
| `npm test` (`tests/files.test.ts`, node built-in runner, no extra packages) | 7/7 PASS: real file signatures, disguised files (svg, html, exe, wav-as-webp) rejected, size limits, strict storage path parsing (path tricks refused), barcode and search sanitising, item validation |
| DB tests `supabase/tests/003_storage_policies.sql` | all PASS: bucket private, 10 MB, no svg/html type; editor can upload and update; viewer can read but not upload or update; no-permission user and anonymous see nothing |
| lint, typecheck, build | exit 0 |

Note: Supabase blocks direct SQL DELETE on storage tables, so delete permission is checked through the UPDATE policy (same condition, `items.edit`). Deleting through the Storage API as a viewer was not exercised.

NOT run: a real browser upload (needs a login), the 4-image limit in the UI, replacing a datasheet, removing files, the signed view links.

## Barcode checks (2026-10-24)
| Check | Result |
|---|---|
| DB tests `supabase/tests/004_barcode_generation.sql` | 13/13 PASS (real EAN check digits 4006381333931 and 5901234123457; 13 digits starting with 2; idempotent; different items get different numbers; reuse on another item refused; viewer and anonymous refused; audit rows) |
| `npm test` | 12/12 PASS (5 new EAN-13 tests) |
| Independent decoder (ZXing, throw-away folder, script not kept in the project) | 2112/2112 correct decodes, 704 numbers x 3 sizes |
| lint, typecheck, build | exit 0; new route `/items/[id]/labels` |

NOT run: printing on a real printer, scanning a printed label with a real scanner, the generate button and label page in a browser (login needed). Please print ONE label first and scan it.

## Not tested yet (gaps)
- Real login with a real user, the admin page with real data, and the Save button. No user exists yet; first admin must be created in the Supabase dashboard.
- No automated browser/end-to-end tests.
- Storage bucket policies (`item-files`): upload/download as different users.
- `locations` policies and `user_locations` scoping.
- `admin_set_user_*` success path as a real admin (only the denial path is tested).
- Real Supabase Auth login flow (no app code exists yet).
- Re-run after every migration change.
