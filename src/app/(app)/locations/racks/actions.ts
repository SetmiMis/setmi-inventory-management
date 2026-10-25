"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeSearch } from "@/lib/validation/item";
import { binFromForm } from "@/lib/validation/bin";

export type BinState = { ok: boolean; message: string } | null;
const fail = (message: string): BinState => ({ ok: false, message });

// Create (no id) or update (id) a rack / shelf / bin. Needs locations.manage; the database checks it again.
// The code (for example WH01-A-01-01) is made by the database from the place code and the three parts.
export async function saveBin(_prev: BinState, fd: FormData): Promise<BinState> {
  await requirePermission("locations.manage");
  const parsed = binFromForm(fd);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const row = { location_id: v.locationId, rack: v.rack, level: v.level, bin_no: v.binNo, bin_type: v.binType, capacity: v.capacity, notes: v.notes };

  const supabase = await createClient();
  const rawId = fd.get("id");
  let id: string;
  if (!rawId) {
    const { data, error } = await supabase.from("storage_bins").insert(row).select("id").single();
    if (error) return fail(error.code === "23505" ? "This rack, level and bin already exist in that place." : friendlyDbError(error));
    id = data.id;
  } else {
    const parsedId = z.uuid().safeParse(rawId);
    if (!parsedId.success) return fail("Invalid form data.");
    const { data, error } = await supabase
      .from("storage_bins")
      .update({ ...row, is_blocked: v.blocked, block_reason: v.blocked ? v.blockReason : null })
      .eq("id", parsedId.data)
      .select("id");
    if (error) return fail(error.code === "23505" ? "This rack, level and bin already exist in that place." : friendlyDbError(error));
    if (!data || data.length === 0) return fail("Nothing was saved (you may not be allowed to edit it).");
    id = parsedId.data;
  }
  revalidatePath("/locations/racks");
  redirect(`/locations/racks?sel=${id}`);
}

// Block or unblock from a plain button. A blocked bin cannot be used (reason is optional).
export async function toggleBinBlocked(fd: FormData): Promise<void> {
  await requirePermission("locations.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const block = fd.get("block") === "1";
  const reason = z.string().trim().max(200).safeParse(fd.get("reason") ?? "");
  const supabase = await createClient();
  await supabase.from("storage_bins").update({ is_blocked: block, block_reason: block && reason.success && reason.data ? reason.data : null }).eq("id", id.data);
  revalidatePath("/locations/racks");
  redirect(`/locations/racks?sel=${id.data}`);
}

// Put a product in a bin, found by its SKU code. A product sits in one bin per place.
export async function assignItemToBin(_prev: BinState, fd: FormData): Promise<BinState> {
  await requirePermission("locations.manage");
  const binId = z.uuid().safeParse(fd.get("binId"));
  const sku = sanitizeSearch(String(fd.get("sku") ?? "")).trim();
  if (!binId.success || !sku) return fail("Type the SKU code of the product.");

  const supabase = await createClient();
  const [{ data: bin }, { data: item }] = await Promise.all([
    supabase.from("storage_bins").select("id, location_id").eq("id", binId.data).maybeSingle(),
    supabase.from("items").select("id").ilike("internal_item_code", sku.replace(/[\\%_]/g, "\\$&")).eq("is_active", true).maybeSingle(),
  ]);
  if (!bin) return fail("This bin was not found.");
  if (!item) return fail("No active product has this SKU code.");

  const { error } = await supabase.from("item_bins").insert({ bin_id: bin.id, location_id: bin.location_id, item_id: item.id });
  if (error) {
    if (error.code === "23505") return fail("This product already has a bin in this place. Remove it from there first.");
    return fail(friendlyDbError(error));
  }
  revalidatePath("/locations/racks");
  return { ok: true, message: "Product added to this bin." };
}

export async function removeItemFromBin(fd: FormData): Promise<void> {
  await requirePermission("locations.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  const binId = z.uuid().safeParse(fd.get("binId"));
  if (!id.success || !binId.success) return;
  const supabase = await createClient();
  await supabase.from("item_bins").delete().eq("id", id.data);
  revalidatePath("/locations/racks");
  redirect(`/locations/racks?sel=${binId.data}`);
}
