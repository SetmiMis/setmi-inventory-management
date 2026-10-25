# ROLLBACK

## Current known-good points
| What | Value | Notes |
|---|---|---|
| Last commit pushed to GitHub (`origin/main`) | `beb401f` (P7: billing with ON/OFF switch) | Verified with `git ls-remote origin` on 2026-10-25. Previous known-good: `981259d` (P6), `83f8d1c` (P5), `065e20f`, `2fab60a` (P4), `e2eb995` (P3) |
| Database state matching it | migrations 001 to 012 | all applied to the dev Supabase project |

Undo migrations 11-12 (transfers) only if no transfer was ever sent: sent transfers leave movements that point at the in-transit place. If only drafts exist: drop the transfer functions, `stock_transfer_lines`, `stock_transfers`, the sequence and the four permission rows, then the in-transit place and its triggers; the two new enum values cannot be removed from the enums (harmless if unused). Take a backup first.

Undo migration 10 (receiving) only if no receipt was ever posted: the posted receipts are part of the audit trail and the stock ledger points at their numbers. If only drafts exist: drop `goods_receipt_costs`, `goods_receipt_lines`, `goods_receipts`, `suppliers`, the three functions, the guard functions, the enum `receipt_status`, the sequence `goods_receipt_seq` and the six permission rows, in that order, after a backup.

## Undo an application change
1. `git log --oneline` and pick the commit before the bad one.
2. Safest: `git revert <bad commit>` (creates a new commit, keeps history). Do NOT force-push or rewrite pushed history without the owner's explicit approval.
3. Check: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Undo a database migration
Migrations are forward-only SQL files in `supabase/migrations/`. There is no automatic down-migration. To undo, write a NEW migration that reverses it (examples below), test it on a copy first, and keep the data.
- Migration 9 (revoke execute): `grant execute on function public.items_unit_guard() to authenticated;` (not needed; trigger works without it).
- Migration 8 (view): `drop view public.stock_overview;` (the stock list page then shows an error until restored; no data lost).
- Migration 7 (stock): the tables hold real stock history once used. Do NOT drop them to roll back. If stock was never used (only demo data), run `supabase/seed/remove_demo_data.sql` first, then drop in this order: `reorder_levels`, `stock_balances`, `stock_movements`, trigger `items_unit_guard_trg`, function `items_unit_guard`, `items_unit_fk`, `units`, the enum `stock_movement_type`, the four permission rows. Take a backup first.
- Earlier migrations: same idea; ask before touching tables that hold items or users.

## Backups
Supabase keeps automatic backups depending on the plan. Before any risky change on a database with real data: confirm a recent backup exists in the Supabase dashboard (Database > Backups), or export with `pg_dump`. Not yet verified for this project (owner to check the plan).

## Demo data
`supabase/seed/remove_demo_data.sql` removes only things whose code or name starts with DEMO. It temporarily disables the append-only trigger and re-enables it in the same transaction (verified on 2026-10-25). Never run it where DEMO-named things carry real history.

## After a rollback verify
Sign in; open Items, Locations, Stock; run the SQL tests in `supabase/tests/` (each ends with a deliberate error that rolls back and prints PASS/FAIL lines).
