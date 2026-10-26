import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUSES = ["IN", "LOW", "OUT", "OVER"];
const LABEL: Record<string, string> = { IN: "In stock", LOW: "Low stock", OUT: "Out of stock", OVER: "Over stocked" };

// CSV download of the stock lines with the same filters as the screen (at most 5000 rows).
// Average cost and value are filled only for people who may see buying prices.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "stock.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status") : null;

  const columns = [
    { key: "code", label: "SKU code" },
    { key: "item_name", label: "Item name" },
    { key: "category_name", label: "Category" },
    { key: "place_name", label: "Warehouse" },
    { key: "rack", label: "Rack" },
    { key: "unit", label: "Unit" },
    { key: "qty", label: "Current stock" },
    { key: "min_qty", label: "Min stock" },
    { key: "max_qty", label: "Max stock" },
    ...(can(user, "receipts.cost") ? [{ key: "avg_cost", label: "Average cost" }, { key: "value", label: "Stock value" }] : []),
    { key: "status_label", label: "Status" },
  ];

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("current_stock_page", { p_q: q || null, p_category: category, p_location: place, p_status: status, p_limit: 100, p_offset: offset });
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
  const rows = raw.map((r) => ({ ...r, status_label: LABEL[r.status as string] ?? r.status }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-current-stock-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
