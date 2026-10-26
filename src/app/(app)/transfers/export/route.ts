import { redirect } from "next/navigation";
import { z } from "zod";
import { can, getCurrentUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

const STATUSES = ["DRAFT", "SENT", "RECEIVED", "CANCELLED"];
const LABEL: Record<string, string> = { DRAFT: "Draft", SENT: "In transit", RECEIVED: "Completed", CANCELLED: "Cancelled" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const COLUMNS = [
  { key: "transfer_no", label: "Transfer no." },
  { key: "date", label: "Date" },
  { key: "from_name", label: "From warehouse" },
  { key: "to_name", label: "To warehouse" },
  { key: "items", label: "Items" },
  { key: "qty", label: "Total qty sent" },
  { key: "status_label", label: "Status" },
  { key: "requested_by", label: "Requested by" },
];

// CSV download of the transfers with the same filters as the screen (at most 5000 rows).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive || !(can(user, "transfers.view") || can(user, "transfers.create") || can(user, "transfers.send") || can(user, "transfers.receive"))) return new Response("Not allowed", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const q = sanitizeSearch(sp.get("q") ?? undefined);
  const fromLoc = z.uuid().safeParse(sp.get("fromp")).data ?? null;
  const toLoc = z.uuid().safeParse(sp.get("top")).data ?? null;
  const status = STATUSES.includes(sp.get("status") ?? "") ? sp.get("status") : null;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from") : null;
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to") : null;

  const supabase = await createClient();
  const call = (offset: number) => supabase.rpc("transfers_page", { p_q: q || null, p_from_location: fromLoc, p_to_location: toLoc, p_status: status, p_from: from, p_to: to, p_limit: 100, p_offset: offset });
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
    date: new Date(r.created_at as string).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    status_label: `${LABEL[r.status as string] ?? r.status}${r.has_shortage ? " (shortage)" : ""}`,
  }));

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Response(toCsv(rows, COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="setmi-stock-transfers-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
