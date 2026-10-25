import Link from "next/link";
import { can, requireAnyPermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

type Row = { id: string; bill_no: string; created_at: string; status: string; payment_mode: string; customer_name: string | null; total: number };

// Bills of the place you work in, for one day (India time). The list stays available while
// billing is switched off, so old bills can still be seen and voided.
export default async function BillsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("bills.view", "bills.create", "bills.void");
  const loc = await getCurrentLocation(user);
  const sp = await searchParams;
  const rawDate = first(sp.date) ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(Date.parse(rawDate)) ? rawDate : today();
  const enabled = await isBillingEnabled();

  let rows: Row[] = [];
  let failed = false;
  if (loc) {
    const supabase = await createClient();
    const start = new Date(`${date}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 24 * 3600 * 1000);
    const { data, error } = await supabase
      .from("bills")
      .select("id, bill_no, created_at, status, payment_mode, customer_name, total")
      .eq("location_id", loc.id)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);
    failed = Boolean(error);
    rows = (data ?? []) as unknown as Row[];
  }
  const done = rows.filter((r) => r.status === "COMPLETED");
  const sum = done.reduce((s, r) => s + Number(r.total), 0);
  const byMode = new Map<string, number>();
  for (const r of done) byMode.set(r.payment_mode, (byMode.get(r.payment_mode) ?? 0) + Number(r.total));

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Bills{loc ? ` at ${loc.name}` : ""}</h1>
        {enabled && can(user, "bills.create") && <Link href="/billing" className={primaryButton}>New bill</Link>}
      </div>
      {!enabled && <p role="status" className="rounded border border-amber-500 p-2 text-sm">Billing is switched OFF: no new bills can be made here.</p>}
      {!loc ? <p className="text-sm">You are not assigned to a place.</p> : (
        <>
          <form method="get" className="flex items-center gap-3">
            <input type="date" name="date" defaultValue={date} aria-label="Date" className={`${inputClass} !mt-0 w-44`} />
            <button type="submit" className={secondaryButton}>Show</button>
          </form>
          {failed ? <p role="alert" className="text-red-600">Could not load bills.</p> : rows.length === 0 ? <p className="text-sm">No bills on {date}.</p> : (
            <>
              <p className="text-sm">
                {done.length} bill{done.length === 1 ? "" : "s"}, total <strong>{sum.toFixed(2)}</strong>
                {[...byMode.entries()].map(([m, v]) => ` | ${m} ${v.toFixed(2)}`).join("")}. Voided bills are not counted.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Bill</th><th className="pr-3">Time</th><th className="pr-3">Customer</th><th className="pr-3">Payment</th><th className="pr-3 text-right">Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-neutral-200">
                        <td className="py-2 pr-3"><Link href={`/bills/${r.id}`} className="font-medium text-blue-700 underline">{r.bill_no}</Link></td>
                        <td className="pr-3">{new Date(r.created_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="pr-3">{r.customer_name ?? ""}</td><td className="pr-3">{r.payment_mode}</td>
                        <td className="pr-3 text-right font-mono">{Number(r.total).toFixed(2)}</td>
                        <td className={r.status === "VOIDED" ? "text-neutral-500 line-through" : ""}>{r.status === "VOIDED" ? "Voided" : "Done"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
