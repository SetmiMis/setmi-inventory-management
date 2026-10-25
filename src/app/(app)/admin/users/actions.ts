"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type SaveUserState = { ok: boolean; message: string } | null;

const schema = z.object({
  userId: z.uuid(),
  isActive: z.boolean(),
  isAdmin: z.boolean(),
  permissions: z.array(z.string().min(1).max(64)).max(100),
  locations: z.array(z.uuid()).max(200),
});

// Saves one user's settings. Authorization is checked twice:
// 1. requireAdmin() here, 2. each admin_* database function checks is_admin() again.
// Limitation: four separate database calls, not one transaction. If one fails midway,
// earlier ones stay applied; the error is shown and the admin can save again.
export async function saveUser(_prev: SaveUserState, formData: FormData): Promise<SaveUserState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    userId: formData.get("userId"),
    isActive: formData.get("isActive") === "on",
    isAdmin: formData.get("isAdmin") === "on",
    permissions: formData.getAll("permissions").map(String),
    locations: formData.getAll("locations").map(String),
  });
  if (!parsed.success) return { ok: false, message: "Invalid form data." };
  const v = parsed.data;

  const supabase = await createClient();
  const steps = [
    supabase.rpc("admin_set_user_permissions", { p_user: v.userId, p_keys: v.permissions }),
    supabase.rpc("admin_set_user_locations", { p_user: v.userId, p_locations: v.locations }),
    supabase.rpc("admin_set_user_admin", { p_user: v.userId, p_admin: v.isAdmin }),
    supabase.rpc("admin_set_user_active", { p_user: v.userId, p_active: v.isActive }),
  ];
  for (const step of steps) {
    // Run in order: admin first, then active, so a rule like "cannot deactivate yourself" reports clearly.
    const { error } = await step;
    if (error) return { ok: false, message: friendlyDbError(error) };
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Saved." };
}
