// "Start simple, step by step": the administrator picks a step (1 to 4) in Settings; the menu, the search box and the quick actions
// then show only the pages of that step and the steps before it. This only decides what is SHOWN. It does not block a page
// (permissions do that) and nothing is deleted. A page that is not listed here counts as step 4, so new pages stay out of the
// small menus until they are given a step on purpose.

export type MenuStep = 1 | 2 | 3 | 4;

export const MENU_STEPS: { step: MenuStep; title: string; text: string }[] = [
  { step: 1, title: "Step 1: daily stock work", text: "Products, Categories, Current Stock, Warehouses (warehouse and shop stock), Stock In/Out, Low stock / Reorder." },
  { step: 2, title: "Step 2: receiving goods", text: "Step 1 plus Suppliers, Goods Inward (GRN) and Locations (Racks)." },
  { step: 3, title: "Step 3: moving and checking stock", text: "Step 2 plus Transfers, Stock Ledger, Physical Count and Quality Check." },
  { step: 4, title: "Step 4: everything", text: "Step 3 plus Customers, Purchase Orders, Import Shipments, Sales Orders, Picking, Dispatch, Returns, Reports and Bills." },
];

const STEP_OF: Record<string, MenuStep> = {
  "/": 1, "/dashboard": 1, "/help": 1,
  "/items": 1, "/items/categories": 1, "/items/new": 1, "/locations": 1, "/stock": 1, "/stock/entry": 1, "/reorder": 1,
  "/admin/users": 1, "/admin/settings": 1,
  "/suppliers": 2, "/locations/racks": 2, "/receipts": 2, "/receipts/new": 2,
  "/stock/movements": 3, "/stock/count": 3, "/transfers": 3, "/transfers/new": 3, "/quality-check": 3,
};

export function stepOf(href: string): MenuStep {
  return STEP_OF[href.split("?")[0]] ?? 4;
}

export function showAtStep(href: string, step: MenuStep): boolean {
  return stepOf(href) <= step;
}

// The value from the database: anything that is not a whole number from 1 to 4 means "show everything".
export function parseStep(value: unknown): MenuStep {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : 4;
}
