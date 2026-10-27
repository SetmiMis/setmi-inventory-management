// Words and codes of picking and packing. The database accepts exactly these codes.
export const PACKING_TYPES = ["BOX", "POLYBAG", "ENVELOPE", "PALLET", "OTHER"] as const;
export const PACKING_LABEL: Record<string, string> = { BOX: "Box", POLYBAG: "Poly bag", ENVELOPE: "Envelope", PALLET: "Pallet", OTHER: "Other" };
export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const PRIORITY_LABEL: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const STAGES = ["PENDING_PICKING", "IN_PICKING", "IN_PACKING", "READY", "DISPATCHED"] as const;
export const STAGE_LABEL: Record<string, string> = {
  PENDING_PICKING: "Pending Picking", IN_PICKING: "In Picking", IN_PACKING: "In Packing", READY: "Ready to Dispatch", DISPATCHED: "Dispatched", DELAYED: "Delayed",
};
