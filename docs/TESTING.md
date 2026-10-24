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

## Not tested yet (gaps)
- Storage bucket policies (`item-files`): upload/download as different users.
- `locations` policies and `user_locations` scoping.
- `admin_set_user_*` success path as a real admin (only the denial path is tested).
- Real Supabase Auth login flow (no app code exists yet).
- Re-run after every migration change.
