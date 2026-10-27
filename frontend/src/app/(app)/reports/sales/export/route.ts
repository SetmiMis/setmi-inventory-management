import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from "@/lib/validation/customer";
import { STATUS_LABEL as DISPATCH_LABEL } from "@/lib/validation/dispatch";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { TABS, TAB_LABEL, type Tab } from "@/lib/validation/sales-report";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS: Record<Tab, { key: string; label: string }[]> = {
  orders: [
    { key: "order_no", label: "Order ID" }, { key: "order_date", label: "Order date" }, { key: "cname", label: "Customer" }, { key: "channel_label", label: "Channel" }, { key: "items", label: "Items" },
    { key: "value", label: "Order value" }, { key: "discount", label: "Discount" }, { key: "net", label: "Net value" }, { key: "dispatch_label", label: "Dispatch status" }, { key: "returns", label: "Returns" },
  ],
  product: [
    { key: "code", label: "SKU code" }, { key: "item_name", label: "Item name" }, { key: "category_name", label: "Category" }, { key: "unit", label: "Unit" }, { key: "orders", label: "Orders" },
    { key: "qty", label: "Quantity sold" }, { key: "avg_rate", label: "Average rate" }, { key: "value", label: "Sales value" },
  ],
  channel: [
    { key: "channel_label", label: "Channel" }, { key: "orders", label: "Orders" }, { key: "customers", label: "Customers" }, { key: "qty", label: "Items sold" }, { key: "value", label: "Order value" },
    { key: "discount", label: "Discount" }, { key: "net", label: "Net sales" },
  ],
  customer: [
    { key: "cname", label: "Customer" }, { key: "type_label", label: "Type" }, { key: "city", label: "City" }, { key: "orders", label: "Orders" }, { key: "qty", label: "Items sold" },
    { key: "net", label: "Net sales" }, { key: "last_order", label: "Last order" },
  ],
  city: [{ key: "city", label: "City" }, { key: "orders", label: "Orders" }, { key: "customers", label: "Customers" }, { key: "qty", label: "Items sold" }, { key: "net", label: "Net sales" }],
  monthly: [
    { key: "month", label: "Month" }, { key: "orders", label: "Orders" }, { key: "customers", label: "Customers" }, { key: "qty", label: "Items sold" }, { key: "value", label: "Order value" },
    { key: "discount", label: "Discount" }, { key: "net", label: "Net sales" },
  ],
  comparison: [{ key: "metric", label: "Measure" }, { key: "current", label: "This period" }, { key: "previous", label: "Previous period" }],
};

// CSV download of the chosen tab with the same filters as the screen (at most 5000 rows). Opens in Excel.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "reports.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "orders";
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const channel = (CHANNELS as readonly string[]).includes(sp.get("channel") ?? "") ? sp.get("channel") : null;
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const ctype = (CUSTOMER_TYPES as readonly string[]).includes(sp.get("ctype") ?? "") ? sp.get("ctype") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("sales_report", { p_tab: tab, p_q: q || null, p_channel: channel, p_category: category, p_ctype: ctype, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
  const first = await call(0);
  if (first.error || !first.data) return new Response("Could not build the file", { status: 500 });
  type R = Record<string, unknown>;
  const raw = [...(((first.data as { rows: R[] }).rows) ?? [])];
  const total = Number((first.data as { total: number }).total ?? 0);
  if (tab !== "comparison") {
    for (let offset = 100; offset < Math.min(total, 5000); offset += 100) {
      const next = await call(offset);
      if (next.error) return new Response("Could not build the file", { status: 500 });
      raw.push(...(((next.data as { rows: R[] }).rows) ?? []));
    }
  }
  const rows = raw.map((r) => ({
    ...r, channel_label: CHANNEL_LABEL[r.channel as string] ?? r.channel, dispatch_label: DISPATCH_LABEL[r.dispatch_status as string] ?? r.dispatch_status,
    type_label: CUSTOMER_TYPE_LABEL[r.ctype as keyof typeof CUSTOMER_TYPE_LABEL] ?? r.ctype,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS[tab]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-sales-${TAB_LABEL[tab].toLowerCase().replace(/[^a-z]+/g, "-")}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
