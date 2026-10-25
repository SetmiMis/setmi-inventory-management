import Link from "next/link";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass, inputClass, primaryButton } from "@/lib/ui";
import { ReorderTable, type ReorderRow } from "./reorder-table";
import { friendlyDbError } from "@/lib/db-errors";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY_CHOICES = [30, 60, 90] as const;

// What to order and how much: the shop sheet's reorder "science", done from the real stock ledger.
export default async function ReorderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("stock.view");
  if (!can(user, "items.view")) {
    return <p role="status" className="rounded border border-amber-500 p-3 text-sm">The reorder list also needs the items.view permission. Ask your administrator.</p>;
  }
  const sp = await searchParams;
  const daysRaw = Number(first(sp.days));
  const days = (DAY_CHOICES as readonly number[]).includes(daysRaw) ? daysRaw : 30;
  const showAll = first(sp.all) === "1";
  const myLocations = await getMyLocations(user);
  const current = await getCurrentLocation(user);
  // Default: the working place. "all" = every place I can see.
  const placeParam = first(sp.place);
  const placeId = placeParam === "all" ? null : (z.uuid().safeParse(placeParam).data ?? current?.id ?? null);

  const supabase = await createClient();
  const [{ data, error }, { data: suppliers }] = await Promise.all([
    supabase.rpc("reorder_suggestions", { p_location: placeId, p_days: days }),
    can(user, "purchase.create") ? supabase.from("suppliers").select("id, name").eq("is_active", true).order("name") : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const all = (data ?? []) as ReorderRow[];
  const rows = showAll ? all : all.filter((r) => Number(r.suggested) > 0);
  const toOrder = all.filter((r) => Number(r.suggested) > 0).length;
  const noPlan = all.filter((r) => r.target === null && Number(r.consumed) > 0).length;

  return (
    <main className="space-y-5">
      <div>
        <h1>Reorder</h1>
        <p className="mt-1 text-sm text-muted">
          Target = average daily use x lead time x safety factor (or the manual maximum). Order = target minus what is in stock, on order and on the way, rounded up to the MOQ.
        </p>
      </div>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-3`}>
        <div>
          <label htmlFor="place" className="block text-sm font-medium">Place</label>
          <select id="place" name="place" defaultValue={placeId ?? "all"} className={`${inputClass} w-56`}>
            <option value="all">All my places</option>
            {myLocations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="days" className="block text-sm font-medium">Average use over</label>
          <select id="days" name="days" defaultValue={String(days)} className={`${inputClass} w-36`}>
            {DAY_CHOICES.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="all" value="1" defaultChecked={showAll} /> Show items with nothing to order
        </label>
        <button type="submit" className={primaryButton}>Show</button>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>
      ) : (
        <>
          <p className="text-sm">
            <strong>{toOrder}</strong> item{toOrder === 1 ? "" : "s"} to order.
            {noPlan > 0 && <> <strong>{noPlan}</strong> item{noPlan === 1 ? " is" : "s are"} used but {noPlan === 1 ? "has" : "have"} no lead time yet: open the item and fill &quot;Reorder planning&quot;, or set a maximum on the <Link href="/stock">Stock</Link> page.</>}
            {!can(user, "purchase.view") && !can(user, "purchase.create") && !can(user, "purchase.approve") && <span className="text-muted"> (Open purchase orders are not counted for you: no purchase permission.)</span>}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">Nothing to order for these choices.</p>
          ) : (
            // The key resets the ticks whenever the filters change, so ticks from another place can never be sent.
            <ReorderTable key={`${placeId ?? "all"}-${days}-${showAll ? 1 : 0}`} rows={rows} days={days} canCreate={can(user, "purchase.create")} placeId={placeId} suppliers={suppliers ?? []} />
          )}
        </>
      )}
    </main>
  );
}
