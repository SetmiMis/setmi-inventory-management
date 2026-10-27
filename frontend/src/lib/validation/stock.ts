// Reading a typed quantity. Strict on purpose: stock numbers must never be guessed.
// Digits with an optional dot and up to 3 decimals. No minus sign, no comma, no exponent ("1e5").
// The database re-checks the decimals allowed by the item's unit (pieces: none, metres: 3).
const QUANTITY = /^\d{1,8}(\.\d{1,3})?$/;

export function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!QUANTITY.test(t)) return null;
  return Number(t);
}

export const COUNT_MAX_ROWS = 500;

export const MOVEMENT_LABELS: Record<string, string> = {
  OPENING: "Opening stock",
  ADJUSTMENT: "Count / correction",
  RECEIPT: "Received",
  SALE: "Sold",
  TRANSFER: "Transfer",
  TRANSFER_SHORTAGE: "Lost in transit",
  SALE_RETURN: "Bill voided (back to stock)",
  STOCK_OUT: "Stock out",
  STOCK_IN: "Stock in",
};
