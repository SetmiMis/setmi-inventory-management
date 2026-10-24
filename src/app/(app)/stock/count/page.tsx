import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";
import { inputClass, secondaryButton } from "@/lib/ui";
import { CountForm, type CountRow } from "./count-form";

const PAGE_SIZE = 50;
type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("stock.adjust");
  const loc = await getCurrentLocation(user);
  if (!loc) {
    return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;
  }
  const sp = await searchParams;
  const q = sanitizeSearch(first(sp.q));
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);

  const supabase = await createClient();
  let query = supabase
    .from("stock_overview")
    .select("item_id, internal_item_code, item_name, unit, quantity", { count: "exact" })
    .eq("location_id", loc.id);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`internal_item_code.ilike.${like},item_name.ilike.${like}`);
  }
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query.order("internal_item_code").range(from, from + PAGE_SIZE - 1);

  const rows: CountRow[] = (data ?? []).map((r) => ({
    itemId: r.item_id as string, code: r.internal_item_code as string, name: r.item_name as string,
    unit: r.unit as string, quantity: Number(r.quantity),
  }));
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => `/stock/count?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`;

  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/stock" className="text-blue-700 underline">Stock</Link> / Count</p>
      <h1 className="text-xl font-semibold">Count stock in {loc.name}</h1>
      <p className="text-sm text-neutral-500">
        Save each page before moving to the next one. Unsaved numbers on a page are lost when you change page or search.
      </p>
      <form method="get" className="flex items-center gap-3">
        <input name="q" defaultValue={q} placeholder="Search code or name" aria-label="Search" className={`${inputClass} !mt-0 max-w-xs`} />
        <button type="submit" className={secondaryButton}>Search</button>
      </form>

      {error ? (
        <p role="alert" className="text-red-600">Could not load items.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm">No items found.</p>
      ) : (
        <CountForm key={`${q}-${page}-${rows.map((r) => r.quantity).join(",").length}`} rows={rows} placeName={loc.name} />
      )}

      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} item{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={link(page - 1)} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={link(page + 1)} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
