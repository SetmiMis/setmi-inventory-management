import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUSES = ["PENDING", "PASSED", "REJECTED", "REWORK"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "qc_no", label: "QC number" },
  { key: "receipt_no", label: "GRN number" },
  { key: "po_no", label: "PO number" },
  { key: "shown_date", label: "Date" },
  { key: "supplier_name", label: "Supplier" },
  { key: "place_name", label: "Warehouse" },
  { key: "items", label: "Total items" },
  { key: "passed", label: "Passed qty" },
  { key: "rejected", label: "Rejected qty" },
  { key: "rework", label: "Rework qty" },
  { key: "status_label", label: "Status" },
  { key: "inspector_name", label: "QC by" },
];

// CSV download of the quality checks with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "qc.view") || can(user, "qc.manage"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const supplier = z.uuid().safeParse(sp.get("supplier")).data ?? null;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("quality_checks_page", { p_q: q || null, p_location: place, p_supplier: supplier, p_status: status, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
  const label: Record<string, string> = { PENDING: "Pending", PASSED: "Passed", REJECTED: "Rejected", REWORK: "Rework" };
  const rows = raw.map((r) => ({ ...r, status_label: label[r.status as string] ?? r.status }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-quality-checks-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
