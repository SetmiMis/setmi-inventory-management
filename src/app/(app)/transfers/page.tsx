import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/badge";
import { can, requireAnyPermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

const PAGE_SIZE = 25;
type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Row = {
  id: string; transfer_no: string; status: string; from_code: string; to_code: string; from_name: string; to_name: string;
  has_shortage: boolean; created_at: string; stock_transfer_lines: { count: number }[];
};
const LABEL: Record<string, string> = { DRAFT: "Draft", SENT: "On the way", RECEIVED: "Received", CANCELLED: "Cancelled" };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("transfers.view", "transfers.create", "transfers.send", "transfers.receive");
  const loc = await getCurrentLocation(user);
  const sp = await searchParams;
  const status = ["DRAFT", "SENT", "RECEIVED", "CANCELLED"].includes(first(sp.status) ?? "") ? first(sp.status)! : "";
  const dir = ["out", "in"].includes(first(sp.dir) ?? "") ? first(sp.dir)! : "";
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("stock_transfers")
    .select("id, transfer_no, status, from_code, to_code, from_name, to_name, has_shortage, created_at, stock_transfer_lines(count)", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (loc && dir === "out") query = query.eq("from_location_id", loc.id);
  if (loc && dir === "in") query = query.eq("to_location_id", loc.id);
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/transfers?${new URLSearchParams({ ...(status ? { status } : {}), ...(dir ? { dir } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transfers</h1>
        {can(user, "transfers.create") && loc && <Link href="/transfers/new" className={primaryButton}>New transfer from {loc.code}</Link>}
      </div>
      <form method="get" className="flex flex-wrap items-center gap-3">
        <select name="status" defaultValue={status} aria-label="Status" className={`${inputClass} !mt-0 w-44`}>
          <option value="">All</option><option value="DRAFT">Draft</option><option value="SENT">On the way</option><option value="RECEIVED">Received</option><option value="CANCELLED">Cancelled</option>
        </select>
        <select name="dir" defaultValue={dir} aria-label="Direction" className={`${inputClass} !mt-0 w-56`}>
          <option value="">From and to my places</option>
          <option value="out">Leaving {loc?.code ?? "my place"}</option>
          <option value="in">Arriving at {loc?.code ?? "my place"}</option>
        </select>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>
      {error ? <p role="alert" className="text-red-600">Could not load transfers.</p> : rows.length === 0 ? <EmptyState icon={ArrowLeftRight} title="No transfers yet" text="A transfer moves goods from one warehouse or shop to another, and shows them as on the way until they arrive." actionHref="/transfers/new" actionLabel="New transfer" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Number</th><th className="pr-3">From</th><th className="pr-3">To</th><th className="pr-3 text-right">Lines</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-200">
                  <td className="py-2 pr-3"><Link href={`/transfers/${r.id}`} className="font-medium text-blue-700 underline">{r.transfer_no}</Link></td>
                  <td className="pr-3">{r.from_name} ({r.from_code})</td><td className="pr-3">{r.to_name} ({r.to_code})</td>
                  <td className="pr-3 text-right">{r.stock_transfer_lines?.[0]?.count ?? 0}</td>
                  <td><Badge tone={r.status === "SENT" ? "amber" : r.status === "RECEIVED" ? "green" : "gray"}>
                    {LABEL[r.status]}{r.has_shortage ? " (shortage)" : ""}
                  </Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} transfer{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={link(page - 1)} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={link(page + 1)} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
