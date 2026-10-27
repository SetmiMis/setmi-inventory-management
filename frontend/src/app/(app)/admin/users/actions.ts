"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type SaveUserState = { ok: boolean; message: string } | null;
const fail = (message: string): SaveUserState => ({ ok: false, message });

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
  if (!parsed.success) return fail("Invalid form data.");
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
    if (error) return fail(friendlyDbError(error));
  }

  revalidatePath("/admin/users");
  return { ok: true, message: "Saved." };
}

// Name, role label and department of one user (permissions are not touched).
export async function saveProfileAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const p = z.object({ userId: z.uuid(), fullName: z.string().trim().max(100, "The name is too long (max 100)."), roleId: z.union([z.uuid(), z.literal("")]), departmentId: z.union([z.uuid(), z.literal("")]) })
    .safeParse({ userId: fd.get("userId"), fullName: String(fd.get("fullName") ?? ""), roleId: String(fd.get("roleId") ?? ""), departmentId: String(fd.get("departmentId") ?? "") });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_profile", { p_user: p.data.userId, p_full_name: p.data.fullName || null, p_role: p.data.roleId || null, p_department: p.data.departmentId || null });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  return { ok: true, message: "Saved." };
}

// "Change Role": the role's permissions are COPIED to the user (a later change of the role does not touch him).
export async function applyRoleAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const p = z.object({ userId: z.uuid(), roleId: z.uuid("Choose a role.") }).safeParse({ userId: fd.get("userId"), roleId: fd.get("roleId") });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_apply_role", { p_user: p.data.userId, p_role: p.data.roleId });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  return { ok: true, message: "The role and its permissions were given." };
}

// "Add User": writes the invite (email, role, department, permissions, places). The login is made in the Supabase dashboard.
export async function inviteUserAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const p = z.object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200), fullName: z.string().trim().max(100, "The name is too long (max 100)."),
    roleId: z.union([z.uuid(), z.literal("")]), departmentId: z.union([z.uuid(), z.literal("")]), locations: z.array(z.uuid()).max(200),
  }).safeParse({
    email: String(fd.get("email") ?? ""), fullName: String(fd.get("fullName") ?? ""), roleId: String(fd.get("roleId") ?? ""), departmentId: String(fd.get("departmentId") ?? ""),
    locations: fd.getAll("locations").map(String),
  });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid form data.");
  if (!p.data.roleId) return fail("Choose a role. Its permissions are given when the person signs in.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_invite_user", {
    p_email: p.data.email, p_full_name: p.data.fullName || null, p_role: p.data.roleId, p_department: p.data.departmentId || null, p_keys: null, p_locations: p.data.locations,
  });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  redirect(`/admin/users?sel=${data}&p=details`);
}

export async function cancelInviteAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const id = z.uuid().safeParse(fd.get("inviteId"));
  if (!id.success) return fail("Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_cancel_invite", { p_id: id.data });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

// Make or change a role (a template of permissions).
export async function saveRoleAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const p = z.object({
    roleId: z.union([z.uuid(), z.literal("")]), name: z.string().trim().min(2, "The role name must be 2 to 60 letters.").max(60, "The role name must be 2 to 60 letters."),
    description: z.string().trim().max(200, "The description is too long (max 200)."), keys: z.array(z.string().min(1).max(64)).max(200),
  }).safeParse({ roleId: String(fd.get("roleId") ?? ""), name: String(fd.get("name") ?? ""), description: String(fd.get("description") ?? ""), keys: fd.getAll("permissions").map(String) });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_role", { p_id: p.data.roleId || null, p_name: p.data.name, p_description: p.data.description || null, p_keys: p.data.keys });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  return { ok: true, message: "Role saved. Users who already have this role keep the permissions they have now." };
}

export async function setRoleActiveAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const id = z.uuid().safeParse(fd.get("roleId"));
  if (!id.success) return fail("Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role_active", { p_id: id.data, p_active: fd.get("active") === "true" });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  return { ok: true, message: "Saved." };
}

export async function saveDepartmentAction(_prev: SaveUserState, fd: FormData): Promise<SaveUserState> {
  await requireAdmin();
  const p = z.object({ id: z.union([z.uuid(), z.literal("")]), name: z.string().trim().min(2, "The department name must be 2 to 60 letters.").max(60, "The department name must be 2 to 60 letters.") })
    .safeParse({ id: String(fd.get("departmentId") ?? ""), name: String(fd.get("name") ?? "") });
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid form data.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_department", { p_id: p.data.id || null, p_name: p.data.name, p_active: p.data.id ? fd.get("active") === "true" : true });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/admin/users");
  return { ok: true, message: "Saved." };
}
