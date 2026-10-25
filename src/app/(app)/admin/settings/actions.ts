"use server";

import { revalidatePath } from "next/cache";
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
