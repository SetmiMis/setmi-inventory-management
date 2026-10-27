import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, STATUS_LABEL, TABS, TAB_LABEL, type Tab } from "@/lib/validation/purchase-report";
import { sanitizeSearch } from "@/lib/validation/item";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS: Record<Tab, { key: string; label: string }[]> = {
  orders: [
    { key: "po_no", label: "PO no." }, { key: "order_date", label: "PO date" }, { key: "sname", label: "Supplier" }, { key: "category_name", label: "Category" }, { key: "items", label: "Items" },
    { key: "value", label: "PO value" }, { key: "received_value", label: "Received (at order price)" }, { key: "pending_value", label: "Pending" }, { key: "expected_date", label: "Expected delivery" }, { key: "status_label", label: "Status" },
  ],
  grn: [
    { key: "receipt_no", label: "GRN no." }, { key: "receipt_date", label: "Receipt date" }, { key: "supplier_invoice_no", label: "Supplier invoice" }, { key: "sname", label: "Supplier" }, { key: "lname", label: "Warehouse" },
    { key: "items", label: "Items" }, { key: "qty", label: "Quantity" }, { key: "value", label: "Value" },
  ],
  pending: [
    { key: "po_no", label: "PO no." }, { key: "order_date", label: "PO date" }, { key: "sname", label: "Supplier" }, { key: "items", label: "Items" }, { key: "qty", label: "Ordered qty" },
    { key: "recv_qty", label: "Received qty" }, { key: "pending_value", label: "Pending value" }, { key: "expected_date", label: "Expected delivery" }, { key: "days_late", label: "Days late" }, { key: "status_label", label: "Status" },
  ],
  supplier: [
    { key: "sname", label: "Supplier" }, { key: "pos", label: "Orders" }, { key: "items", label: "Lines" }, { key: "qty", label: "Quantity" }, { key: "value", label: "PO value" },
    { key: "received_value", label: "Received (at order price)" }, { key: "pending_value", label: "Pending" },
  ],
  category: [
    { key: "category_name", label: "Category" }, { key: "pos", label: "Orders" }, { key: "items", label: "Items" }, { key: "qty", label: "Quantity" }, { key: "recv_qty", label: "Received qty" },
    { key: "value", label: "PO value" }, { key: "received_value", label: "Received (at order price)" },
  ],
  item: [
    { key: "code", label: "SKU code" }, { key: "item_name", label: "Item name" }, { key: "category_name", label: "Category" }, { key: "unit", label: "Unit" }, { key: "pos", label: "Orders" },
    { key: "qty", label: "Quantity" }, { key: "recv_qty", label: "Received qty" }, { key: "avg_rate", label: "Average rate" }, { key: "value", label: "PO value" },
  ],
  monthly: [
    { key: "month", label: "Month" }, { key: "pos", label: "Orders" }, { key: "suppliers", label: "Suppliers" }, { key: "qty", label: "Quantity" }, { key: "value", label: "PO value" }, { key: "received_value", label: "Received (at order price)" },
  ],
  comparative: [{ key: "metric", label: "Measure" }, { key: "current", label: "This period" }, { key: "previous", label: "Previous period" }],
};

// CSV download of the chosen tab with the same filters as the screen (at most 5000 rows). Opens in Excel.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !can(user, "reports.view")) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "orders";
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const supplier = z.uuid().safeParse(sp.get("supplier")).data ?? null;
  const category = z.uuid().safeParse(sp.get("category")).data ?? null;
  const location = z.uuid().safeParse(sp.get("location")).data ?? null;
  const status = (STATUSES as readonly string[]).includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("purchase_report", { p_tab: tab, p_q: q || null, p_supplier: supplier, p_category: category, p_status: status, p_location: location, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
  const first = await call(0);
  if (first.error || !first.data) return new Response("Could not build the file", { status: 500 });
  type R = Record<string, unknown>;
  const raw = [...(((first.data as { rows: R[] }).rows) ?? [])];
  const total = Number((first.data as { total: number }).total ?? 0);
  if (tab !== "comparative") {
    for (let offset = 100; offset < Math.min(total, 5000); offset += 100) {
      const next = await call(offset);
      if (next.error) return new Response("Could not build the file", { status: 500 });
      raw.push(...(((next.data as { rows: R[] }).rows) ?? []));
    }
  }
  const rows = raw.map((r) => ({ ...r, status_label: STATUS_LABEL[r.status as string] ?? r.status }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS[tab]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-purchase-${TAB_LABEL[tab].toLowerCase().replace(/[^a-z]+/g, "-")}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
