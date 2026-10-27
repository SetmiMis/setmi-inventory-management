import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", IN_PROGRESS: "In progress", WAITING_APPROVAL: "Waiting approval", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const TYPE_LABEL: Record<string, string> = { FULL: "Full count", CYCLE: "Cycle count", LOCATION: "Location count" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// CSV download of the physical counts with the same filters as the screen (at most 5000 rows).
// The value column is filled only for people who may see buying prices.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "stock.view") || can(user, "stock.adjust") || can(user, "stock.approve"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const type = Object.keys(TYPE_LABEL).includes(sp.get("type") ?? "") ? sp.get("type") : null;
  const status = Object.keys(STATUS_LABEL).includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const columns = [
    { key: "count_no", label: "Count no." },
    { key: "when", label: "Date" },
    { key: "place_name", label: "Warehouse" },
    { key: "type_label", label: "Count type" },
    { key: "items", label: "Total items" },
    { key: "counted", label: "Counted" },
    { key: "var_qty", label: "Variance (qty)" },
    ...(can(user, "receipts.cost") ? [{ key: "var_value", label: "Variance value" }] : []),
    { key: "status_label", label: "Status" },
    { key: "created_by_name", label: "Created by" },
  ];

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("physical_counts_page", { p_q: q || null, p_location: place, p_type: type, p_status: status, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
    when: new Date(r.created_at as string).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    type_label: TYPE_LABEL[r.count_type as string] ?? r.count_type,
    status_label: STATUS_LABEL[r.status as string] ?? r.status,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-physical-counts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
