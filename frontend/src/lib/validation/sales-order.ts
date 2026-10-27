// Sales channels of a sales order. The database accepts exactly these codes.
export const CHANNELS = ["WEBSITE", "AMAZON", "FLIPKART", "MEESHO", "DIRECT", "OTHER"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<string, string> = { WEBSITE: "Website", AMAZON: "Amazon", FLIPKART: "Flipkart", MEESHO: "Meesho", DIRECT: "Direct", OTHER: "Other" };
// Letter and colour shown in the small round badge of a channel.
export const CHANNEL_BADGE: Record<string, { letter: string; bg: string }> = {
  WEBSITE: { letter: "W", bg: "#2fa35b" }, AMAZON: { letter: "a", bg: "#f0932b" }, FLIPKART: { letter: "F", bg: "#2874f0" },
  MEESHO: { letter: "m", bg: "#d6336c" }, DIRECT: { letter: "D", bg: "#1a73e8" }, OTHER: { letter: "?", bg: "#8a96a3" },
};
export const ORDER_STATUS_LABEL: Record<string, string> = { PENDING: "Pending", CONFIRMED: "Confirmed", IN_PACKING: "In Packing", DISPATCHED: "Dispatched", CANCELLED: "Cancelled" };
