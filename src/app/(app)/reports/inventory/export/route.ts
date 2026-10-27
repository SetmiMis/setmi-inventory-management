import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { MOVE_LABEL, MOVE_TYPES, STATUS_FILTERS, STATUS_LABEL, TABS, TAB_LABEL, type Tab } from "@/lib/validation/inventory-report";
import { sanitizeSearch } from "@/lib/validation/item";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const STOCK_COLUMNS = [
  { key: "code", label: "SKU code" }, { key: "item_name", label: "Item name" }, { key: "category_name", label: "Category" }, { key: "place_name", label: "Warehouse" },
  { key: "rack", label: "Rack" }, { key: "qty", label: "Current stock" }, { key: "reserved", label: "Reserved (open orders)" }, { key: "available", label: "Available" },
  { key: "unit", label: "Unit" }, { key: "min_qty", label: "Minimum" }, { key: "avg_cost", label: "Average cost" }, { key: "value", label: "Stock value" }, { key: "status_label", label: "Status" },
];
const COLUMNS: Record<Tab, { key: string; label: string }[]> = {
  current: STOCK_COLUMNS, low: STOCK_COLUMNS, out: STOCK_COLUMNS,
  slow: [...STOCK_COLUMNS.slice(0, 6), { key: "sold_qty", label: "Sold in range" }, { key: "last_sale", label: "Last sale" }, { key: "unit", label: "Unit" }, { key: "value", label: "Stock value" }],
  fast: [...STOCK_COLUMNS.slice(0, 6), { key: "sold_qty", label: "Sold in range" }, { key: "last_sale", label: "Last sale" }, { key: "unit", label: "Unit" }, { key: "value", label: "Stock value" }],
  ageing: [...STOCK_COLUMNS.slice(0, 6), { key: "unit", label: "Unit" }, { key: "last_in", label: "Last stock in" }, { key: "age_days", label: "Age (days)" }, { key: "value", label: "Stock value" }],
  movement: [
    { key: "created_at", label: "Date and time" }, { key: "code", label: "SKU code" }, { key: "item_name", label: "Item name" }, { key: "place_name", label: "Warehouse" },
    { key: "type_label", label: "Type" }, { key: "delta", label: "Quantity (+in / -out)" }, { key: "unit", label: "Unit" }, { key: "reference", label: "Reference" }, { key: "reason", label: "Reason" }, { key: "by_name", label: "By" },
  ],
  location: [{ key: "place_name", label: "Warehouse" }, { key: "items", label: "Items" }, { key: "qty", label: "Quantity" }, { key: "value", label: "Stock value" }, { key: "low", label: "Low stock lines" }, { key: "out", label: "Out of stock lines" }],
};

// CSV download of the chosen tab with the same filters as the screen (at most 5000 rows). Opens in Excel.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "reports.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "current";
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const location = z.uuid().safeParse(sp.get("location")).data ?? null;
  const status = (STATUS_FILTERS as readonly string[]).includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const type = (MOVE_TYPES as readonly string[]).includes(sp.get("type") ?? "") ? sp.get("type") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("inventory_report", { p_tab: tab, p_q: q || null, p_category: category, p_location: location, p_status: status, p_type: type, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
  const rows = raw.map((r) => ({ ...r, status_label: STATUS_LABEL[r.status as string] ?? r.status, type_label: MOVE_LABEL[r.typ as string] ?? r.typ }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS[tab]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-inventory-${TAB_LABEL[tab].toLowerCase().replace(/[^a-z]+/g, "-")}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
