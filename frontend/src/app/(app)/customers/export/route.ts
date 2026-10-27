import { redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_TYPES } from "@/lib/validation/customer";
import { sanitizeSearch } from "@/lib/validation/item";

const COLUMNS = [
  { key: "code", label: "Customer code" },
  { key: "name", label: "Customer name" },
  { key: "type", label: "Type" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "contact_person", label: "Contact person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "gstin", label: "GST number" },
  { key: "orders", label: "Total orders" },
  { key: "sales", label: "Total sales" },
  { key: "active", label: "Active" },
];

// CSV download of the customer list with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "customers.view") || can(user, "customers.manage"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const type = (CUSTOMER_TYPES as readonly string[]).includes(sp.get("type") ?? "") ? sp.get("type") : null;
  const status = ["active", "inactive"].includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const city = sp.get("city")?.slice(0, 60) || null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("customers_page", { p_q: q || null, p_type: type, p_status: status, p_city: city, p_limit: 100, p_offset: offset });
  const first = await call(0);
  if (first.error || !first.data) return new Response("Could not build the file", { status: 500 });
  const rows = [...((first.data as { rows: Record<string, unknown>[] }).rows ?? [])];
  const total = Number((first.data as { total: number }).total ?? 0);
  for (let offset = 100; offset < Math.min(total, 5000); offset += 100) {
    const next = await call(offset);
    if (next.error) return new Response("Could not build the file", { status: 500 });
    rows.push(...(((next.data as { rows: Record<string, unknown>[] }).rows) ?? []));
  }

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-customers-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
