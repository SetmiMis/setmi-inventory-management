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

## P2c Excel import checks (2026-10-24)
| Check | Result |
|---|---|
| DB tests `supabase/tests/005_import_items.sql` | 16/16 PASS: dry run finds the exact bad rows (existing code, duplicate in file, bad source, barcode taken, blank name, import code taken); dry run writes nothing; errors without "skip" create nothing; skip mode creates only good rows; selling name falls back to item name; existing category reused, new one created once; barcodes linked; SETMI barcodes generated on request; no `items.import` refused; no `categories.manage` cannot create categories; more than 2000 rows, empty list and non-list refused; anonymous refused; audit row written |
| `npm test` | 20/20 PASS (8 new for the sheet parser, using the owner's real layout and rows) |
| Real `.xlsx` through the library + parser (throw-away folder) | as described in FEATURE-002 section 0: all as expected |
| lint, typecheck, build, `npm audit` | exit 0, 0 vulnerabilities |

NOT run: the import screen in a browser with a login (needs the owner), a 2000-row file, a very large or hostile `.xlsx` (zip bomb) file.

## P3 locations checks (2026-10-25)
| Check | Result |
|---|---|
| DB tests `supabase/tests/006_locations.sql` | 17/17 PASS (see FEATURE-004 section 0) |
| `npm test` | 23/23 PASS (3 new for location rules) |
| lint, typecheck, build | exit 0; new routes `/locations`, `/locations/new`, `/locations/[id]` |

NOT run: the screens in a browser with a login; the switcher with a user who has two places; the cookie being ignored when it holds a place the user is not assigned to (logic reviewed, not exercised).

## P4 stock checks (2026-10-25)
| Check | Result |
|---|---|
| DB tests `supabase/tests/007_stock.sql` | 28/28 PASS: opening stock, correction down and up, same count writes nothing, reason required, pieces refuse fractions, metres accept 3 decimals, negative refused, one bad row writes nothing, opening twice refused, cannot count in a place you do not work in, no direct insert into ledger or edit of balances, min/max rules, ledger update and delete refused, transfer moves stock, stock never negative and a failed movement leaves the balance alone, unit locked once stock exists, shop user sees only own place, view-only user cannot count, admin sees all, anonymous sees nothing, audit rows |
| DB tests `supabase/tests/008_stock_overview.sql` | 4/4 PASS |
| `npm test` | 25/25 PASS (quantity parser added) |
| lint, typecheck, build | exit 0; new routes `/stock`, `/stock/count`, `/stock/movements` |
| Demo seed and removal on the dev project | seed loaded (12 items, 36 movements, balances match the arithmetic), removal emptied everything and the append-only trigger was back on, seed loaded again |
| Supabase security advisor | one new warning (trigger function executable) fixed by migration 9; remaining: the accepted SECURITY DEFINER notes, and "leaked password protection disabled" (dashboard setting, owner) |

NOT run: the stock screens in a browser with a login, the count sheet with a user who has two places, a 500-row count, concurrent counts by two users.

## Scan-count screen checks (2026-10-25)
| Check | Result |
|---|---|
| lint, typecheck, `npm test` (25/25), build | exit 0; new route `/stock/scan` |
| Server-side lookup and save | reuse the already tested pieces: exact barcode match, `apply_stock_count` (DB tests 007 cover permission, decimals, all-or-nothing) |

NOT run: the screen in a browser, a real USB scanner, the beep (browsers may block sound until the page was clicked), a user with `stock.adjust` but without `items.view` (lookup answers "You cannot see this item"), two scans closer than 100 ms. There is no automated test for the client component (no browser test tool installed yet).

## P5 receiving checks (2026-10-25)
| Check | Result |
|---|---|
| DB tests `supabase/tests/009_receiving.sql` | 32 lines, all PASS: draft saved with a GRN number and no stock effect; user without `receipts.cost` sees no prices and keeps old prices when editing; posting needs `receipts.post`; posting adds stock and writes RECEIPT movements; posting twice refused and stock unchanged; posted receipt cannot be edited or cancelled; lines, prices and receipt are locked even for the project owner and cannot be deleted; pieces refuse fractions; same item twice refused; cannot receive into a place you do not work in; archived supplier refused; same supplier invoice twice refused, reusable after cancel; cancelled receipt cannot be posted; no direct insert; archived item blocks posting; viewer sees receipts and lines but no prices; shop user sees no warehouse receipts; suppliers need `suppliers.manage`; GSTIN format; duplicate supplier name; anonymous sees nothing; audit row |
| `npm test` | 28/28 PASS (3 new for the supplier rules) |
| lint, typecheck, build | exit 0; new routes `/receipts`, `/receipts/new`, `/receipts/[id]`, `/receipts/[id]/print`, `/receipts/[id]/labels`, `/suppliers`, `/suppliers/new`, `/suppliers/[id]` |
| Supabase security advisor | no new warning (only the accepted "signed-in users can execute SECURITY DEFINER" notes; every such function checks permission inside) and the dashboard-setting warning "leaked password protection disabled" |
| First test run failed, second passed | the first run was my test script's mistake (login identity left set after `reset role`), not a database fault |

NOT run: the receipt editor in a browser, a real scanner on it, A4 print, label print for a receipt, a user with `receipts.create` but without `items.view` (lookups fail), two people posting at the same moment (covered by a row lock; not stress-tested).

## P6 transfer checks (2026-10-25)
| Check | Result |
|---|---|
| DB tests `supabase/tests/010_transfers.sql` | 38 lines, all PASS: draft saved with a TRF number and both place names copied; destinations list never shows the system place; draft does not touch stock; from = to refused; fractions refused for pieces; cannot prepare a transfer from a place you do not work in; send needs `transfers.send`; sending takes stock out of the source and into transit; send twice refused and stock unchanged; not enough stock names the short items; a sent transfer cannot be edited; receive needs `transfers.receive` and the receiving place; more than sent refused; shortage needs a note; every line must be answered; receive with shortage: shop gets what arrived, transit returns to 0, one shortage movement, flag set; receive twice refused and stock unchanged; recall puts goods back and cancels; a received transfer cannot be recalled; a shop user cannot see transfers between two other places; viewer sees transfers touching their place with lines; no direct insert; suggestion fills to the maximum capped by the source's stock and is empty for users without the right; the system place cannot be edited, duplicated or assigned and is hidden from the stock list; only transfers may use it; lines of finished transfers locked, no delete; audit rows; anonymous sees nothing |
| `remove_demo_data.sql` with receipts and transfers (rolled-back test) | removed receipts, lines, transfers, movements, balances, demo items and places; all 6 guard triggers back ON; a real place was kept |
| `npm test` | 28/28 PASS |
| lint, typecheck, build | exit 0; new routes `/transfers`, `/transfers/new`, `/transfers/[id]`, `/transfers/[id]/print` |
| Supabase security advisor | no new kind of warning (the accepted "signed-in users can execute SECURITY DEFINER" notes, now 20, each checks permission inside; no anonymous ones); plus the dashboard setting "leaked password protection disabled" |
| First run of the test | had a NULL result because the script read the system place's balance as a normal user (only admins may). Fixed in the script; not a database fault |

NOT run: the transfer screens in a browser, the receive screen with a real scanner, A4 dispatch note print, two people sending/receiving at the same moment (row lock; not stress-tested).

## Note about the older DB tests
Tests 006-009 (and 003/004 in places) assume an EMPTY database: they count rows. With the demo data and the hidden in-transit place present, some of those counts differ and the tests would report FAIL. Run them on an empty copy (a Supabase branch) or read the failing line before trusting it.

## Not tested yet (gaps)
- Real login with a real user, the admin page with real data, and the Save button. No user exists yet; first admin must be created in the Supabase dashboard.
- No automated browser/end-to-end tests.
- Storage bucket policies (`item-files`): upload/download as different users.
- `locations` policies and `user_locations` scoping.
- `admin_set_user_*` success path as a real admin (only the denial path is tested).
- Real Supabase Auth login flow (no app code exists yet).
- Re-run after every migration change.
