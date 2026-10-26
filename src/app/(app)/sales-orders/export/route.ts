import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNELS, CHANNEL_LABEL, ORDER_STATUS_LABEL } from "@/lib/validation/sales-order";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "order_no", label: "Order no." },
  { key: "order_date", label: "Date" },
  { key: "customer_name", label: "Customer" },
  { key: "channel_label", label: "Channel" },
  { key: "place_name", label: "Ships from" },
  { key: "items", label: "Items" },
  { key: "qty", label: "Total qty" },
  { key: "total", label: "Order value" },
  { key: "status_label", label: "Status" },
  { key: "dispatch_date", label: "Dispatch date" },
];

// CSV download of the sales orders with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "sales_orders.view") || can(user, "sales_orders.create") || can(user, "sales_orders.confirm"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const channel = (CHANNELS as readonly string[]).includes(sp.get("channel") ?? "") ? sp.get("channel") : null;
  const status = Object.keys(ORDER_STATUS_LABEL).includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const customer = z.uuid().safeParse(sp.get("customer")).data ?? null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("sales_orders_page", { p_q: q || null, p_channel: channel, p_status: status, p_customer: customer, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
  const rows = raw.map((r) => ({ ...r, channel_label: CHANNEL_LABEL[r.channel as string] ?? r.channel, status_label: ORDER_STATUS_LABEL[r.status as string] ?? r.status }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-sales-orders-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
