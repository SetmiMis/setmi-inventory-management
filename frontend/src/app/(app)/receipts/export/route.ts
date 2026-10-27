import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUSES = ["DRAFT", "POSTED", "PARTIAL", "CANCELLED"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "receipt_no", label: "GRN number" },
  { key: "receipt_date", label: "Date" },
  { key: "po_no", label: "PO number" },
  { key: "supplier_name", label: "Supplier" },
  { key: "supplier_country", label: "Country" },
  { key: "source_label", label: "Source" },
  { key: "place", label: "Warehouse" },
  { key: "supplier_invoice_no", label: "Invoice no." },
  { key: "items", label: "Total items" },
  { key: "qty", label: "Received qty" },
  { key: "status_label", label: "Status" },
];

// CSV download of the goods receipt list with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "receipts.view") || can(user, "receipts.create") || can(user, "receipts.post"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const supplier = z.uuid().safeParse(sp.get("supplier")).data ?? null;
  const source = ["IMPORT", "LOCAL"].includes(sp.get("source") ?? "") ? sp.get("source") : null;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("receipts_page", { p_q: q || null, p_location: place, p_supplier: supplier, p_source: source, p_status: status, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
  const label: Record<string, string> = { DRAFT: "Draft", POSTED: "Posted", CANCELLED: "Cancelled" };
  const rows = raw.map((r) => ({
    ...r,
    source_label: r.source === "IMPORT" ? "Import" : "Domestic",
    place: `${r.place_name} (${r.place_code})`,
    status_label: r.partial ? "Partly received" : label[r.status as string] ?? r.status,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-goods-receipts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
