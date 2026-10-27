"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { CHARGE_TYPES, INCOTERMS } from "@/lib/validation/shipment";

export type ShipmentState = { ok: boolean; message: string } | null;
const fail = (message: string): ShipmentState => ({ ok: false, message });


const text = (max: number, label: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, `${label} is too long (max ${max}).`).nullable());
const date = (label: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} is not a valid date.`).nullable());

const shipmentSchema = z.object({
  poId: z.uuid("Choose a purchase order."),
  containerNo: text(40, "Container no."),
  blNo: text(60, "BL / AWB no."),
  portLoading: text(80, "Port of loading"),
  portDischarge: text(80, "Port of discharge"),
  etd: date("ETD"),
  eta: date("ETA"),
  shippingLine: text(80, "Shipping line"),
  vessel: text(80, "Vessel / flight"),
  incoterms: z.preprocess((v) => (v === "" ? null : v), z.enum(INCOTERMS, "Unknown incoterms.").nullable()),
  notes: text(1000, "Notes"),
});

// Create (no id) or edit (id) a shipment. The quantities come as qty_<purchase order line id>; a blank or 0 means "not on this shipment".
// Needs shipments.manage; the database checks it again, and checks the open quantity of every line.
export async function saveShipment(_prev: ShipmentState, fd: FormData): Promise<ShipmentState> {
  await requirePermission("shipments.manage");
  const parsed = shipmentSchema.safeParse({
    poId: fd.get("poId"), containerNo: fd.get("containerNo"), blNo: fd.get("blNo"), portLoading: fd.get("portLoading"), portDischarge: fd.get("portDischarge"),
    etd: fd.get("etd"), eta: fd.get("eta"), shippingLine: fd.get("shippingLine"), vessel: fd.get("vessel"), incoterms: fd.get("incoterms"), notes: fd.get("notes"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  if (v.etd && v.eta && v.eta < v.etd) return fail("ETA cannot be before ETD.");

  const lines: { po_line_id: number; quantity: number }[] = [];
  for (const [key, raw] of fd.entries()) {
    if (!key.startsWith("qty_") || typeof raw !== "string" || raw.trim() === "") continue;
    const id = Number(key.slice(4));
    const qty = Number(raw);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(qty) || qty < 0) return fail("A quantity is not valid.");
    if (qty > 0) lines.push({ po_line_id: id, quantity: qty });
  }
  if (lines.length === 0) return fail("Put a quantity against at least one item.");

  const rawId = fd.get("id");
  const id = rawId ? z.uuid().safeParse(rawId) : null;
  if (id && !id.success) return fail("Invalid form data.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_import_shipment", {
    p_id: id?.data ?? null,
    p_header: {
      po_id: v.poId, container_no: v.containerNo, bl_no: v.blNo, port_loading: v.portLoading, port_discharge: v.portDischarge,
      etd: v.etd, eta: v.eta, shipping_line: v.shippingLine, vessel: v.vessel, incoterms: v.incoterms, notes: v.notes,
    },
    p_lines: lines,
  });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/import-shipments");
  redirect(`/import-shipments?sel=${(data as { id: string }).id}`);
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["DISPATCHED", "IN_TRANSIT", "ARRIVED", "CUSTOMS", "DELIVERED", "CANCELLED"], "Choose a status."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  note: text(300, "Note"),
});

export async function updateShipmentStatus(_prev: ShipmentState, fd: FormData): Promise<ShipmentState> {
  await requirePermission("shipments.manage");
  const parsed = statusSchema.safeParse({ id: fd.get("id"), status: fd.get("status"), date: fd.get("date"), note: fd.get("note") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_import_shipment_status", { p_id: parsed.data.id, p_status: parsed.data.status, p_date: parsed.data.date, p_note: parsed.data.note });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/import-shipments");
  redirect(`/import-shipments?sel=${parsed.data.id}`);
}

const chargeSchema = z.object({
  id: z.uuid(),
  type: z.enum(CHARGE_TYPES.map((c) => c[0]) as [string, ...string[]], "Choose a charge type."),
  amount: z.coerce.number("Amount must be a number.").min(0, "Amount cannot be negative.").max(99_999_999_999, "Amount is too big."),
  note: text(200, "Note"),
});

export async function addShipmentCharge(_prev: ShipmentState, fd: FormData): Promise<ShipmentState> {
  await requirePermission("shipments.manage");
  const parsed = chargeSchema.safeParse({ id: fd.get("id"), type: fd.get("type"), amount: fd.get("amount"), note: fd.get("note") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_import_shipment_charge", { p_id: parsed.data.id, p_type: parsed.data.type, p_amount: parsed.data.amount, p_note: parsed.data.note });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/import-shipments");
  redirect(`/import-shipments?sel=${parsed.data.id}&tab=charges`);
}

export async function removeShipmentCharge(fd: FormData): Promise<void> {
  await requirePermission("shipments.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  const chargeId = z.coerce.number().int().positive().safeParse(fd.get("chargeId"));
  if (!id.success || !chargeId.success) return;
  const supabase = await createClient();
  await supabase.rpc("remove_import_shipment_charge", { p_charge_id: chargeId.data });
  revalidatePath("/import-shipments");
  redirect(`/import-shipments?sel=${id.data}&tab=charges`);
}
