import type { Request, Response } from "express";
import { z } from "zod";
import { authed, can } from "../../middleware/auth.middleware.js";
import { friendlyDbError, statusForDbError } from "../../utils/db-errors.js";
import { idParam, productBody, sanitizeSearch } from "../../validation/item.js";

const SORTS = ["code", "name", "category", "qty", "price", "status"] as const;
const STATUSES = ["all", "in", "low", "out", "inactive"] as const;

const listQuery = z.object({
  q: z.string().optional(),
  category: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
  source: z.enum(["", "LOCAL", "IMPORT"]).optional(),
  status: z.enum(STATUSES).optional(),
  sort: z.enum(SORTS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  size: z.coerce.number().int().min(1).max(100).default(10),
});

const bad = (res: Response, message: string) => res.status(400).json({ error: message });

// GET /api/items : one page of products with the numbers for the cards (the database function does the work).
export async function listItems(req: Request, res: Response) {
  const { db } = authed(res);
  const q = listQuery.safeParse(req.query);
  if (!q.success) return bad(res, q.error.issues[0]?.message ?? "Invalid request.");
  const v = q.data;
  const args: Record<string, unknown> = {
    p_q: sanitizeSearch(v.q) || null,
    p_category: v.category ?? null,
    p_source: v.source || null,
    p_status: !v.status || v.status === "all" ? null : v.status,
    p_limit: v.size,
    p_offset: (v.page - 1) * v.size,
  };
  // Only sent when a column is chosen, so the plain list works on a database without the sort migration (58).
  if (v.sort && (v.sort !== "code" || v.dir === "desc")) { args.p_sort = v.sort; args.p_dir = v.dir ?? "asc"; }
  const { data, error } = await db.rpc("items_page", args);
  if (error) return res.status(statusForDbError(error)).json({ error: friendlyDbError(error) });
  return res.json({ data });
}

// GET /api/items/:id : one product with its barcodes and category name.
export async function getItem(req: Request, res: Response) {
  const { db } = authed(res);
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return bad(res, "Invalid id.");
  const { data, error } = await db.from("items").select("*, categories(name), item_barcodes(id, barcode, is_generated)").eq("id", id.data).maybeSingle();
  if (error) return res.status(statusForDbError(error)).json({ error: friendlyDbError(error) });
  if (!data) return res.status(404).json({ error: "Product not found." });
  return res.json({ data });
}

// POST /api/items : create a product (also "Save as Draft": draft=true saves it switched off).
export async function createItem(req: Request, res: Response) {
  const { db, user } = authed(res);
  const p = productBody.safeParse(req.body);
  if (!p.success) return bad(res, p.error.issues[0]?.message ?? "Invalid request.");
  const v = p.data;
  if (!v.draft && !v.categoryId) return bad(res, "Category is required.");
  if ((v.netWeight && !v.weightUnit) || ((v.dimL || v.dimW || v.dimH) && !v.dimUnit)) return bad(res, "Choose the unit for the weight / size.");

  const { data, error } = await db.from("items").insert({
    internal_item_code: v.internalItemCode,
    import_item_code: v.importItemCode ?? null,
    item_name: v.itemName,
    selling_item_name: v.sellingItemName || v.itemName, // owner decision D-008: never empty
    category_id: v.categoryId ?? null,
    purchase_source: v.purchaseSource,
    unit: v.unit,
    remarks: v.remarks ?? null,
    // Only people with items.edit_price may set a price (the database enforces it for updates).
    selling_price: v.sellingPrice && can(user, "items.edit_price") ? Number(v.sellingPrice) : null,
    lead_time_days: v.leadTimeDays ? Number(v.leadTimeDays) : null,
    safety_factor: v.safetyFactor ? Number(v.safetyFactor) : null,
    moq: v.moq ? Number(v.moq) : null,
    sub_category: v.subCategory ?? null, brand: v.brand ?? null, hsn_code: v.hsnCode ?? null,
    short_description: v.shortDescription ?? null, detailed_description: v.detailedDescription ?? null,
    product_type: v.productType ?? null, material: v.material ?? null, color: v.color ?? null,
    net_weight: v.netWeight ? Number(v.netWeight) : null, weight_unit: v.netWeight ? v.weightUnit : null,
    dim_l: v.dimL ? Number(v.dimL) : null, dim_w: v.dimW ? Number(v.dimW) : null, dim_h: v.dimH ? Number(v.dimH) : null,
    dim_unit: v.dimL || v.dimW || v.dimH ? v.dimUnit : null,
    country_of_origin: v.countryOfOrigin ?? null, model_no: v.modelNo ?? null,
    tags: [...new Set(v.tags)], search_keywords: v.searchKeywords ?? null, shelf_life: v.shelfLife ?? null,
    is_active: !v.draft && v.isActive,
    show_in_sales: v.showInSales, show_in_purchase: v.showInPurchase, low_stock_alert: v.lowStockAlert,
  }).select("id").single();
  if (error) return res.status(statusForDbError(error)).json({ error: friendlyDbError(error) });

  // The product is saved; barcodes are separate calls, so a failure here is reported as a warning, not an error.
  const warnings: string[] = [];
  const codes = [...new Set(v.barcodes)];
  if (codes.length > 0) {
    const { error: bcError } = await db.from("item_barcodes").insert(codes.map((barcode) => ({ item_id: data.id, barcode })));
    if (bcError) warnings.push("The product was saved, but the barcode was not (maybe it is already used). Add it again on the product page.");
  }
  if (v.generateBarcode) {
    const { error: genError } = await db.rpc("generate_item_barcode", { p_item: data.id });
    if (genError) warnings.push("The product was saved, but the SETMI barcode was not made. Make it on the product page.");
  }
  return res.status(201).json({ data: { id: data.id }, warnings });
}

const bulkBody = z.object({
  op: z.enum(["archive", "restore", "category"]),
  ids: z.array(z.uuid()).min(1, "Choose at least one product.").max(100, "At most 100 products at a time."),
  categoryId: z.uuid("Choose the new category.").optional(),
});

// POST /api/items/bulk : archive, restore or change the category of up to 100 products.
export async function bulkItems(req: Request, res: Response) {
  const { db, user } = authed(res);
  const b = bulkBody.safeParse(req.body);
  if (!b.success) return bad(res, b.error.issues[0]?.message ?? "Invalid request.");
  const { op, ids, categoryId } = b.data;
  let patch: Record<string, unknown>;
  if (op === "category") {
    if (!can(user, "items.edit")) return res.status(403).json({ error: "You do not have permission to edit products." });
    if (!categoryId) return bad(res, "Choose the new category.");
    patch = { category_id: categoryId };
  } else {
    if (!can(user, "items.archive")) return res.status(403).json({ error: "You do not have permission to archive products." });
    patch = { is_active: op === "restore" };
  }
  const { data, error } = await db.from("items").update(patch).in("id", [...new Set(ids)]).select("id");
  if (error) return res.status(statusForDbError(error)).json({ error: friendlyDbError(error) });
  return res.json({ data: { changed: data?.length ?? 0, asked: new Set(ids).size } });
}

// GET /api/items/suggest-sku?categoryId=... : a free code (first letters of the category + next number).
export async function suggestSku(req: Request, res: Response) {
  const { db } = authed(res);
  const id = idParam.safeParse(req.query.categoryId);
  if (!id.success) return bad(res, "Choose a category first.");
  const { data: cat } = await db.from("categories").select("name").eq("id", id.data).maybeSingle();
  if (!cat) return res.status(404).json({ error: "Category not found." });
  const letters = String(cat.name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "SKU";
  const prefix = `${letters}-`;
  const { data: rows } = await db.from("items").select("internal_item_code").ilike("internal_item_code", `${prefix}%`).limit(2000);
  let max = 0;
  for (const r of rows ?? []) {
    const m = /^.*-(\d{1,6})$/.exec(String(r.internal_item_code));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return res.json({ data: { sku: `${prefix}${String(max + 1).padStart(4, "0")}` } });
}
