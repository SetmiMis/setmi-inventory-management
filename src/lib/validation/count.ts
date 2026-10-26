// Reasons a counted quantity can differ from the system (physical count sheet). The database accepts exactly these codes.
export const COUNT_REASONS = ["MISSING", "EXTRA", "WRONG_LOCATION", "DAMAGE_EXPIRY", "OTHER"] as const;
export const REASON_LABEL: Record<string, string> = { MISSING: "Missing Stock", EXTRA: "Extra Stock", WRONG_LOCATION: "Wrong Location", DAMAGE_EXPIRY: "Damage / Expiry", OTHER: "Others" };
