"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeSearch } from "@/lib/validation/item";

export type ReceiptItem = { id: string; code: string; name: string; unit: string; decimals: number };
export type Problem = { code: string; message: string };

const scanCodeSchema = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/);

async function decimalsOf(unit: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("decimals").eq("code", unit).maybeSingle();
  return data?.decimals ?? 0;
}

// Scan: exact barcode match. An unknown barcode creates nothing.
export async function lookupReceiptItem(input: { code: string }): Promise<{ ok: true; item: ReceiptItem } | { ok: false; message: string }> {
  await requirePermission("receipts.create");
  const code = scanCodeSchema.safeParse(input?.code);
  if (!code.success) return { ok: false, message: "That does not look like a barcode." };
  const supabase = await createClient();
  const { data: bc } = await supabase.from("item_barcodes").select("item_id").eq("barcode", code.data).maybeSingle();
  if (!bc) return { ok: false, message: `Unknown barcode ${code.data}` };
  const { data: it } = await supabase.from("items").select("id, internal_item_code, item_name, unit, is_active").eq("id", bc.item_id).maybeSingle();
  if (!it) return { ok: false, message: "You cannot see this item." };
  if (!it.is_active) return { ok: false, message: `${it.internal_item_code} is archived` };
  return { ok: true, item: { id: it.id, code: it.internal_item_code, name: it.item_name, unit: it.unit, decimals: await decimalsOf(it.unit) } };
}

// For items that have no barcode yet: search by code or name.
export async function searchReceiptItems(input: { q: string }): Promise<ReceiptItem[]> {
  await requirePermission("receipts.create");
  const q = sanitizeSearch(String(input?.q ?? ""));
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const supabase = await createClient();
  const [{ data }, { data: units }] = await Promise.all([
    supabase.from("items").select("id, internal_item_code, item_name, unit")
      .eq("is_active", true).or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like}`)
      .order("internal_item_code").limit(10),
    supabase.from("units").select("code, decimals"),
  ]);
  const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
  return (data ?? []).map((i) => ({ id: i.id, code: i.internal_item_code, name: i.item_name, unit: i.unit, decimals: dec.get(i.unit) ?? 0 }));
}

const saveSchema = z.object({
  id: z.uuid().nullable(),
  supplierId: z.uuid(),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purchaseOrderId: z.uuid().nullable().optional(),
  invoiceNo: z.string().trim().max(60),
  notes: z.string().trim().max(1000),
  lines: z.array(z.object({
    itemId: z.uuid(),
    quantity: z.number().gt(0).max(99999999),
    unitCost: z.number().min(0).max(999999999).nullable(),
  })).min(1, "Add at least one item.").max(500),
});

export type SaveReceiptResult =
  | { ok: true; id: string; receiptNo: string }
  | { ok: false; message: string; problems?: Problem[] };

// Saves a DRAFT (no stock change). A new receipt goes to the user's current working location,
// chosen on the server; an existing draft keeps the location it already has.
export async function saveReceipt(input: unknown): Promise<SaveReceiptResult> {
  const user = await requirePermission("receipts.create");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const supabase = await createClient();

  let locationId: string;
  if (v.id) {
    const { data: r } = await supabase.from("goods_receipts").select("location_id").eq("id", v.id).maybeSingle();
    if (!r) return { ok: false, message: "Receipt not found." };
    locationId = r.location_id;
  } else {
    const loc = await getCurrentLocation(user);
    if (!loc) return { ok: false, message: "You are not assigned to a warehouse or shop." };
    locationId = loc.id;
  }

  const { data, error } = await supabase.rpc("save_goods_receipt", {
    p_id: v.id,
    p_header: { supplier_id: v.supplierId, location_id: locationId, receipt_date: v.receiptDate, supplier_invoice_no: v.invoiceNo, notes: v.notes, purchase_order_id: v.purchaseOrderId ?? null },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit_cost: l.unitCost })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; id?: string; receipt_no?: string; errors?: { code?: string; message: string }[] };
  if (!d.ok || !d.id) {
    return { ok: false, message: "The receipt was not saved because some lines have problems.", problems: (d.errors ?? []).map((e) => ({ code: e.code ?? "?", message: e.message })) };
  }
  revalidatePath("/receipts");
  revalidatePath(`/receipts/${d.id}`);
  return { ok: true, id: d.id, receiptNo: d.receipt_no ?? "" };
}

export type ReceiptActionResult = { ok: true; message: string } | { ok: false; message: string };

// This is the moment stock goes up. The database function locks the receipt, so a double click
// or two people posting at once cannot add the stock twice.
export async function postReceipt(input: { id: string }): Promise<ReceiptActionResult> {
  await requirePermission("receipts.post");
  const id = z.uuid().safeParse(input?.id);
  if (!id.success) return { ok: false, message: "Invalid receipt." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_goods_receipt", { p_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { receipt_no: string; lines: number };
  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id.data}`);
  revalidatePath("/stock");
  return { ok: true, message: `${d.receipt_no} posted: stock added for ${d.lines} item${d.lines === 1 ? "" : "s"}.` };
}

export async function cancelReceipt(input: { id: string }): Promise<ReceiptActionResult> {
  await requirePermission("receipts.create");
  const id = z.uuid().safeParse(input?.id);
  if (!id.success) return { ok: false, message: "Invalid receipt." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_goods_receipt", { p_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/receipts");
  revalidatePath(`/receipts/${id.data}`);
  return { ok: true, message: `${(data as { receipt_no: string }).receipt_no} cancelled.` };
}
