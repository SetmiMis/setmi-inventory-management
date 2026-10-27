import { redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { REASONS, REASON_LABEL, RESOLUTION_LABEL, STATUSES, STATUS_LABEL } from "@/lib/validation/returns";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "return_no", label: "Return ID" },
  { key: "order_no", label: "Order no." },
  { key: "return_date", label: "Return date" },
  { key: "customer_name", label: "Customer" },
  { key: "channel_label", label: "Channel" },
  { key: "items", label: "Items" },
  { key: "reason_label", label: "Reason" },
  { key: "status_label", label: "Status" },
  { key: "resolution_label", label: "Refund / Replacement" },
  { key: "pickup_awb", label: "Pickup AWB" },
  { key: "place_name", label: "Returned to" },
];

// CSV download of the returns with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "returns.view") || can(user, "returns.manage") || can(user, "returns.approve"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const reason = (REASONS as readonly string[]).includes(sp.get("reason") ?? "") ? sp.get("reason") : null;
  const status = (STATUSES as readonly string[]).includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const channel = (CHANNELS as readonly string[]).includes(sp.get("channel") ?? "") ? sp.get("channel") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("returns_page", { p_q: q || null, p_reason: reason, p_status: status, p_channel: channel, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
    ...r, channel_label: CHANNEL_LABEL[r.channel as string] ?? r.channel, reason_label: REASON_LABEL[r.reason as string] ?? r.reason,
    status_label: STATUS_LABEL[r.status as string] ?? r.status, resolution_label: r.resolution ? (RESOLUTION_LABEL[r.resolution as string] ?? r.resolution) : "",
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-returns-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
