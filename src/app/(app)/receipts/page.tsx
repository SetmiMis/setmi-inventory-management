import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PackageCheck } from "lucide-react";
import { Badge } from "@/components/badge";
import { can, requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

const PAGE_SIZE = 25;
type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Row = {
  id: string; receipt_no: string; receipt_date: string; status: string; supplier_invoice_no: string | null;
  suppliers: { name: string } | null; locations: { code: string; name: string } | null; goods_receipt_lines: { count: number }[];
};

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("receipts.view", "receipts.create", "receipts.post");
  const sp = await searchParams;
  const status = ["DRAFT", "POSTED", "CANCELLED"].includes(first(sp.status) ?? "") ? first(sp.status)! : "";
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("goods_receipts")
    .select("id, receipt_no, receipt_date, status, supplier_invoice_no, suppliers(name), locations(code, name), goods_receipt_lines(count)", { count: "exact" });
  if (status) query = query.eq("status", status);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/receipts?${new URLSearchParams({ ...(status ? { status } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Goods receipts</h1>
        {can(user, "receipts.create") && <Link href="/receipts/new" className={primaryButton}>New receipt</Link>}
      </div>
      <form method="get" className="flex items-center gap-3">
        <select name="status" defaultValue={status} aria-label="Status" className={`${inputClass} !mt-0 w-44`}>
          <option value="">All</option><option value="DRAFT">Draft</option><option value="POSTED">Posted</option><option value="CANCELLED">Cancelled</option>
        </select>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>
      {error ? (
        <p role="alert" className="text-red-600">Could not load receipts.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No receipts yet" text="A receipt records goods that arrived. Stock goes up when you post it." actionHref={can(user, "receipts.create") ? "/receipts/new" : undefined} actionLabel="New receipt" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300">
              <th className="py-2 pr-3">Number</th><th className="pr-3">Date</th><th className="pr-3">Supplier</th><th className="pr-3">Invoice</th>
              <th className="pr-3">Into</th><th className="pr-3 text-right">Lines</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-200">
                  <td className="py-2 pr-3"><Link href={`/receipts/${r.id}`} className="font-medium text-blue-700 underline">{r.receipt_no}</Link></td>
                  <td className="pr-3">{r.receipt_date}</td><td className="pr-3">{r.suppliers?.name}</td><td className="pr-3">{r.supplier_invoice_no ?? ""}</td>
                  <td className="pr-3">{r.locations?.code}</td><td className="pr-3 text-right">{r.goods_receipt_lines?.[0]?.count ?? 0}</td>
                  <td><Badge tone={r.status === "POSTED" ? "green" : r.status === "CANCELLED" ? "gray" : "amber"}>{r.status === "DRAFT" ? "Draft" : r.status === "POSTED" ? "Posted" : "Cancelled"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} receipt{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={link(page - 1)} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={link(page + 1)} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
