// Tabs and words of the Inventory Reports page. The database accepts exactly these tab codes.
export const TABS = ["current", "low", "out", "slow", "fast", "ageing", "movement", "location"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = {
  current: "Current Stock", low: "Low Stock", out: "Out of Stock", slow: "Slow Moving", fast: "Fast Moving", ageing: "Stock Ageing", movement: "Stock Movement", location: "Location Wise",
};
export const MOVE_TYPES = ["OPENING", "RECEIPT", "SALE", "SALE_RETURN", "TRANSFER", "TRANSFER_SHORTAGE", "ADJUSTMENT", "STOCK_IN", "STOCK_OUT"] as const;
export const MOVE_LABEL: Record<string, string> = {
  RECEIPT: "Inward", SALE: "Sale", SALE_RETURN: "Return", TRANSFER: "Transfer", TRANSFER_SHORTAGE: "Lost in transit", ADJUSTMENT: "Adjustment", OPENING: "Opening", STOCK_IN: "Stock in", STOCK_OUT: "Stock out",
};
export const STATUS_FILTERS = ["IN", "LOW", "OUT", "OVER"] as const;
export const STATUS_LABEL: Record<string, string> = { IN: "In Stock", LOW: "Low Stock", OUT: "Out of Stock", OVER: "Over Stocked" };
