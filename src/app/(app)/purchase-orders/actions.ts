"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeSearch } from "@/lib/validation/item";

export type PoItem = { id: string; code: string; name: string; unit: string; decimals: number };
export type Problem = { code: string; message: string };

const scanCodeSchema = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/);

async function decimalsOf(unit: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("units").select("decimals").eq("code", unit).maybeSingle();
  return data?.decimals ?? 0;
}

// Scan: exact barcode match. An unknown barcode creates nothing.
export async function lookupPoItem(input: { code: string }): Promise<{ ok: true; item: PoItem } | { ok: false; message: string }> {
  await requirePermission("purchase.create");
  const code = scanCodeSchema.safeParse(input?.code);
  if (!code.success) return { ok: false, message: "That does not look like a barcode." };
  const supabase = await createClient();
  const { data: bc } = await supabase.from("item_barcodes").select("item_id").eq("barcode", code.data).maybeSingle();
  if (!bc) return { ok: false, message: `Unknown barcode ${code.data}` };
  const { data: it } = await supabase.from("items").select("id, internal_item_code, item_name, unit, is_active, show_in_purchase").eq("id", bc.item_id).maybeSingle();
  if (!it) return { ok: false, message: "You cannot see this item." };
  if (!it.is_active) return { ok: false, message: `${it.internal_item_code} is archived` };
  if (!it.show_in_purchase) return { ok: false, message: `${it.internal_item_code} is switched off for purchase orders` };
  return { ok: true, item: { id: it.id, code: it.internal_item_code, name: it.item_name, unit: it.unit, decimals: await decimalsOf(it.unit) } };
}

export async function searchPoItems(input: { q: string }): Promise<PoItem[]> {
  await requirePermission("purchase.create");
  const q = sanitizeSearch(String(input?.q ?? ""));
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const supabase = await createClient();
  const [{ data }, { data: units }] = await Promise.all([
    supabase.from("items").select("id, internal_item_code, item_name, unit")
      .eq("is_active", true).eq("show_in_purchase", true).or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like}`)
      .order("internal_item_code").limit(10),
    supabase.from("units").select("code, decimals"),
  ]);
  const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
  return (data ?? []).map((i) => ({ id: i.id, code: i.internal_item_code, name: i.item_name, unit: i.unit, decimals: dec.get(i.unit) ?? 0 }));
}

const dateText = z.iso.date();
const saveSchema = z.object({
  id: z.uuid().nullable(),
  supplierId: z.uuid(),
  orderDate: dateText,
  expectedDate: z.union([dateText, z.literal("")]),
  notes: z.string().trim().max(1000),
  lines: z.array(z.object({
    itemId: z.uuid(),
    quantity: z.number().gt(0).max(99999999),
    unitCost: z.number().min(0).max(999999999).nullable(),
  })).min(1, "Add at least one item.").max(500),
});

export type SavePoResult =
  | { ok: true; id: string; poNo: string }
  | { ok: false; message: string; problems?: Problem[] };

// Saves a DRAFT order. A new order goes to the user's current working place (chosen on the server);
// an existing draft keeps the place it already has.
export async function savePurchaseOrder(input: unknown): Promise<SavePoResult> {
  const user = await requirePermission("purchase.create");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const supabase = await createClient();

  let locationId: string;
  if (v.id) {
    const { data: o } = await supabase.from("purchase_orders").select("location_id").eq("id", v.id).maybeSingle();
    if (!o) return { ok: false, message: "Purchase order not found." };
    locationId = o.location_id;
  } else {
    const loc = await getCurrentLocation(user);
    if (!loc) return { ok: false, message: "You are not assigned to a warehouse or shop." };
    locationId = loc.id;
  }

  const { data, error } = await supabase.rpc("save_purchase_order", {
    p_id: v.id,
    p_header: { supplier_id: v.supplierId, location_id: locationId, order_date: v.orderDate, expected_date: v.expectedDate, notes: v.notes },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit_cost: l.unitCost })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; id?: string; po_no?: string; errors?: { code?: string; message: string }[] };
  if (!d.ok || !d.id) {
    return { ok: false, message: "The order was not saved because some lines have problems.", problems: (d.errors ?? []).map((e) => ({ code: e.code ?? "?", message: e.message })) };
  }
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${d.id}`);
  return { ok: true, id: d.id, poNo: d.po_no ?? "" };
}

export type PoActionResult = { ok: true; message: string } | { ok: false; message: string };

async function runAction(fn: "send_purchase_order" | "cancel_purchase_order", idRaw: unknown, verb: string): Promise<PoActionResult> {
  await requirePermission("purchase.approve");
  const id = z.uuid().safeParse(idRaw);
  if (!id.success) return { ok: false, message: "Invalid purchase order." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_id: id.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id.data}`);
  return { ok: true, message: `${(data as { po_no: string }).po_no} ${verb}.` };
}

export async function sendPurchaseOrder(input: { id: string }) {
  return runAction("send_purchase_order", input?.id, "sent");
}
export async function cancelPurchaseOrder(input: { id: string }) {
  return runAction("cancel_purchase_order", input?.id, "cancelled");
}

export async function closePurchaseOrder(input: { id: string; note: string }): Promise<PoActionResult> {
  await requirePermission("purchase.approve");
  const id = z.uuid().safeParse(input?.id);
  const note = z.string().trim().min(1, "Write a short reason.").max(300, "The reason is too long (max 300).").safeParse(input?.note);
  if (!id.success) return { ok: false, message: "Invalid purchase order." };
  if (!note.success) return { ok: false, message: note.error.issues[0]?.message ?? "Write a short reason." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_purchase_order", { p_id: id.data, p_note: note.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id.data}`);
  return { ok: true, message: `${(data as { po_no: string }).po_no} closed.` };
}
