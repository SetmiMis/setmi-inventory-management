import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUSES = ["DRAFT", "SENT", "PARTIAL", "COMPLETED", "CANCELLED", "OVERDUE"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// CSV download of the purchase order list with the same filters as the screen (at most 5000 rows).
// The order value column is filled only for people who may see buying prices.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "purchase.view") || can(user, "purchase.create") || can(user, "purchase.approve"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const supplier = z.uuid().safeParse(sp.get("supplier")).data ?? null;
  const type = ["IMPORT", "LOCAL"].includes(sp.get("type") ?? "") ? sp.get("type") : null;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const columns = [
    { key: "po_no", label: "PO number" },
    { key: "order_date", label: "Order date" },
    { key: "supplier_name", label: "Supplier" },
    { key: "supplier_country", label: "Country" },
    { key: "order_type", label: "Order type" },
    { key: "place", label: "Deliver to" },
    { key: "items", label: "Total items" },
    { key: "qty", label: "Total quantity" },
    ...(can(user, "receipts.cost") ? [{ key: "value", label: "Order value" }] : []),
    { key: "expected_date", label: "Expected delivery" },
    { key: "status", label: "Status" },
  ];

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("purchase_orders_page", { p_q: q || null, p_supplier: supplier, p_type: type, p_status: status, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
  const rows = raw.map((r) => ({
    ...r,
    order_type: r.supplier_type === "IMPORT" ? "Import" : "Domestic",
    place: `${r.place_name} (${r.place_code})`,
    status: r.overdue ? `${r.status} (overdue)` : r.status,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-purchase-orders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
