import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/badge";
import { can, requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "./status";

const PAGE_SIZE = 25;
const STATUSES = ["DRAFT", "SENT", "PARTIAL", "COMPLETED", "CANCELLED"];
type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Row = {
  id: string; po_no: string; order_date: string; expected_date: string | null; status: string;
  suppliers: { name: string } | null; locations: { code: string } | null; purchase_order_lines: { count: number }[];
};

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("purchase.view", "purchase.create", "purchase.approve");
  const sp = await searchParams;
  const status = STATUSES.includes(first(sp.status) ?? "") ? first(sp.status)! : "";
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, expected_date, status, suppliers(name), locations(code), purchase_order_lines(count)", { count: "exact" });
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/purchase-orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Purchase orders</h1>
        {can(user, "purchase.create") && <Link href="/purchase-orders/new" className={primaryButton}><Plus size={16} aria-hidden /> New order</Link>}
      </div>
      <form method="get" className="flex items-center gap-3">
        <select name="status" defaultValue={status} aria-label="Status" className={`${inputClass} !mt-0 w-44`}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}
        </select>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>
      {error ? (
        <p role="alert" className="text-red-600">Could not load purchase orders.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm">No purchase orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>
              <th>Number</th><th>Date</th><th>Supplier</th><th>For</th><th>Expected</th><th className="text-right">Lines</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const late = r.expected_date && r.expected_date < today && (r.status === "SENT" || r.status === "PARTIAL");
                return (
                  <tr key={r.id} className="border-b border-line">
                    <td><Link href={`/purchase-orders/${r.id}`}>{r.po_no}</Link></td>
                    <td>{r.order_date}</td><td>{r.suppliers?.name}</td><td>{r.locations?.code}</td>
                    <td>{r.expected_date ?? ""}{late ? <> <Badge tone="red">Late</Badge></> : null}</td>
                    <td className="text-right">{r.purchase_order_lines?.[0]?.count ?? 0}</td>
                    <td><Badge tone={PO_STATUS_TONE[r.status] ?? "gray"}>{PO_STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} order{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={link(page - 1)} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={link(page + 1)} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
