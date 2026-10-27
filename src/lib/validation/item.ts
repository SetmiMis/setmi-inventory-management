import { z } from "zod";

// Empty text boxes arrive as "" from HTML forms; treat them as "not provided".
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

// Server-side rules for an item (never trust the browser). They mirror database constraints;
// the database stays the final judge (unique codes, non-blank, max 6 images).
export const itemSchema = z.object({
  // 120, not 64: the owner's real codes are "SETMI-" + the full item name and reach about 85 characters.
  internalItemCode: z.string().trim().min(1, "Internal Item Code is required.").max(120, "Internal Item Code is too long (max 120)."),
  importItemCode: z.preprocess(blankToNull, z.string().trim().max(64, "Import Item Code is too long.").nullable()),
  itemName: z.string().trim().min(1, "Item Name is required.").max(200, "Item Name is too long."),
  // May be blank on create: the action then uses Item Name (owner decision D-008).
  sellingItemName: z.string().trim().max(200, "Selling Item Name is too long."),
  categoryId: z.preprocess(blankToNull, z.uuid("Invalid category.").nullable()),
  purchaseSource: z.enum(["LOCAL", "IMPORT"], "Purchase Source must be LOCAL or IMPORT."),
  // A code from the units table (PCS, MTR ...). Upper-cased here; the database checks it exists.
  unit: z.string().trim().min(1, "Unit is required.").max(10, "Unit is too long.").regex(/^[A-Za-z0-9]+$/, "Unit is not valid.").transform((s) => s.toUpperCase()),
  remarks: z.preprocess(blankToNull, z.string().trim().max(2000, "Remarks are too long.").nullable()),
  // Rupees, up to 2 decimals. Optional: an item without a price cannot be billed yet.
  sellingPrice: z.preprocess(blankToNull, z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Selling price: digits with up to 2 decimals.").nullish()),
  // Reorder planning (optional, same meaning as the shop sheet): days from ordering to receiving,
  // a safety factor (1 to 10, empty = 1.5 in the calculation) and the minimum order quantity.
  leadTimeDays: z.preprocess(blankToNull, z.string().trim().regex(/^\d{1,4}$/, "Lead time: whole days.").refine((s) => Number(s) <= 3650, "Lead time: at most 3650 days.").nullish()),
  safetyFactor: z.preprocess(blankToNull, z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Safety factor: a number like 1.5.").refine((s) => Number(s) >= 1 && Number(s) <= 10, "Safety factor: between 1 and 10.").nullish()),
  moq: z.preprocess(blankToNull, z.string().trim().regex(/^\d{1,8}(\.\d{1,3})?$/, "MOQ: a number with up to 3 decimals.").refine((s) => Number(s) > 0, "MOQ: more than 0.").nullish()),
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
    sellingPrice: fd.get("sellingPrice"),
    leadTimeDays: fd.get("leadTimeDays"),
    safetyFactor: fd.get("safetyFactor"),
    moq: fd.get("moq"),
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

// ---------- Add Product page: extra optional fields (migration 56) ----------
const optText = (max: number, label: string) => z.preprocess(blankToNull, z.string().trim().max(max, `${label} is too long (max ${max}).`).nullable());
const optNum = (label: string) => z.preprocess(blankToNull, z.string().trim().regex(/^\d{1,8}(\.\d{1,3})?$/, `${label}: a number with up to 3 decimals.`).nullable());

export const WEIGHT_UNITS = ["g", "kg"] as const;
export const DIM_UNITS = ["mm", "cm", "m", "in"] as const;
const optEnum = <T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.preprocess(blankToNull, z.enum(values, `${label}: choose from the list.`).nullable());

export const productExtrasSchema = z.object({
  subCategory: optText(100, "Sub Category"),
  brand: optText(100, "Brand"),
  hsnCode: z.preprocess(blankToNull, z.string().trim().regex(/^[0-9]{2,20}$/, "HSN Code: digits only (2 to 20).").nullable()),
  shortDescription: optText(500, "Short Description"),
  detailedDescription: optText(2000, "Detailed Description"),
  productType: optText(100, "Product Type"),
  material: optText(100, "Material"),
  color: optText(100, "Color"),
  netWeight: optNum("Net Weight"),
  weightUnit: optEnum(WEIGHT_UNITS, "Weight unit"),
  dimL: optNum("Length"),
  dimW: optNum("Width"),
  dimH: optNum("Height"),
  dimUnit: optEnum(DIM_UNITS, "Dimension unit"),
  countryOfOrigin: optText(100, "Country of Origin"),
  modelNo: optText(100, "Model / Part No."),
  searchKeywords: optText(500, "Search Keywords"),
  shelfLife: optText(100, "Shelf Life / Warranty"),
});

export function productExtrasFromForm(fd: FormData) {
  const g = (k: string) => fd.get(k);
  return productExtrasSchema.safeParse({
    subCategory: g("subCategory"), brand: g("brand"), hsnCode: g("hsnCode"), shortDescription: g("shortDescription"),
    detailedDescription: g("detailedDescription"), productType: g("productType"), material: g("material"), color: g("color"),
    netWeight: g("netWeight"), weightUnit: g("weightUnit"), dimL: g("dimL"), dimW: g("dimW"), dimH: g("dimH"), dimUnit: g("dimUnit"),
    countryOfOrigin: g("countryOfOrigin"), modelNo: g("modelNo"), searchKeywords: g("searchKeywords"), shelfLife: g("shelfLife"),
  });
}

// Tags: up to 20, each up to 30 letters, no duplicates (ignoring capitals).
export function parseTags(values: FormDataEntryValue[]): { tags: string[]; error?: string } {
  const out: string[] = [];
  for (const v of values) {
    const t = String(v).trim();
    if (!t) continue;
    if (t.length > 30) return { tags: [], error: "A tag is longer than 30 letters." };
    if (!out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > 20) return { tags: [], error: "At most 20 tags." };
  return { tags: out };
}
