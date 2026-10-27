// Tabs of the Sales Reports page. The database accepts exactly these tab codes.
export const TABS = ["orders", "product", "channel", "customer", "city", "monthly", "comparison"] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = {
  orders: "Sales Orders", product: "Product Wise", channel: "Channel Wise", customer: "Customer Wise", city: "City Wise", monthly: "Monthly", comparison: "Comparison",
};
