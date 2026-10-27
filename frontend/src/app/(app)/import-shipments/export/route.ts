import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUSES = ["BOOKED", "DISPATCHED", "IN_TRANSIT", "ARRIVED", "CUSTOMS", "DELIVERED", "CANCELLED", "DELAYED"];

// CSV download of the shipment list with the same filters as the screen (at most 5000 rows).
// The value column is filled only for people who may see buying prices.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "shipments.view") || can(user, "shipments.manage"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const supplier = z.uuid().safeParse(sp.get("supplier")).data ?? null;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const pol = sp.get("pol")?.slice(0, 80) || null;
  const pod = sp.get("pod")?.slice(0, 80) || null;

  const columns = [
    { key: "shipment_no", label: "Shipment no." },
    { key: "po_no", label: "PO number" },
    { key: "supplier_name", label: "Supplier" },
    { key: "supplier_country", label: "Country" },
    { key: "container_no", label: "Container no." },
    { key: "port_loading", label: "Port of loading" },
    { key: "port_discharge", label: "Port of discharge" },
    { key: "etd", label: "ETD" },
    { key: "eta", label: "ETA" },
    { key: "items", label: "Total items" },
    ...(can(user, "receipts.cost") ? [{ key: "value", label: "Total value" }] : []),
    { key: "status", label: "Status" },
  ];

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("import_shipments_page", { p_q: q || null, p_supplier: supplier, p_status: status, p_pol: pol, p_pod: pod, p_limit: 100, p_offset: offset });
  const first = await call(0);
  if (first.error || !first.data) return new Response("Could not build the file", { status: 500 });
  type R = Record<string, unknown>;
  const raw = [...(((first.data as { rows: R[] }).rows) ?? [])];
  const total = Number((first.data as { total: number }).total ?? 0);
  for (let offset = 100; offset < Math.min(total, 5000); offset += 100) {
    const next = await call(offset);
    if (next.error) return new Response("Could not build the file", { status: 500 });
    raw.push(...(((next.data as { rows: R[] }).rows) ?? []));
  }
  const rows = raw.map((r) => ({ ...r, status: r.delayed ? `${r.status} (delayed)` : r.status }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-import-shipments-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
