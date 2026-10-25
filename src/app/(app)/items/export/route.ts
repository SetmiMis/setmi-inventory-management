import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const COLUMNS = [
  { key: "code", label: "SKU code" },
  { key: "name", label: "Product name" },
  { key: "selling_item_name", label: "Selling name (bill)" },
  { key: "category", label: "Category" },
  { key: "unit", label: "Unit" },
  { key: "qty", label: "Current stock" },
  { key: "reorder", label: "Reorder level" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "price", label: "Selling price" },
];

// CSV download of the product list with the same filters as the screen (at most 5000 rows).
// The database function checks items.view again and applies the row rules.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "items.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const source = ["LOCAL", "IMPORT"].includes(sp.get("source") ?? "") ? sp.get("source") : null;
  const status = ["in", "low", "out", "inactive"].includes(sp.get("status") ?? "") ? sp.get("status") : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("items_page", {
    p_q: q || null, p_category: category, p_source: source, p_status: status, p_limit: 100, p_offset: 0,
  });
  if (error || !data) return new Response("Could not build the file", { status: 500 });

  // The database function returns at most 100 rows per call: ask page by page, up to 5000 rows.
  const rows = [...((data as { rows: Record<string, unknown>[] }).rows ?? [])];
  const total = Number((data as { total: number }).total ?? 0);
  for (let offset = 100; offset < Math.min(total, 5000); offset += 100) {
    const next = await supabase.rpc("items_page", {
      p_q: q || null, p_category: category, p_source: source, p_status: status, p_limit: 100, p_offset: offset,
    });
    if (next.error) return new Response("Could not build the file", { status: 500 });
    rows.push(...(((next.data as { rows: Record<string, unknown>[] }).rows) ?? []));
  }

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-products-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
