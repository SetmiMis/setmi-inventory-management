import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { key: "full_name", label: "Name" }, { key: "email", label: "Email" }, { key: "role_name", label: "Role" }, { key: "department_name", label: "Department" },
  { key: "status_label", label: "Status" }, { key: "perm_count", label: "Permissions" }, { key: "last_login", label: "Last login" },
];

// CSV of the user list with the same filters as the screen. Administrators only (the database checks it again).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !user.isAdmin) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").replace(/[^\p{L}\p{N}@ ._+-]/gu, "").slice(0, 60).trim();
  const role = z.uuid().safeParse(sp.get("role")).data ?? null;
  const department = z.uuid().safeParse(sp.get("department")).data ?? null;
  const status = ["ACTIVE", "INACTIVE", "INVITED"].includes(sp.get("status") ?? "") ? sp.get("status") : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_users_page", { p_q: q || null, p_role: role, p_department: department, p_status: status, p_limit: 100, p_offset: 0 });
  if (error || !data) return new Response("Could not build the file", { status: 500 });
  type R = Record<string, unknown>;
  const rows = (((data as { rows: R[] }).rows) ?? []).map((r) => ({
    ...r, status_label: r.status === "ACTIVE" ? "Active" : r.status === "INACTIVE" ? "Inactive" : "Invited",
    last_login: r.last_login ? new Date(r.last_login as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "",
  }));
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="setmi-users-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}
