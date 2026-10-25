import Link from "next/link";
import { Badge } from "@/components/badge";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";
import { LevelForm } from "./level-form";

const PAGE_SIZE = 50;
type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Row = {
  item_id: string; internal_item_code: string; item_name: string; unit: string;
  quantity: number; min_qty: number | null; max_qty: number | null; is_low: boolean;
};

export default async function StockPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("stock.view");
  const loc = await getCurrentLocation(user);
  if (!loc) {
    return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet. Ask an administrator.</p>;
  }

  const sp = await searchParams;
  const q = sanitizeSearch(first(sp.q));
  const lowOnly = first(sp.low) === "1";
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);

  const supabase = await createClient();
  let query = supabase
    .from("stock_overview")
    .select("item_id, internal_item_code, item_name, unit, quantity, min_qty, max_qty, is_low", { count: "exact" })
    .eq("location_id", loc.id);
  if (lowOnly) query = query.eq("is_low", true);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like}`);
  }
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("internal_item_code").range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];

  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lowOnly) params.set("low", "1");
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/stock?${s}` : "/stock";
  };
  const canLevels = can(user, "stock.min_levels");

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stock in {loc.name}</h1>
          <p className="text-sm text-neutral-500">{loc.type === "SHOP" ? "Shop" : "Warehouse"} {loc.code}. Change the place from the header.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/movements" className={secondaryButton}>History</Link>
          {can(user, "items.view") && <Link href="/reorder" className={secondaryButton}>Reorder</Link>}
          {can(user, "stock.entry") && <Link href="/stock/entry" className={secondaryButton}>Quick Stock In / Out</Link>}
          {can(user, "stock.adjust") && <Link href="/stock/scan" className={secondaryButton}>Count by scanning</Link>}
          {can(user, "stock.adjust") && <Link href="/stock/count" className={primaryButton}>Count stock</Link>}
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <input name="q" defaultValue={q} placeholder="Search code or name" aria-label="Search" className={`${inputClass} !mt-0 max-w-xs`} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={lowOnly} /> Low stock only
        </label>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>

      {error ? (
        <p role="alert" className="text-red-600">Could not load stock.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm">{lowOnly ? "No item is below its minimum." : "No items found. Add items first, then count stock."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-3">Code</th><th className="pr-3">Item</th><th className="pr-3 text-right">In stock</th>
                <th className="pr-3">Unit</th><th className="pr-3">Level (min / max)</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id} className="border-b border-neutral-200">
                  <td className="py-2 pr-3"><Link href={`/items/${r.item_id}`} className="font-medium text-blue-700 underline">{r.internal_item_code}</Link></td>
                  <td className="pr-3">{r.item_name}</td>
                  <td className="pr-3 text-right font-mono">{Number(r.quantity)}</td>
                  <td className="pr-3">{r.unit}</td>
                  <td className="pr-3">
                    {canLevels ? <LevelForm itemId={r.item_id} min={r.min_qty === null ? null : Number(r.min_qty)} max={r.max_qty === null ? null : Number(r.max_qty)} />
                      : r.min_qty === null ? "-" : `${Number(r.min_qty)} / ${r.max_qty === null ? "-" : Number(r.max_qty)}`}
                  </td>
                  <td>{r.is_low ? <Badge tone="red">Low</Badge> : Number(r.quantity) === 0 ? <Badge tone="gray">None</Badge> : <Badge tone="green">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} item{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={link(page - 1)} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={link(page + 1)} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
