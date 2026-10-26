"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { CHANGEABLE_STATUSES, SERVICE_TYPES } from "@/lib/validation/dispatch";

export type DispatchState = { ok: boolean; message: string } | null;
const fail = (message: string): DispatchState => ({ ok: false, message });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const headerSchema = z.object({
  courierId: z.uuid("Choose the courier partner."),
  serviceType: z.union([z.enum(SERVICE_TYPES), z.literal("")]),
  awb: z.string().trim().min(3, "Enter the AWB / tracking ID (at least 3 characters).").max(60, "The AWB / tracking ID is too long (max 60)."),
  pickupRef: z.string().trim().max(60, "Pickup reference is too long (max 60)."),
  remarks: z.string().trim().max(300, "Remarks are too long (max 300)."),
});

function readHeader(fd: FormData) {
  return headerSchema.safeParse({
    courierId: fd.get("courierId"), serviceType: String(fd.get("serviceType") ?? ""), awb: String(fd.get("awb") ?? ""),
    pickupRef: String(fd.get("pickupRef") ?? ""), remarks: String(fd.get("remarks") ?? ""),
  });
}

// Mark a packed order as dispatched. This takes the stock out (the database does it in one step).
export async function createDispatchAction(_prev: DispatchState, fd: FormData): Promise<DispatchState> {
  await requirePermission("dispatch.manage");
  const orderId = z.uuid("Choose the order.").safeParse(fd.get("orderId"));
  if (!orderId.success) return fail(orderId.error.issues[0].message);
  const date = DATE.test(String(fd.get("dispatchDate") ?? "")) ? String(fd.get("dispatchDate")) : null;
  if (!date) return fail("Choose the dispatch date.");
  const h = readHeader(fd);
  if (!h.success) return fail(h.error.issues[0].message);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_dispatch", {
    p_order_id: orderId.data,
    p_header: {
      dispatch_date: date, courier_id: h.data.courierId, service_type: h.data.serviceType || null, awb: h.data.awb,
      insurance: fd.get("insurance") === "true", pickup_ref: h.data.pickupRef || null, remarks: h.data.remarks || null,
    },
  });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/dispatch");
  revalidatePath("/picking");
  revalidatePath("/sales-orders");
  revalidatePath("/stock");
  const id = (data as { id?: string } | null)?.id;
  redirect(`/dispatch?sel=${id}&p=details`);
}

// Fix the courier details of a dispatch (stock is not touched).
export async function updateDispatchAction(_prev: DispatchState, fd: FormData): Promise<DispatchState> {
  await requirePermission("dispatch.manage");
  const id = z.uuid().safeParse(fd.get("dispatchId"));
  if (!id.success) return fail("Invalid form data.");
  const h = readHeader(fd);
  if (!h.success) return fail(h.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_dispatch", {
    p_id: id.data,
    p_header: { courier_id: h.data.courierId, service_type: h.data.serviceType || null, awb: h.data.awb, insurance: fd.get("insurance") === "true", pickup_ref: h.data.pickupRef || null, remarks: h.data.remarks || null },
  });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/dispatch");
  redirect(`/dispatch?sel=${id.data}&p=details`);
}

// Change the status of the parcel by hand (there is no courier connection).
export async function setStatusAction(_prev: DispatchState, fd: FormData): Promise<DispatchState> {
  await requirePermission("dispatch.manage");
  const id = z.uuid().safeParse(fd.get("dispatchId"));
  const status = z.enum(CHANGEABLE_STATUSES, "Choose a status.").safeParse(fd.get("status"));
  if (!id.success) return fail("Invalid form data.");
  if (!status.success) return fail(status.error.issues[0].message);
  const rawDate = String(fd.get("date") ?? "");
  if (rawDate && !DATE.test(rawDate)) return fail("The date is not valid.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_dispatch_status", { p_id: id.data, p_status: status.data, p_date: rawDate || null });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/dispatch");
  return { ok: true, message: "Status saved." };
}

// Add a courier to the list.
export async function addCourier(name: string): Promise<DispatchState> {
  await requirePermission("dispatch.manage");
  const n = z.string().trim().min(2, "Courier name must be 2 to 60 letters.").max(60, "Courier name must be 2 to 60 letters.").safeParse(name);
  if (!n.success) return fail(n.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_courier", { p_name: n.data });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/dispatch");
  return { ok: true, message: "Courier added." };
}
