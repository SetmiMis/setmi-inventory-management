// Words and codes of customer returns. The database accepts exactly these codes.
export const REASONS = ["DAMAGED", "WRONG_ITEM", "NOT_WORKING", "CHANGED_MIND", "MISSING_ITEM", "OTHER"] as const;
export const REASON_LABEL: Record<string, string> = {
  DAMAGED: "Damaged", WRONG_ITEM: "Wrong Item", NOT_WORKING: "Not Working", CHANGED_MIND: "Changed Mind", MISSING_ITEM: "Missing Item", OTHER: "Others",
};
export const STATUSES = ["PICKUP_PENDING", "IN_TRANSIT", "UNDER_INSPECTION", "APPROVED", "REJECTED"] as const;
export const STATUS_LABEL: Record<string, string> = {
  PICKUP_PENDING: "Pickup Pending", IN_TRANSIT: "In Transit", UNDER_INSPECTION: "Under Inspection", APPROVED: "Approved", REJECTED: "Rejected",
};
// A person moves a return forward by hand to one of these (approving and rejecting are separate buttons).
export const MOVABLE_STATUSES = ["IN_TRANSIT", "UNDER_INSPECTION"] as const;
export const RESOLUTIONS = ["REFUND", "REPLACEMENT"] as const;
export const RESOLUTION_LABEL: Record<string, string> = { REFUND: "Refund", REPLACEMENT: "Replacement" };
export const CONDITIONS = ["GOOD", "DAMAGED", "USED"] as const;
export const CONDITION_LABEL: Record<string, string> = { GOOD: "Good", DAMAGED: "Damaged", USED: "Used" };
