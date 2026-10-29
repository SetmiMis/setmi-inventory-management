import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  isAdmin: boolean;
  permissions: string[];
};

// Who is signed in? Asks the Supabase Auth server (getUser), not just the cookie,
// so a revoked or forged session is rejected. Cached per request.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) return null;

  // The two reads do not depend on each other: ask together (one network wait instead of two).
  const [{ data: profile, error: profileError }, { data: perms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, full_name, is_active, is_admin")
      .eq("id", auth.user.id)
      .maybeSingle(),
    supabase
      .from("user_permissions")
      .select("permission_key")
      .eq("user_id", auth.user.id),
  ]);

  if (profileError || !profile) return null;

  return {
    id: auth.user.id,
    email: profile.email || auth.user.email || "",
    fullName: profile.full_name ?? null,
    isActive: Boolean(profile.is_active),
    isAdmin: Boolean(profile.is_admin),
    permissions: (perms ?? []).map((p) => p.permission_key),
  };
});

// Use at the top of every protected page and server action.
// Deny by default: no session, inactive account, or missing right => no access.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isActive || !user.isAdmin) redirect("/?denied=1");
  return user;
}

export async function requirePermission(key: string): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = user.isActive && (user.isAdmin || user.permissions.includes(key));
  if (!allowed) redirect("/?denied=1");
  return user;
}

// For pages that several kinds of staff may open (for example receipts: view, prepare or post).
export async function requireAnyPermission(...keys: string[]): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = user.isActive && (user.isAdmin || keys.some((k) => user.permissions.includes(k)));
  if (!allowed) redirect("/?denied=1");
  return user;
}

export function can(user: CurrentUser, key: string): boolean {
  return user.isActive && (user.isAdmin || user.permissions.includes(key));
}

// The dashboard is worth showing when the person may see at least one of its parts.
// Admin users bypass the loop instantly.
export function showDashboard(user: CurrentUser): boolean {
  if (!user.isActive) return false;
  if (user.isAdmin) return true;

  const dashboardKeys = [
    "bills.view",
    "stock.view",
    "purchase.view",
    "purchase.create",
    "purchase.approve",
    "receipts.view",
    "receipts.create",
    "receipts.post",
    "transfers.view",
    "transfers.create",
    "transfers.send",
    "transfers.receive",
  ];

  return dashboardKeys.some((k) => user.permissions.includes(k));
}