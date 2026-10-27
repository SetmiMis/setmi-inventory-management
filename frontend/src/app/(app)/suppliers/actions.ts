"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { supplierFromForm } from "@/lib/validation/supplier";

export type SupplierState = { ok: boolean; message: string } | null;
const fail = (message: string): SupplierState => ({ ok: false, message });

// Needs suppliers.manage (the database checks it again). On update, expectedUpdatedAt stops
// two people overwriting each other.
export async function saveSupplier(_prev: SupplierState, fd: FormData): Promise<SupplierState> {
  await requirePermission("suppliers.manage");
  const parsed = supplierFromForm(fd);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const row = {
    name: v.name, supplier_type: v.supplierType, contact_person: v.contactPerson, phone: v.phone, email: v.email,
    address: v.address, country: v.country, gstin: v.gstin, notes: v.notes,
    city: v.city, website: v.website, payment_terms: v.paymentTerms, currency: v.currency,
  };
  const supabase = await createClient();

  const rawId = fd.get("id");
  if (!rawId) {
    const { data, error } = await supabase.from("suppliers").insert(row).select("id").single();
    if (error) return fail(friendlyDbError(error));
    revalidatePath("/suppliers");
    redirect(`/suppliers/${data.id}`);
  }
  const id = z.uuid().safeParse(rawId);
  const expected = z.string().min(1).max(64).safeParse(fd.get("expectedUpdatedAt"));
  if (!id.success || !expected.success) return fail("Invalid form data.");

  const { data, error } = await supabase.from("suppliers").update(row).eq("id", id.data).eq("updated_at", expected.data).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("This supplier was changed by someone else (or you may not edit it). Reload and try again.");
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id.data}`);
  return { ok: true, message: "Saved." };
}

export async function setSupplierActive(_prev: SupplierState, fd: FormData): Promise<SupplierState> {
  await requirePermission("suppliers.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid form data.");
  const active = fd.get("active") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").update({ is_active: active }).eq("id", id.data).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Nothing was changed.");
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id.data}`);
  return { ok: true, message: active ? "Supplier restored." : "Supplier archived." };
}

// Archive or restore from a plain form button (the list page and its side panel). Suppliers are never deleted:
// receipts and orders keep pointing at them.
export async function toggleSupplierActive(fd: FormData): Promise<void> {
  await requirePermission("suppliers.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("suppliers").update({ is_active: fd.get("active") === "1" }).eq("id", id.data);
  revalidatePath("/suppliers");
  redirect(`/suppliers?sel=${id.data}`);
}
