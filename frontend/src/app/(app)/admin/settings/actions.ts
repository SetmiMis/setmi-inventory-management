"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type SettingState = { ok: boolean; message: string } | null;

// Admin only (checked here and again inside the database function).
export async function setBillingEnabled(_prev: SettingState, fd: FormData): Promise<SettingState> {
  await requireAdmin();
  const enabled = fd.get("enabled") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_billing_enabled", { p_enabled: enabled });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: enabled ? "Billing is now ON." : "Billing is now OFF." };
}

const company = z.object({
  name: z.string().trim().min(2, "The company name must be 2 to 100 letters.").max(100, "The company name must be 2 to 100 letters."),
  tagline: z.string().trim().max(100, "The tagline is too long (max 100)."),
  gst: z.string().trim().max(15, "The GST number has 15 letters and digits."),
  pan: z.string().trim().max(10, "The PAN has 10 characters."),
  address: z.string().trim().max(300, "The address is too long (max 300)."),
  phone: z.string().trim().max(30, "The phone number is too long."),
  email: z.string().trim().max(100, "The e-mail address is too long."),
  website: z.string().trim().max(100, "The website is too long (max 100)."),
});

// Save the company information (shown on the printed papers). The database function checks every field again.
export async function saveCompanyAction(_prev: SettingState, fd: FormData): Promise<SettingState> {
  await requireAdmin();
  const p = company.safeParse(Object.fromEntries(["name", "tagline", "gst", "pan", "address", "phone", "email", "website"].map((k) => [k, String(fd.get(k) ?? "")])));
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Invalid form data." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_company", { p: p.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The printed papers use this from now on." };
}
