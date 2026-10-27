import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { REASON_LABELS, type EntryReason } from "@/lib/validation/stock-entry";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected" };

const COLUMNS = [
  { key: "when", label: "Date and time" },
  { key: "entry_no", label: "Adjustment no." },
  { key: "first_code", label: "First SKU" },
  { key: "items", label: "Items" },
  { key: "qty", label: "Total qty" },
  { key: "place_name", label: "Warehouse" },
  { key: "type_label", label: "Type" },
  { key: "reason_label", label: "Reason" },
  { key: "reference", label: "Reference" },
  { key: "status_label", label: "Status" },
  { key: "requested_by", label: "Requested by" },
];

// CSV download of the stock adjustments with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "stock.entry") || can(user, "stock.view") || can(user, "stock.approve"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const type = ["IN", "OUT"].includes(sp.get("type") ?? "") ? sp.get("type") : null;
  const status = Object.keys(STATUS_LABEL).includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("stock_adjustments_page", { p_q: q || null, p_location: place, p_type: type, p_status: status, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
    when: new Date(r.created_at as string).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }),
    type_label: r.direction === "IN" ? "Increase" : "Decrease",
    reason_label: REASON_LABELS.en[r.reason as EntryReason] ?? r.reason,
    status_label: STATUS_LABEL[r.status as string] ?? r.status,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-stock-adjustments-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
