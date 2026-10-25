# Reference: Zoho Inventory (India demo) and Odoo Inventory compared with our system

**Read on 2026-10-25:** the public Zoho Inventory India demo dashboard (menu links and dashboard widgets only; the demo is mostly a locked sandbox) and, earlier, the Odoo Inventory and Barcode documentation (`docs/ROADMAP.md`, "What we took from Odoo"). Zoho feature names beyond the dashboard come from general knowledge of the product, not from this page, so treat them as "to verify" before building.

## 1. What the Zoho demo dashboard shows
Top selling items, top stocked items (by quantity or by value), sales by channel (for example Etsy, direct), sales order summary per day, top vendors, receive history, and **Pending actions**: sales orders to be packed, packages not shipped, packages shipped, orders to be invoiced, purchase orders to be received. Left menu: Dashboard, Items, Inventory (adjustments), Sales (customers, sales orders, packages, shipments, invoices, returns, credit notes, payments), Purchases (vendors, purchase orders, receives, bills, vendor credits), Reports, Documents.

## 2. Comparison
| Area | Zoho / Odoo | Our system now | Gap |
|---|---|---|---|
| Items, categories, units, barcodes, images | yes | yes | none |
| Multi-warehouse and shops, transfers | yes (Odoo: routes, in-transit) | yes, with in-transit | none |
| Purchase order -> receive | yes | yes (P9) | no vendor bills / vendor credits (accounting) |
| Inventory adjustments with reasons | yes | stock count + quick Stock In/Out with reasons | none |
| Reorder rules / replenishment | Odoo: min/max rules; Zoho: reorder level | reorder list from real use + draft PO (G2) | none |
| Dashboard: top selling, top stocked, top vendors, receive history, pending actions | yes | sales, low stock, orders, transfers, receipts to post; **top stocked, top vendors, receive history added in this step** | closed by this step |
| Sales: customers, sales orders, packages, shipments, invoices, credit notes, payments | yes | shop billing only (no customers, no sales orders, no invoices, no credit notes) | **large gap** |
| GST invoices, e-way bill, HSN | Zoho India: yes | none (owner: later) | large, needs the accountant |
| Item groups / variants, composite items (kits, bundles) | yes | no | medium |
| Price lists (per customer or per channel) | yes | one selling price per item | medium |
| Batch / lot / serial numbers, expiry | Odoo and Zoho: yes | no | only if the business needs it |
| Stock valuation (FIFO, average cost), landed cost | Odoo yes; Zoho advanced | no cost-based reports (cost is protected) | medium; needs a cost decision |
| Sales channels (marketplaces, e-commerce) | Zoho: Amazon, Flipkart ... | none | large, external services |
| Put-away, bins, picking and packing workflows | Odoo yes | no | only for a big warehouse |
| Mobile app | Zoho: yes | works in a phone browser | PWA could be added |
| Automation, workflows, notifications | both | none | medium |
| Documents | Zoho: inbox | item files only | small |
| Audit trail | both | yes, every table | none |

## 3. Honest summary
For the owner's real flow (a shop and warehouses that buy, move and count stock, with billing still in Zoho) the inventory side is now on par with Zoho and Odoo's core. What is NOT like them is the **sales and accounting side** (customers, sales orders, invoices, credit notes, GST), because the owner bills in Zoho and tax was postponed. Building that side properly is a large project (a separate phase) and needs the accountant's rules; it should not be rushed.

## 4. Suggested next steps (in order)
1. Finish the sheet gaps: G3 indent with approval, G7 import from the shop sheet, G4 daily closing report.
2. Customers list and sales orders (no tax yet), then sales returns with credit notes.
3. GST invoice design with the accountant (needs the owner's decision).
4. Item variants/kits and price lists if the business sells bundles or has customer-wise prices.
5. Batch/serial only if needed; marketplace connectors later (external services).
