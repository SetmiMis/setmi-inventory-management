import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { MOVEMENT_LABEL, STATUS_FILTERS, STATUS_LABEL, TABS, TAB_LABEL, type Tab } from "@/lib/validation/stock-valuation";

const LINE_COLUMNS = [
  { key: "code", label: "SKU code" }, { key: "item_name", label: "Item name" }, { key: "category_name", label: "Category" }, { key: "place_name", label: "Warehouse" }, { key: "supplier_name", label: "Supplier" },
  { key: "qty", label: "Current stock" }, { key: "unit", label: "Unit" }, { key: "avg_cost", label: "Unit cost (average)" }, { key: "value", label: "Stock value" }, { key: "refill_value", label: "Refill value" },
  { key: "age_days", label: "Age (days)" }, { key: "movement_label", label: "Movement type" }, { key: "status_label", label: "Stock status" },
];
const COLUMNS: Record<Tab, { key: string; label: string }[]> = {
  sku: LINE_COLUMNS, movers: LINE_COLUMNS, low: LINE_COLUMNS, out: LINE_COLUMNS,
  category: [{ key: "category_name", label: "Category" }, { key: "items", label: "Items" }, { key: "qty", label: "Quantity" }, { key: "value", label: "Stock value" }],
  warehouse: [{ key: "place_name", label: "Warehouse" }, { key: "items", label: "Items" }, { key: "qty", label: "Quantity" }, { key: "value", label: "Stock value" }],
  supplier: [{ key: "supplier_name", label: "Supplier (last receipt)" }, { key: "items", label: "Items" }, { key: "qty", label: "Quantity" }, { key: "value", label: "Stock value" }],
  ageing: [{ key: "bucket", label: "Age group" }, { key: "lines", label: "Stock lines" }, { key: "qty", label: "Quantity" }, { key: "value", label: "Stock value" }],
};

// CSV download of the chosen tab with the same filters as the screen (at most 5000 rows). Opens in Excel.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "reports.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "sku";
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const location = z.uuid().safeParse(sp.get("location")).data ?? null;
  const supplier = z.uuid().safeParse(sp.get("supplier")).data ?? null;
  const status = (STATUS_FILTERS as readonly string[]).includes(sp.get("status") ?? "") ? sp.get("status") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("stock_valuation", { p_tab: tab, p_q: q || null, p_category: category, p_location: location, p_supplier: supplier, p_status: status, p_limit: 100, p_offset: offset });
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
  const rows = raw.map((r) => ({ ...r, status_label: STATUS_LABEL[r.status as string] ?? r.status, movement_label: MOVEMENT_LABEL[r.movement as string] ?? r.movement }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS[tab]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-stock-valuation-${TAB_LABEL[tab].toLowerCase().replace(/[^a-z]+/g, "-")}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
