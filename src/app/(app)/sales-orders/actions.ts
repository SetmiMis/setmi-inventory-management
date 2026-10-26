"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { CHANNELS } from "@/lib/validation/sales-order";
import { sanitizeSearch } from "@/lib/validation/item";

export type SalesItem = { id: string; code: string; name: string; unit: string; decimals: number; price: number; available: number };
export type SaveOrderResult = { ok: true; id: string; orderNo: string } | { ok: false; message: string };

// Search products to put on an order: code or name, with the selling price and how much is in the place the person works in.
export async function searchSalesItems(input: { q: string }): Promise<SalesItem[]> {
  const user = await requirePermission("sales_orders.create");
  const q = sanitizeSearch(String(input?.q ?? ""));
  if (q.length < 2) return [];
  const loc = await getCurrentLocation(user);
  const like = `%${q}%`;
  const supabase = await createClient();
  const [{ data }, { data: units }] = await Promise.all([
    supabase.from("items").select("id, internal_item_code, item_name, unit, selling_price")
      .eq("is_active", true).or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like}`).order("internal_item_code").limit(10),
    supabase.from("units").select("code, decimals"),
  ]);
  const ids = (data ?? []).map((i) => i.id);
  const { data: bal } = loc && ids.length ? await supabase.from("stock_balances").select("item_id, quantity").eq("location_id", loc.id).in("item_id", ids) : { data: [] };
  const have = new Map((bal ?? []).map((b) => [b.item_id as string, Number(b.quantity)]));
  const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
  return (data ?? []).map((i) => ({ id: i.id, code: i.internal_item_code, name: i.item_name, unit: i.unit, decimals: dec.get(i.unit) ?? 0, price: Number(i.selling_price ?? 0), available: have.get(i.id) ?? 0 }));
}

const orderSchema = z.object({
  id: z.uuid().nullable(),
  customerId: z.uuid("Choose a customer."),
  channel: z.enum(CHANNELS, "Choose the sales channel."),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the order date."),
  expectedDispatch: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  shippingAddress: z.string().trim().max(500, "The shipping address is too long (max 500)."),
  remarks: z.string().trim().max(500, "Remarks are too long (max 500)."),
  discount: z.number().min(0, "Discount cannot be negative.").max(99_999_999),
  shippingCharges: z.number().min(0, "Shipping charges cannot be negative.").max(99_999_999),
  lines: z.array(z.object({ itemId: z.uuid(), quantity: z.number().gt(0, "Quantity must be more than 0.").max(99_999_999), rate: z.number().min(0, "Rate cannot be negative.").max(99_999_999) })).min(1, "Add at least one item.").max(200),
});

// Make or change an order that waits for confirmation. The place is the one the person works in. No stock is touched.
export async function saveSalesOrder(input: unknown): Promise<SaveOrderResult> {
  const user = await requirePermission("sales_orders.create");
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const loc = await getCurrentLocation(user);
  if (!loc) return { ok: false, message: "You are not assigned to a warehouse or shop." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_sales_order", {
    p_id: v.id,
    p_header: {
      customer_id: v.customerId, location_id: loc.id, channel: v.channel, order_date: v.orderDate, expected_dispatch: v.expectedDispatch || null,
      shipping_address: v.shippingAddress || null, remarks: v.remarks || null, discount: v.discount, shipping_charges: v.shippingCharges,
    },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, rate: l.rate })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/sales-orders");
  const d = data as { id: string; order_no: string };
  return { ok: true, id: d.id, orderNo: d.order_no };
}

export type DecisionState = { ok: boolean; message: string } | null;

// Confirm (needs sales_orders.confirm) or cancel (needs create or confirm) an order. The database checks again.
export async function decideSalesOrder(_prev: DecisionState, fd: FormData): Promise<DecisionState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const decision = z.enum(["confirm", "cancel"]).safeParse(fd.get("decision"));
  if (!id.success || !decision.success) return { ok: false, message: "Invalid form data." };
  await requirePermission(decision.data === "confirm" ? "sales_orders.confirm" : "sales_orders.create");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);
  const supabase = await createClient();
  const { error } = decision.data === "confirm" ? await supabase.rpc("confirm_sales_order", { p_id: id.data })
    : await supabase.rpc("cancel_sales_order", { p_id: id.data, p_note: note || null });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/sales-orders");
  redirect(`/sales-orders?sel=${id.data}&p=details`);
}
