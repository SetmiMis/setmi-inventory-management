// Words and colours for a purchase order status, used by the list and the detail page.
export const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", PARTIAL: "Partly received", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
export const PO_STATUS_TONE: Record<string, "green" | "amber" | "red" | "gray" | "brand"> = {
  DRAFT: "gray", SENT: "brand", PARTIAL: "amber", COMPLETED: "green", CANCELLED: "red",
};
