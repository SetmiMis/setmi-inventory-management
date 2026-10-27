import { z } from "zod";

// Server-side rules for a product, for JSON requests. They mirror the database constraints (the database stays the
// final judge) and the rules of the old frontend forms (frontend/src/lib/validation/item.ts).
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = (max: number, label: string) => z.preprocess(blankToNull, z.string().trim().max(max, `${label} is too long (max ${max}).`).nullish());
const optNum = (label: string) => z.preprocess((v) => (typeof v === "number" ? String(v) : blankToNull(v)), z.string().trim().regex(/^\d{1,8}(\.\d{1,3})?$/, `${label}: a number with up to 3 decimals.`).nullish());

export const productBody = z.object({
  internalItemCode: z.string().trim().min(1, "Internal Item Code is required.").max(120, "Internal Item Code is too long (max 120)."),
  importItemCode: z.preprocess(blankToNull, z.string().trim().max(64, "Import Item Code is too long.").nullish()),
  itemName: z.string().trim().min(1, "Item Name is required.").max(200, "Item Name is too long."),
  sellingItemName: z.string().trim().max(200, "Selling Item Name is too long.").default(""),
  categoryId: z.preprocess(blankToNull, z.uuid("Invalid category.").nullish()),
  purchaseSource: z.enum(["LOCAL", "IMPORT"], "Purchase Source must be LOCAL or IMPORT.").default("LOCAL"),
  unit: z.string().trim().min(1, "Unit is required.").max(10, "Unit is too long.").regex(/^[A-Za-z0-9]+$/, "Unit is not valid.").transform((s) => s.toUpperCase()).default("PCS"),
  remarks: optText(2000, "Remarks"),
  sellingPrice: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToNull(v)), z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Selling price: digits with up to 2 decimals.").nullish()),
  leadTimeDays: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToNull(v)), z.string().trim().regex(/^\d{1,4}$/, "Lead time: whole days.").refine((s) => Number(s) <= 3650, "Lead time: at most 3650 days.").nullish()),
  safetyFactor: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToNull(v)), z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "Safety factor: a number like 1.5.").refine((s) => Number(s) >= 1 && Number(s) <= 10, "Safety factor: between 1 and 10.").nullish()),
  moq: z.preprocess((v) => (typeof v === "number" ? String(v) : blankToNull(v)), z.string().trim().regex(/^\d{1,8}(\.\d{1,3})?$/, "MOQ: a number with up to 3 decimals.").refine((s) => Number(s) > 0, "MOQ: more than 0.").nullish()),
  subCategory: optText(100, "Sub Category"),
  brand: optText(100, "Brand"),
  hsnCode: z.preprocess(blankToNull, z.string().trim().regex(/^[0-9]{2,20}$/, "HSN Code: digits only (2 to 20).").nullish()),
  shortDescription: optText(500, "Short Description"),
  detailedDescription: optText(2000, "Detailed Description"),
  productType: optText(100, "Product Type"),
  material: optText(100, "Material"),
  color: optText(100, "Color"),
  netWeight: optNum("Net Weight"),
  weightUnit: z.preprocess(blankToNull, z.enum(["g", "kg"], "Weight unit: g or kg.").nullish()),
  dimL: optNum("Length"),
  dimW: optNum("Width"),
  dimH: optNum("Height"),
  dimUnit: z.preprocess(blankToNull, z.enum(["mm", "cm", "m", "in"], "Size unit: mm, cm, m or in.").nullish()),
  countryOfOrigin: optText(100, "Country of Origin"),
  modelNo: optText(100, "Model / Part No."),
  searchKeywords: optText(500, "Search Keywords"),
  shelfLife: optText(100, "Shelf Life / Warranty"),
  tags: z.array(z.string().trim().min(1).max(30, "A tag is longer than 30 letters.")).max(20, "At most 20 tags.").default([]),
  barcodes: z.array(z.string().trim().min(1).max(64, "A barcode is longer than 64 characters.")).max(20, "At most 20 barcodes per item.").default([]),
  generateBarcode: z.boolean().default(false),
  isActive: z.boolean().default(true),
  showInSales: z.boolean().default(true),
  showInPurchase: z.boolean().default(true),
  lowStockAlert: z.boolean().default(true),
  draft: z.boolean().default(false),
});

export type ProductBody = z.infer<typeof productBody>;

// Search text goes into a database filter string where , ( ) " \ % * have special meaning.
export function sanitizeSearch(raw: unknown): string {
  return String(raw ?? "").replace(/[,()"\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64);
}

export const idParam = z.uuid("Invalid id.");
