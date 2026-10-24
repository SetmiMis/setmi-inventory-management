# DECISIONS

Format: context, options, choice, reason, date, model.

## D-001: Stack
- **Choice:** Next.js + TypeScript + Tailwind, Supabase (Postgres/Auth/Storage), Vercel.
- **Source:** specified by the owner. Not re-evaluated by the AI.
- **Date:** 2026-10-24

## D-002: Scaffold via official `create-next-app`
- **Options:** (a) official scaffold, (b) hand-written `package.json`.
- **Choice:** (a). Lower risk of missing defaults.
- **Detail:** the project folder name ("Inventory Management System") is not a valid npm package name, so the scaffold was generated in a temporary folder as `setmi-inventory-management` and its files copied in. The scaffold's own `.git` was not copied.
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-003: `typecheck` script uses `next typegen`
- **Problem:** `tsc --noEmit` alone failed with `Cannot find name 'LayoutProps'` before the first build, because Next generates that type.
- **Choice:** `"typecheck": "next typegen && tsc --noEmit"`.
- **Verified:** passes from a clean state (`.next` deleted).
- **Date / model:** 2026-10-24, Claude Sonnet 5.5

## D-004: Item Master has separate `Item_Name` and `Selling_Item_Name`
- **Status:** owner-stated requirement, NOT yet implemented.
- **Meaning (owner):** `Selling_Item_Name` is the name shown on customer bills. It can differ from the supplier/stock-side name. The future billing module is to use it.
- **Open details:** see `docs/ASSUMPTIONS.md`.
- **Date:** 2026-10-24

## D-005: `Internal_Item_Code` is entered manually
- **Status:** owner-stated, NOT yet implemented. The system does not auto-generate it.
- **Open:** uniqueness and format rules (see `docs/ASSUMPTIONS.md`).
- **Date:** 2026-10-24

## D-006: System is multi-user
- **Status:** owner-stated. Several company users will use it, so login, roles and RLS are required. Roles are not yet defined.
- **Date:** 2026-10-24
