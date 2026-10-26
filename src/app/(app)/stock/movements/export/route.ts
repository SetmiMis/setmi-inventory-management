import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const TYPES = ["RECEIPT", "SALE", "SALE_RETURN", "TRANSFER", "TRANSFER_SHORTAGE", "ADJUSTMENT", "OPENING", "STOCK_OUT"];
const LABEL: Record<string, string> = {
  RECEIPT: "Inward", SALE: "Sale", SALE_RETURN: "Return", TRANSFER: "Transfer", TRANSFER_SHORTAGE: "Lost in transit", ADJUSTMENT: "Adjustment", OPENING: "Opening", STOCK_OUT: "Stock out",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "when", label: "Date and time" },
  { key: "type_label", label: "Type" },
  { key: "reference", label: "Reference no." },
  { key: "code", label: "SKU code" },
  { key: "item_name", label: "Item name" },
  { key: "place_name", label: "Warehouse" },
  { key: "in_qty", label: "In qty" },
  { key: "out_qty", label: "Out qty" },
  { key: "balance", label: "Balance" },
  { key: "user_name", label: "User" },
  { key: "reason", label: "Remarks" },
];

// CSV download of the stock ledger with the same filters as the screen (at most 5000 lines).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "stock.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const place = z.uuid().safeParse(sp.get("place")).data ?? null;
  const type = TYPES.includes(sp.get("type") ?? "") ? sp.get("type") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("stock_ledger_page", { p_q: q || null, p_category: category, p_location: place, p_type: type, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
    type_label: LABEL[r.typ as string] ?? r.typ,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-stock-ledger-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
