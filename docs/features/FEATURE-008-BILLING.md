# FEATURE-008: Shop billing with an ON/OFF switch (P7)

**Status:** IMPLEMENTED 2026-10-25. Not yet clicked through in a browser or tried with a real scanner or receipt printer.
**Owner decision:** "We bill in Zoho right now, so build the billing part now, but keep an option to switch it on and off." Tax: "leave tax for now."

## 1. What it is (and what it is not)
A simple shop bill: scan items, the bill shows each item's **Selling_Item_Name**, stock of that shop goes down, the bill can be printed on a narrow receipt. It has **no tax**: no GST, no tax invoice number. It is NOT a tax invoice.

## 2. The switch
- Setting `billing_enabled` in table `app_settings`, **OFF by default**. Only an admin can change it (screen `/admin/settings`, database function `admin_set_billing_enabled`); every change is in the audit log.
- While OFF: the "Billing" menu and screen are hidden/blocked **and the database refuses to create any bill** (`create_bill` raises "Billing is switched off"), so hiding a button is not the only control (tested).
- Voiding an existing bill stays possible while OFF (the switch stops NEW bills only). The bills list stays visible.
- **Important for the owner:** while OFF, sales made in Zoho do NOT reduce stock here. Stock must be kept right with stock counts (or, later, an import of Zoho sales). Never bill the same sale in both systems.

## 3. Design
- Needs a price: `items.selling_price` (rupees, 2 decimals, optional). Set on the item page by people with `items.edit_price`. The Excel import does not read prices yet. An item with no price cannot be billed.
- Tables: `bills` (BILL-000001, place, payment mode CASH/UPI/CARD/OTHER, customer name/phone optional, subtotal, discount, total, status COMPLETED/VOIDED, void info) and `bill_lines` (item, **name, code, unit, quantity, price, line total copied at billing time**, so later edits to an item never change an old bill). Bills and lines can never be edited or deleted; the only change allowed is COMPLETED -> VOIDED through `void_bill`.
- `create_bill(header, lines)`: one call, all or nothing. Checks: switch ON, `bills.create`, the user works at that place, place active, payment mode, every item active with a price, quantity > 0 within the unit's decimals, price equals the item's price unless the user has `bills.override_price`, no item twice, discount between 0 and the subtotal, enough stock (names the short items). Writes the bill, its lines and one SALE movement per line (stock goes from the shop to "outside").
- `void_bill(id, reason)`: needs `bills.void`, a reason, access to the shop; writes SALE_RETURN movements (stock comes back); bill stays as history marked Voided.
- Permissions (admin toggles): `bills.view`, `bills.create`, `bills.void`, `bills.override_price`, `items.edit_price`.
- Screens: `/billing` (scan or search, cart with quantity and price, discount, payment mode, customer, "Complete bill"; shop only, not a warehouse), `/bills` (one day, India time, per place, day total and per-payment totals, voided not counted), `/bills/[id]` (view, void), `/bills/[id]/print` (80 mm receipt). Sound and message for unknown barcodes, as in the other scan screens.

## 4. Alternatives considered
| Option | Why not |
|---|---|
| Draft bills saved before completing | More states and half-finished documents; a shop counter bill is made in one go |
| Let the cashier type any price | Open to fraud; override needs its own permission |
| Hide the module with a menu flag only | The owner could end up with bills made through a leftover URL while Zoho is also in use |
| Put tax in now | Owner said later; rules depend on the accountant |

## 5. Limits and open points
- No tax, no invoice-number series, no returns with a credit note, no partial payments or credit customers, no customer master, no price lists per customer. Bill numbers can have gaps (sequence).
- Stock shown while billing is only visible to users with `stock.view`; others see "?" but the database still refuses an oversell.
- When the owner stops using Zoho for a shop, they must also decide how existing Zoho stock and customers are carried over (not built).
- A Zoho sales import (to reduce stock while billing stays in Zoho) is a possible later feature; it needs the export format.
