// Tabs and words of the Stock Valuation page. The database accepts exactly these tab codes.
export const TABS = ["sku", "category", "warehouse", "supplier", "ageing", "movers", "low", "out"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = {
  sku: "SKU-wise Valuation", category: "Category-wise", warehouse: "Warehouse-wise", supplier: "Supplier-wise", ageing: "Ageing-wise", movers: "Fast / Slow Moving", low: "Low Stock", out: "Out of Stock",
};
export const STATUS_FILTERS = ["IN", "LOW", "OUT", "OVER"] as const;
export const STATUS_LABEL: Record<string, string> = { IN: "In Stock", LOW: "Low Stock", OUT: "Out of Stock", OVER: "Over Stocked" };
export const MOVEMENT_LABEL: Record<string, string> = { FAST: "Fast Moving", SLOW: "Slow Moving", NORMAL: "Normal" };
