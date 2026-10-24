type DbError = { code?: string; message?: string };

// Turns a database error into a message a shop or office user can act on.
// Raw database text is never shown to users (it can reveal table and column names).
export function friendlyDbError(e: DbError): string {
  const msg = e.message ?? "";
  if (e.code === "23505") {
    if (msg.includes("items_internal_code_uq")) return "This Internal Item Code already exists.";
    if (msg.includes("items_import_code_uq")) return "This Import Item Code already exists.";
    if (msg.includes("item_barcodes_barcode_uq")) return "This barcode already belongs to an item.";
    if (msg.includes("locations_code_uq")) return "This location code already exists.";
    if (msg.includes("suppliers_name_uq")) return "A supplier with this name already exists.";
    if (msg.includes("goods_receipts_invoice_uq")) return "This supplier invoice number was already received.";
    if (msg.includes("categories_name_uq")) return "A category with this name already exists.";
    return "A record with the same value already exists.";
  }
  if (e.code === "42501" || msg.includes("row-level security")) {
    return "You do not have permission to do this.";
  }
  // Business messages that our own database functions raise on purpose (for example
  // "The receipt has no lines"). They are written for users and contain no table names.
  if (e.code === "P0001" && msg && msg.length <= 200) return msg;
  if (msg.includes("unit cannot be changed")) return "The unit cannot be changed after the item has stock history.";
  if (msg.includes("stock_balances_not_negative") || msg.includes("Not enough stock")) return "Not enough stock.";
  if (msg.includes("items_unit_fk")) return "This unit does not exist.";
  if (msg.includes("reorder_levels_max_ok")) return "Maximum cannot be lower than minimum.";
  if (e.code === "23514") return "A value is not allowed (blank text or too many files).";
  if (e.code === "23503") return "This record is still used elsewhere.";
  return "Could not save. Please try again.";
}
