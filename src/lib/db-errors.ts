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
    if (msg.includes("categories_name_uq")) return "A category with this name already exists.";
    return "A record with the same value already exists.";
  }
  if (e.code === "42501" || msg.includes("row-level security")) {
    return "You do not have permission to do this.";
  }
  if (e.code === "23514") return "A value is not allowed (blank text or too many files).";
  if (e.code === "23503") return "This record is still used elsewhere.";
  return "Could not save. Please try again.";
}
