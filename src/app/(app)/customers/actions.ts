"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { customerFromForm } from "@/lib/validation/customer";

export type CustomerState = { ok: boolean; message: string } | null;
const fail = (message: string): CustomerState => ({ ok: false, message });

// Create (no id) or update (id). Needs customers.manage; the database checks it again.
// The code (CUST-001...) is made by the database and never changes.
export async function saveCustomer(_prev: CustomerState, fd: FormData): Promise<CustomerState> {
  await requirePermission("customers.manage");
  const rawId = fd.get("id");
  const parsed = customerFromForm(fd, Boolean(rawId));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const row = {
    name: v.name, customer_type: v.customerType, gstin: v.gstin, contact_person: v.contactPerson, phone: v.phone, email: v.email,
    address: v.address, city: v.city, state: v.state, credit_limit: v.creditLimit, payment_terms: v.paymentTerms, notes: v.notes,
  };

  const supabase = await createClient();
  let id: string;
  if (!rawId) {
    const { data, error } = await supabase.from("customers").insert(row).select("id").single();
    if (error) return fail(friendlyDbError(error));
    id = data.id;
  } else {
    const parsedId = z.uuid().safeParse(rawId);
    if (!parsedId.success) return fail("Invalid form data.");
    const { data, error } = await supabase.from("customers").update({ ...row, is_active: v.isActive }).eq("id", parsedId.data).select("id");
    if (error) return fail(friendlyDbError(error));
    if (!data || data.length === 0) return fail("Nothing was saved (you may not be allowed to edit it).");
    id = parsedId.data;
  }
  revalidatePath("/customers");
  redirect(`/customers?sel=${id}`);
}

// Switch a customer on or off from a plain button. Customers are never deleted (bills point at them).
export async function toggleCustomerActive(fd: FormData): Promise<void> {
  await requirePermission("customers.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("customers").update({ is_active: fd.get("active") === "1" }).eq("id", id.data);
  revalidatePath("/customers");
  redirect(`/customers?sel=${id.data}`);
}
