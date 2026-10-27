"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { PACKING_TYPES, PRIORITIES } from "@/lib/validation/picking";

export type PickState = { ok: boolean; message: string } | null;
const fail = (message: string): PickState => ({ ok: false, message });

// Start picking a confirmed order (form button). The order becomes "In Packing" in Sales Orders; stock is not touched.
export async function startPickingAction(_prev: PickState, fd: FormData): Promise<PickState> {
  await requirePermission("picking.manage");
  const id = z.uuid("Choose an order.").safeParse(fd.get("orderId"));
  if (!id.success) return fail(id.error.issues[0].message);
  const priority = z.enum(PRIORITIES).safeParse(fd.get("priority") ?? "MEDIUM");
  if (!priority.success) return fail("Choose a priority.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_picking", { p_order_id: id.data, p_priority: priority.data });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/picking");
  revalidatePath("/sales-orders");
  redirect(`/picking?sel=${id.data}&p=work`);
}

export type ScanResult = { ok: true; message: string } | { ok: false; message: string };

// Scan a barcode (or type a SKU): one more piece of that item is counted as picked.
export async function scanPick(input: { jobId: string; code: string }): Promise<ScanResult> {
  await requirePermission("picking.manage");
  const jobId = z.uuid().safeParse(input?.jobId);
  const code = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/).safeParse(input?.code);
  if (!jobId.success || !code.success) return { ok: false, message: "That does not look like a barcode or SKU." };
  const supabase = await createClient();
  const { data: bc } = await supabase.from("item_barcodes").select("item_id").eq("barcode", code.data).maybeSingle();
  let itemId = bc?.item_id as string | undefined;
  if (!itemId) {
    const { data: it } = await supabase.from("items").select("id").eq("internal_item_code", code.data).maybeSingle();
    itemId = it?.id;
  }
  if (!itemId) return { ok: false, message: `Unknown barcode or SKU ${code.data}` };
  const { data: line } = await supabase.from("pick_pack_lines").select("picked, required, items(internal_item_code)").eq("job_id", jobId.data).eq("item_id", itemId).maybeSingle();
  if (!line) return { ok: false, message: `${code.data} is not on this order.` };
  const { error } = await supabase.rpc("set_pick_quantity", { p_job_id: jobId.data, p_item_id: itemId, p_qty: Number(line.picked) + 1 });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/picking");
  return { ok: true, message: `${(line.items as unknown as { internal_item_code: string } | null)?.internal_item_code ?? code.data}: ${Number(line.picked) + 1} of ${Number(line.required)}` };
}

// Type the picked quantity of one item (for metre / kg items, or to correct a scan).
export async function setPickQuantity(input: { jobId: string; itemId: string; qty: number }): Promise<ScanResult> {
  await requirePermission("picking.manage");
  const p = z.object({ jobId: z.uuid(), itemId: z.uuid(), qty: z.number().min(0).max(99_999_999) }).safeParse(input);
  if (!p.success) return { ok: false, message: "That quantity is not valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pick_quantity", { p_job_id: p.data.jobId, p_item_id: p.data.itemId, p_qty: p.data.qty });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/picking");
  return { ok: true, message: "Saved." };
}

const packSchema = z.object({
  jobId: z.uuid(),
  packingType: z.enum(PACKING_TYPES, "Choose the packing type."),
  boxNo: z.string().trim().min(1, "Enter the box / packet number.").max(40, "The box number is too long (max 40)."),
  weight: z.number().min(0, "Weight cannot be negative.").max(100000).nullable(),
  l: z.number().min(0).max(10000).nullable(), w: z.number().min(0).max(10000).nullable(), h: z.number().min(0).max(10000).nullable(),
  remarks: z.string().trim().max(300, "Remarks are too long (max 300)."),
});

// Mark the order as packed (everything must be picked first). The database checks that again.
export async function markPacked(input: unknown): Promise<ScanResult> {
  await requirePermission("picking.manage");
  const p = packSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Invalid data." };
  const v = p.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_packed", {
    p_job_id: v.jobId, p_header: { packing_type: v.packingType, box_no: v.boxNo, weight_kg: v.weight, dim_l: v.l, dim_w: v.w, dim_h: v.h, remarks: v.remarks || null },
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/picking");
  return { ok: true, message: "Packed. The order is ready to dispatch." };
}

// Give up before dispatch: the order goes back to "Confirmed".
export async function cancelPickingAction(_prev: PickState, fd: FormData): Promise<PickState> {
  await requirePermission("picking.manage");
  const id = z.uuid().safeParse(fd.get("jobId"));
  const orderId = z.uuid().safeParse(fd.get("orderId"));
  if (!id.success || !orderId.success) return fail("Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_picking", { p_job_id: id.data });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/picking");
  revalidatePath("/sales-orders");
  redirect(`/picking?sel=${orderId.data}&p=work`);
}
