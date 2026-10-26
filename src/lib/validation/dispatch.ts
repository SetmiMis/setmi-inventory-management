// Words and codes of dispatch. The database accepts exactly these codes.
export const SERVICE_TYPES = ["SURFACE", "AIR", "EXPRESS", "STANDARD"] as const;
export const SERVICE_LABEL: Record<string, string> = { SURFACE: "Surface", AIR: "Air", EXPRESS: "Express", STANDARD: "Standard" };
export const DISPATCH_STATUSES = ["DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED", "RTO"] as const;
export const STATUS_LABEL: Record<string, string> = {
  DISPATCHED: "Dispatched", IN_TRANSIT: "In Transit", OUT_FOR_DELIVERY: "Out for Delivery", DELIVERED: "Delivered", DELIVERY_FAILED: "Delivery Failed", RTO: "RTO",
};
// What a person can change a parcel to by hand (it starts as Dispatched).
export const CHANGEABLE_STATUSES = ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED", "RTO"] as const;
// Delivered and RTO are final.
export const FINAL_STATUSES = ["DELIVERED", "RTO"] as const;
