"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { CONDITIONS, MOVABLE_STATUSES, REASONS, RESOLUTIONS } from "@/lib/validation/returns";

export type ReturnState = { ok: boolean; message: string } | null;
const fail = (message: string): ReturnState => ({ ok: false, message });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = z.uuid();

function refresh() {
  revalidatePath("/returns");
  revalidatePath("/stock");
}

// Make a return. Form fields: orderId, returnDate, reason, pickupAwb, remarks, and per item: inc_<itemId> (checkbox), qty_<itemId>, cond_<itemId>.
export async function createReturnAction(_prev: ReturnState, fd: FormData): Promise<ReturnState> {
  await requirePermission("returns.manage");
  const orderId = UUID.safeParse(fd.get("orderId"));
  if (!orderId.success) return fail("Choose the original order.");
  const date = DATE.test(String(fd.get("returnDate") ?? "")) ? String(fd.get("returnDate")) : null;
  if (!date) return fail("Choose the return date.");
  const reason = z.enum(REASONS, "Choose the return reason.").safeParse(fd.get("reason"));
  if (!reason.success) return fail(reason.error.issues[0].message);
  const awb = String(fd.get("pickupAwb") ?? "").trim();
  const remarks = String(fd.get("remarks") ?? "").trim();
  if (awb.length > 60) return fail("Pickup AWB is too long (max 60).");
  if (remarks.length > 300) return fail("Remarks are too long (max 300).");

  const lines: { item_id: string; quantity: number; condition: string }[] = [];
  for (const [key] of fd.entries()) {
    if (!key.startsWith("inc_")) continue;
    const id = key.slice(4);
    if (!UUID.safeParse(id).success) return fail("Invalid form data.");
    const qty = Number(String(fd.get(`qty_${id}`) ?? ""));
    const cond = z.enum(CONDITIONS).safeParse(fd.get(`cond_${id}`));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 99_999_999) return fail("Enter a quantity more than 0 for each chosen item.");
    if (!cond.success) return fail("Choose the condition of each chosen item.");
    lines.push({ item_id: id, quantity: qty, condition: cond.data });
  }
  if (lines.length === 0) return fail("Tick at least one item that comes back.");
  if (lines.length > 200) return fail("At most 200 items per return.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_return", {
    p_order_id: orderId.data, p_header: { return_date: date, reason: reason.data, pickup_awb: awb || null, remarks: remarks || null }, p_lines: lines,
  });
  if (error) return fail(friendlyDbError(error));
  refresh();
  redirect(`/returns?sel=${(data as { id?: string } | null)?.id}&p=details`);
}

// Move a return forward by hand (In Transit, Under Inspection).
export async function setReturnStatusAction(_prev: ReturnState, fd: FormData): Promise<ReturnState> {
  await requirePermission("returns.manage");
  const id = UUID.safeParse(fd.get("returnId"));
  const status = z.enum(MOVABLE_STATUSES, "Choose a status.").safeParse(fd.get("status"));
  if (!id.success) return fail("Invalid form data.");
  if (!status.success) return fail(status.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_return_status", { p_id: id.data, p_status: status.data });
  if (error) return fail(friendlyDbError(error));
  refresh();
  return { ok: true, message: "Status saved." };
}

// Save the inspection: condition per item (cond_<itemId>), resolution, note, pickup AWB.
export async function saveInspectionAction(_prev: ReturnState, fd: FormData): Promise<ReturnState> {
  await requirePermission("returns.manage");
  const id = UUID.safeParse(fd.get("returnId"));
  if (!id.success) return fail("Invalid form data.");
  const resolution = String(fd.get("resolution") ?? "");
  if (resolution && !(RESOLUTIONS as readonly string[]).includes(resolution)) return fail("Choose Refund or Replacement.");
  const note = String(fd.get("note") ?? "").trim();
  if (note.length > 300) return fail("The note is too long (max 300).");
  const awb = String(fd.get("pickupAwb") ?? "").trim();
  if (awb.length > 60) return fail("Pickup AWB is too long (max 60).");
  const lines: { item_id: string; condition: string }[] = [];
  for (const [key] of fd.entries()) {
    if (!key.startsWith("cond_")) continue;
    const item = key.slice(5);
    const cond = z.enum(CONDITIONS).safeParse(fd.get(key));
    if (!UUID.safeParse(item).success || !cond.success) return fail("Choose the condition of each item.");
    lines.push({ item_id: item, condition: cond.data });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_inspection", { p_id: id.data, p_header: { resolution: resolution || null, note: note || null, pickup_awb: awb || null }, p_lines: lines });
  if (error) return fail(friendlyDbError(error));
  refresh();
  return { ok: true, message: "Inspection saved." };
}

// Approve: the good items go back into stock (the database does it in one step).
export async function approveReturnAction(_prev: ReturnState, fd: FormData): Promise<ReturnState> {
  await requirePermission("returns.approve");
  const id = UUID.safeParse(fd.get("returnId"));
  if (!id.success) return fail("Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_return", { p_id: id.data });
  if (error) return fail(friendlyDbError(error));
  refresh();
  return { ok: true, message: "Approved. The good items are back in stock." };
}

export async function rejectReturnAction(_prev: ReturnState, fd: FormData): Promise<ReturnState> {
  await requirePermission("returns.approve");
  const id = UUID.safeParse(fd.get("returnId"));
  if (!id.success) return fail("Invalid form data.");
  const note = String(fd.get("rejectNote") ?? "").trim();
  if (note.length < 3) return fail("Write a reason (at least 3 letters).");
  if (note.length > 300) return fail("The reason is too long (max 300).");
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_return", { p_id: id.data, p_note: note });
  if (error) return fail(friendlyDbError(error));
  refresh();
  return { ok: true, message: "Rejected." };
}
