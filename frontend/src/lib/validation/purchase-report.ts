// Tabs and words of the Purchase Reports page. The database accepts exactly these tab and status codes.
export const TABS = ["orders", "grn", "pending", "supplier", "category", "item", "monthly", "comparative"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = {
  orders: "Purchase Orders", grn: "GRN / Goods Received", pending: "Pending Deliveries", supplier: "Supplier Wise", category: "Category Wise", item: "Item Wise", monthly: "Monthly", comparative: "Comparative",
};
export const STATUSES = ["DRAFT", "SENT", "PARTIAL", "COMPLETED", "CANCELLED", "OVERDUE"] as const;
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SENT: "Pending (Sent)", PARTIAL: "Partially Received", COMPLETED: "Completed", CANCELLED: "Cancelled", OVERDUE: "Overdue",
};
