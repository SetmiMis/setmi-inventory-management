"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeSearch } from "@/lib/validation/item";

export type BillItem = {
  id: string; code: string; name: string; unit: string; decimals: number; price: number | null; available: number | null;
};
export type Problem = { code: string; message: string };

const scanCodeSchema = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/);
const OFF = "Billing is switched off.";

async function decorate(rows: { id: string; internal_item_code: string; selling_item_name: string; unit: string; selling_price: number | null }[], locationId: string): Promise<BillItem[]> {
  const supabase = await createClient();
  const [{ data: units }, { data: bal }] = await Promise.all([
    supabase.from("units").select("code, decimals"),
    rows.length ? supabase.from("stock_balances").select("item_id, quantity").eq("location_id", locationId).in("item_id", rows.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ]);
  const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
  const have = new Map((bal ?? []).map((b) => [b.item_id as string, Number(b.quantity)]));
  return rows.map((r) => ({
    id: r.id, code: r.internal_item_code, name: r.selling_item_name, unit: r.unit, decimals: dec.get(r.unit) ?? 0,
    price: r.selling_price === null ? null : Number(r.selling_price),
    // Stock is only visible to people with stock.view; others see "?" and the database still refuses an oversell.
    available: have.has(r.id) ? (have.get(r.id) as number) : null,
  }));
}

// Scan: exact barcode match. The name shown is the one that will print on the bill.
export async function lookupBillItem(input: { code: string }): Promise<{ ok: true; item: BillItem } | { ok: false; message: string }> {
  const user = await requirePermission("bills.create");
  if (!(await isBillingEnabled())) return { ok: false, message: OFF };
  const loc = await getCurrentLocation(user);
  if (!loc) return { ok: false, message: "You are not assigned to a shop." };
  const code = scanCodeSchema.safeParse(input?.code);
  if (!code.success) return { ok: false, message: "That does not look like a barcode." };
  const supabase = await createClient();
  const { data: bc } = await supabase.from("item_barcodes").select("item_id").eq("barcode", code.data).maybeSingle();
  if (!bc) return { ok: false, message: `Unknown barcode ${code.data}` };
  const { data: it } = await supabase.from("items").select("id, internal_item_code, selling_item_name, unit, selling_price, is_active").eq("id", bc.item_id).maybeSingle();
  if (!it) return { ok: false, message: "You cannot see this item." };
  if (!it.is_active) return { ok: false, message: `${it.internal_item_code} is archived` };
  return { ok: true, item: (await decorate([it], loc.id))[0] };
}

export async function searchBillItems(input: { q: string }): Promise<BillItem[]> {
  const user = await requirePermission("bills.create");
  if (!(await isBillingEnabled())) return [];
  const loc = await getCurrentLocation(user);
  const q = sanitizeSearch(String(input?.q ?? ""));
  if (!loc || q.length < 2) return [];
  const like = `%${q}%`;
  const supabase = await createClient();
  const { data } = await supabase.from("items").select("id, internal_item_code, selling_item_name, unit, selling_price")
    .eq("is_active", true).or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like}`)
    .order("internal_item_code").limit(10);
  return decorate(data ?? [], loc.id);
}

const billSchema = z.object({
  paymentMode: z.enum(["CASH", "UPI", "CARD", "OTHER"]),
  customerName: z.string().trim().max(100),
  customerPhone: z.string().trim().max(30),
  discount: z.number().min(0).max(99999999),
  lines: z.array(z.object({
    itemId: z.uuid(),
    quantity: z.number().gt(0).max(99999999),
    // only sent when the price differs from the list price; the database refuses it without the override right
    unitPrice: z.number().min(0).max(99999999).nullable(),
  })).min(1, "Add at least one item.").max(200),
});

export type CreateBillResult = { ok: true; id: string; billNo: string; total: number } | { ok: false; message: string; problems?: Problem[] };

// One call, all or nothing: the bill, its lines and the stock reduction happen together or not at all.
// The shop is always the user's current working location chosen on the server.
export async function createBill(input: unknown): Promise<CreateBillResult> {
  const user = await requirePermission("bills.create");
  if (!(await isBillingEnabled())) return { ok: false, message: OFF };
  const loc = await getCurrentLocation(user);
  if (!loc) return { ok: false, message: "You are not assigned to a shop." };
  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid bill." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_bill", {
    p_header: { location_id: loc.id, payment_mode: v.paymentMode, customer_name: v.customerName, customer_phone: v.customerPhone, discount: String(v.discount) },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit_price: l.unitPrice })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; id?: string; bill_no?: string; total?: number; errors?: { code?: string; message: string }[] };
  if (!d.ok || !d.id) {
    return { ok: false, message: "The bill was not made because some lines have problems.", problems: (d.errors ?? []).map((e) => ({ code: e.code ?? "?", message: e.message })) };
  }
  revalidatePath("/bills");
  revalidatePath("/stock");
  return { ok: true, id: d.id, billNo: d.bill_no ?? "", total: Number(d.total) };
}

export async function voidBill(input: { id: string; reason: string }): Promise<{ ok: boolean; message: string }> {
  await requirePermission("bills.void");
  const p = z.object({ id: z.uuid(), reason: z.string().trim().min(3, "Write a reason (at least 3 letters).").max(300) }).safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Invalid data." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_bill", { p_id: p.data.id, p_reason: p.data.reason });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/bills");
  revalidatePath(`/bills/${p.data.id}`);
  revalidatePath("/stock");
  return { ok: true, message: `${(data as { bill_no: string }).bill_no} voided: the goods are back in stock.` };
}
