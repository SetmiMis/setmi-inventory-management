"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { itemFromForm, parseBarcodes } from "@/lib/validation/item";

export type FormState = { ok: boolean; message: string } | null;
const fail = (message: string): FormState => ({ ok: false, message });

// ---------- create ----------
// Needs items.create. Two database calls (item, then barcodes), not one transaction:
// if the barcodes fail, the item stays and the user is sent to its page to add them again.
export async function createItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("items.create");

  const parsed = itemFromForm(fd);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const bc = parseBarcodes(String(fd.get("barcodes") ?? ""));
  if (bc.error) return fail(bc.error);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({
      internal_item_code: v.internalItemCode,
      import_item_code: v.importItemCode,
      item_name: v.itemName,
      // Owner decision D-008: never empty, falls back to Item Name.
      selling_item_name: v.sellingItemName || v.itemName,
      category_id: v.categoryId,
      purchase_source: v.purchaseSource,
      unit: v.unit,
      remarks: v.remarks,
      // Only people with items.edit_price may set a price (the database enforces it for updates).
      selling_price: v.sellingPrice && can(user, "items.edit_price") ? Number(v.sellingPrice) : null,
    })
    .select("id")
    .single();
  if (error) return fail(friendlyDbError(error));

  let warn = "";
  if (bc.barcodes.length > 0) {
    const { error: bcError } = await supabase
      .from("item_barcodes")
      .insert(bc.barcodes.map((barcode) => ({ item_id: data.id, barcode })));
    if (bcError) warn = "?warn=barcodes";
  }
  // Owner request: the system makes a barcode for every new item (can be switched off per item).
  if (fd.get("generateBarcode") === "on") {
    const { error: genError } = await supabase.rpc("generate_item_barcode", { p_item: data.id });
    if (genError) warn = "?warn=barcodes";
  }

  revalidatePath("/items");
  redirect(`/items/${data.id}${warn}`);
}

// ---------- update ----------
// Needs items.edit. Selling_Item_Name is only sent when the user also holds
// items.edit_selling_name (the database enforces this too).
// expectedUpdatedAt guards against two people editing the same item: if it changed
// meanwhile, zero rows match and the user is asked to reload.
export async function updateItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("items.edit");

  const id = z.uuid().safeParse(fd.get("id"));
  const expected = z.string().min(1).max(64).safeParse(fd.get("expectedUpdatedAt"));
  if (!id.success || !expected.success) return fail("Invalid form data.");

  const parsed = itemFromForm(fd);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const mayEditSelling = can(user, "items.edit_selling_name");
  if (mayEditSelling && !v.sellingItemName) return fail("Selling Item Name is required.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .update({
      internal_item_code: v.internalItemCode,
      import_item_code: v.importItemCode,
      item_name: v.itemName,
      ...(mayEditSelling ? { selling_item_name: v.sellingItemName } : {}),
      category_id: v.categoryId,
      purchase_source: v.purchaseSource,
      unit: v.unit,
      remarks: v.remarks,
      ...(can(user, "items.edit_price") ? { selling_price: v.sellingPrice ? Number(v.sellingPrice) : null } : {}),
    })
    .eq("id", id.data)
    .eq("updated_at", expected.data)
    .select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) {
    return fail("This item was changed by someone else (or you may not edit it). Reload the page and try again.");
  }

  revalidatePath("/items");
  revalidatePath(`/items/${id.data}`);
  return { ok: true, message: "Saved." };
}

// ---------- archive / restore ----------
export async function setItemActive(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission("items.archive");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid form data.");
  const active = fd.get("active") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase.from("items").update({ is_active: active }).eq("id", id.data).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Nothing was changed.");

  revalidatePath("/items");
  revalidatePath(`/items/${id.data}`);
  return { ok: true, message: active ? "Item restored." : "Item archived." };
}

// ---------- barcodes ----------
export async function addBarcode(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission("items.edit");
  const itemId = z.uuid().safeParse(fd.get("itemId"));
  const parsed = parseBarcodes(String(fd.get("barcode") ?? ""));
  if (!itemId.success) return fail("Invalid form data.");
  if (parsed.error) return fail(parsed.error);
  if (parsed.barcodes.length !== 1) return fail("Enter one barcode.");

  const supabase = await createClient();
  const { error } = await supabase.from("item_barcodes").insert({ item_id: itemId.data, barcode: parsed.barcodes[0] });
  if (error) return fail(friendlyDbError(error));

  revalidatePath(`/items/${itemId.data}`);
  return { ok: true, message: "Barcode added." };
}

// Gives the item its own EAN-13 barcode (starts with 2). The database function checks
// items.edit again, never makes a second generated barcode for the same item, and logs it.
export async function generateBarcode(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission("items.edit");
  const itemId = z.uuid().safeParse(fd.get("itemId"));
  if (!itemId.success) return fail("Invalid form data.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_item_barcode", { p_item: itemId.data });
  if (error) return fail(friendlyDbError(error));

  revalidatePath(`/items/${itemId.data}`);
  return { ok: true, message: `Barcode ${data} created.` };
}

export async function removeBarcode(_prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission("items.edit");
  const id = z.uuid().safeParse(fd.get("id"));
  const itemId = z.uuid().safeParse(fd.get("itemId"));
  if (!id.success || !itemId.success) return fail("Invalid form data.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_barcodes")
    .delete()
    .eq("id", id.data)
    .eq("item_id", itemId.data)
    .select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Barcode not found.");

  revalidatePath(`/items/${itemId.data}`);
  return { ok: true, message: "Barcode removed." };
}
