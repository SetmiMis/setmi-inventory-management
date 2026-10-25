// Reading typed money. Rupees with up to 2 decimals, no minus, no comma, no exponent.
// The database re-checks everything (price present, discount not above the bill, whole bill total).
const MONEY = /^\d{1,8}(\.\d{1,2})?$/;

export function parseMoney(text: string): number | null {
  const t = text.trim();
  return MONEY.test(t) ? Number(t) : null;
}

export const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "OTHER", label: "Other" },
] as const;

// Rounded the same way as the database: each line to 2 decimals, then added.
export function lineTotal(quantity: number, price: number): number {
  return Math.round((quantity * price + Number.EPSILON) * 100) / 100;
}
