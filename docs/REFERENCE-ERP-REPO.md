# Reference: the owner's other repo `SetmiMis/erp`

**Read on 2026-10-25** from the public GitHub repo (README, ROADMAP, AUDIT_REPORT headings, the purchase-order and quality-check code). The owner said: "take what you can use for your work". This file records what was taken, what was not, and why. Nothing was copied as code: the repo is NestJS + TypeORM with its own login, ours is Next.js + Supabase with row-level security, so the ideas were rebuilt, not pasted.

## What that repo is
A multi-company manufacturing ERP: purchasing (PO -> GRN -> QC), production (BOM, production orders), inventory (stock ledger, dispatch, finished-goods receipt), customers, suppliers, roles and permissions. Backend on Render, frontend on Vercel, database on Supabase (RLS off, the backend uses its own JWT).

## Taken (built here as P9)
| Idea | How it was rebuilt here |
|---|---|
| Purchase order with statuses draft / sent / partial / completed / cancelled | `purchase_orders` with the same flow, enforced by a database trigger (status only moves forward, a sent order is frozen, nothing is deleted) |
| PO -> GRN link and "partial" progress | `goods_receipts.purchase_order_id`; posting a receipt updates `received_qty` per line and the order status in the same transaction |
| Expected delivery date | `expected_date`, shown as "Late" in the list when passed and the order is still open |
| Close an order whose rest will not come | `close_purchase_order` with a mandatory reason |
| Supplier, warehouse and item must belong to the company (scoping) | Row-level security and place checks inside each function |

## Lessons from their AUDIT_REPORT / ROADMAP, applied here
- **Number generation by "last id + 1" is racy and can repeat after deletes.** Their PO and QC numbers use it. Here numbers come from database sequences (gaps possible, never duplicates) and documents are never deleted.
- **Update without reversing stock** was an open bug in their dispatch/FGR. Here posted documents are immutable; corrections are new movements (counts, voids).
- **Stock race conditions** needed row locks added later. Here every stock change goes through one trigger/function with locks from the start.
- **Unpaginated ledger (LIMIT 500)**: ours is paginated.
- **RLS off + public demo password in the README**: ours has RLS on every table and no demo credentials in the repo. (Note for the owner: that repo is public and its README shows `admin@demo.com / Demo@1234` for a live backend. If that demo account touches anything real, change it.)

## Not taken now (candidates for later, with the reason)
| Idea | Why not now |
|---|---|
| BOM, production orders, finished-goods receipt | This system is for warehouses and shops. If SETMI also manufactures, it is a separate module that must be designed with the owner |
| Quality check on receiving (checked / passed / failed per line) | Good idea; needs the owner's rule: do failed pieces enter stock or a quarantine place? Add after that answer |
| Customers master and dispatch | Billing has an optional name and phone only; a customer list belongs with the GST/credit design |
| Batch / lot / serial / expiry | Not needed for connectors unless the owner says so; large change to the ledger |
| Tax per line on a PO | Owner: tax later |
| Multi-company tenants, subscription billing, marketplace connectors | Out of scope for one company's internal system |
| Workflow/approval engine, notification centre | PO has a simple send/approve permission; email/SMS needs an external service (needs approval) |

## Licence
The repo carries an Apache-2.0 LICENSE file. No code was copied, so no attribution obligation arises here; if code is ever copied, keep their notice.
