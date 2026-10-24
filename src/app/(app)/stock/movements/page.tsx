import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";
import { secondaryButton } from "@/lib/ui";

const PAGE_SIZE = 50;
type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Movement = {
  id: number; quantity: number; movement_type: string; reason: string | null; reference: string | null; created_at: string;
  from_location_id: string | null; to_location_id: string | null;
  items: { internal_item_code: string; item_name: string; unit: string } | null;
  from_loc: { code: string } | null; to_loc: { code: string } | null;
};

// The history ("moves history" in Odoo's words) of the place you work in: every movement that
// came in or went out, newest first. Nothing on this page can be edited; the ledger is append-only.
export default async function MovementsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("stock.view");
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;

  const sp = await searchParams;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 10000);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const { data, count, error } = await supabase
    .from("stock_movements")
    .select(
      "id, quantity, movement_type, reason, reference, created_at, from_location_id, to_location_id, " +
        "items(internal_item_code, item_name, unit), " +
        "from_loc:locations!stock_movements_from_location_id_fkey(code), to_loc:locations!stock_movements_to_location_id_fkey(code)",
      { count: "exact" },
    )
    .or(`from_location_id.eq.${loc.id},to_location_id.eq.${loc.id}`)
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as Movement[];
  const total = count ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/stock" className="text-blue-700 underline">Stock</Link> / History</p>
      <h1 className="text-xl font-semibold">Stock history of {loc.name}</h1>
      {error ? (
        <p role="alert" className="text-red-600">Could not load history.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm">No stock movement here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-3">When</th><th className="pr-3">Item</th><th className="pr-3">What</th>
                <th className="pr-3 text-right">Change</th><th className="pr-3">With</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const incoming = m.to_location_id === loc.id;
                const other = incoming ? (m.from_loc?.code ?? "Outside") : (m.to_loc?.code ?? "Outside / loss");
                return (
                  <tr key={m.id} className="border-b border-neutral-200">
                    <td className="py-2 pr-3 whitespace-nowrap">{when(m.created_at)}</td>
                    <td className="pr-3">{m.items?.internal_item_code}<span className="block text-xs text-neutral-500">{m.items?.item_name}</span></td>
                    <td className="pr-3">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
                    <td className={`pr-3 text-right font-mono ${incoming ? "text-green-700" : "text-red-600"}`}>
                      {incoming ? "+" : "-"}{Number(m.quantity)} {m.items?.unit}
                    </td>
                    <td className="pr-3">{other}</td>
                    <td>{m.reason ?? m.reference ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <nav className="flex items-center gap-3 text-sm" aria-label="Pagination">
        <span>{total} movement{total === 1 ? "" : "s"}. Page {page} of {lastPage}.</span>
        {page > 1 && <Link href={`/stock/movements?page=${page - 1}`} className={secondaryButton}>Previous</Link>}
        {page < lastPage && <Link href={`/stock/movements?page=${page + 1}`} className={secondaryButton}>Next</Link>}
      </nav>
    </main>
  );
}
