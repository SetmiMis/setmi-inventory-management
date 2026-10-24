import { z } from "zod";

// Empty text boxes arrive as "" from HTML forms; treat them as "not provided".
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

// Server-side rules for an item (never trust the browser). They mirror database constraints;
// the database stays the final judge (unique codes, non-blank, max 4 images).
export const itemSchema = z.object({
  // 120, not 64: the owner's real codes are "SETMI-" + the full item name and reach about 85 characters.
  internalItemCode: z.string().trim().min(1, "Internal Item Code is required.").max(120, "Internal Item Code is too long (max 120)."),
  importItemCode: z.preprocess(blankToNull, z.string().trim().max(64, "Import Item Code is too long.").nullable()),
  itemName: z.string().trim().min(1, "Item Name is required.").max(200, "Item Name is too long."),
  // May be blank on create: the action then uses Item Name (owner decision D-008).
  sellingItemName: z.string().trim().max(200, "Selling Item Name is too long."),
  categoryId: z.preprocess(blankToNull, z.uuid("Invalid category.").nullable()),
  purchaseSource: z.enum(["LOCAL", "IMPORT"], "Purchase Source must be LOCAL or IMPORT."),
  unit: z.string().trim().min(1, "Unit is required.").max(20, "Unit is too long."),
  remarks: z.preprocess(blankToNull, z.string().trim().max(2000, "Remarks are too long.").nullable()),
});

export function itemFromForm(fd: FormData) {
  return itemSchema.safeParse({
    internalItemCode: fd.get("internalItemCode"),
    importItemCode: fd.get("importItemCode"),
    itemName: fd.get("itemName"),
    sellingItemName: fd.get("sellingItemName") ?? "",
    categoryId: fd.get("categoryId"),
    purchaseSource: fd.get("purchaseSource"),
    unit: fd.get("unit"),
    remarks: fd.get("remarks"),
  });
}

const MAX_BARCODES = 20;
const MAX_BARCODE_LEN = 64;

// One barcode per line. Exact text is kept (scanners send exact strings), only trimmed.
export function parseBarcodes(raw: string): { barcodes: string[]; error?: string } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const unique = [...new Set(lines)];
  if (unique.length > MAX_BARCODES) return { barcodes: [], error: `At most ${MAX_BARCODES} barcodes per item.` };
  if (unique.some((b) => b.length > MAX_BARCODE_LEN)) {
    return { barcodes: [], error: `A barcode is longer than ${MAX_BARCODE_LEN} characters.` };
  }
  return { barcodes: unique };
}

// Search text goes into a PostgREST filter string, where , ( ) " \ % * have special meaning.
export function sanitizeSearch(raw: string | undefined): string {
  return (raw ?? "").replace(/[,()"\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
}
