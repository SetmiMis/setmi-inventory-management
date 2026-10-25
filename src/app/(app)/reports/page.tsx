import Link from "next/link";
import { Download, Filter } from "lucide-react";
import { can, requirePermission } from "@/lib/auth";
import { getMyLocations } from "@/lib/location";
import { REPORTS, REPORT_KEYS, parseParams, parseReportKey, runReport } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Columns shown with two decimals (rupees). Other numbers are shown as they are.
const MONEY = new Set(["subtotal", "discount", "total", "cash", "upi", "card", "other", "amount"]);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("reports.view");
  const sp = await searchParams;
  const key = parseReportKey(first(sp.r));
  const def = REPORTS[key];
  const params = parseParams((n) => first(sp[n]));

  const supabase = await createClient();
  const [{ rows, error }, myLocations] = await Promise.all([runReport(supabase, key, params), getMyLocations(user)]);

  const query = new URLSearchParams({ r: key });
  if (params.location) query.set("location", params.location);
  if (def.needsDates) {
    query.set("from", params.from);
    query.set("to", params.to);
  }
  if (def.needsDays) query.set("days", String(params.days));

  const fmt = (col: string, v: unknown) => {
    if (v === null || v === undefined) return "";
    if (MONEY.has(col)) return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v)))
      return Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
    return String(v);
  };

  // A small total for the sales-per-day report, so the owner sees the number at a glance.
  const dayTotal = key === "sales-day" ? rows.reduce((s, r) => s + Number(r.total ?? 0), 0) : null;
  const dayBills = key === "sales-day" ? rows.reduce((s, r) => s + Number(r.bills ?? 0), 0) : null;

  return (
    <main className="space-y-5">
      <div>
        <h1>Reports</h1>
        <p className="mt-1 text-sm text-muted">Only the places you work in are included.</p>
      </div>

      <nav aria-label="Reports" className="flex flex-wrap gap-2">
        {REPORT_KEYS.map((k) => (
          <Link
            key={k}
            href={`/reports?r=${k}`}
            aria-current={k === key ? "page" : undefined}
            className={k === key ? primaryButton : secondaryButton}
          >
            {REPORTS[k].title}
          </Link>
        ))}
      </nav>

      <section className={cardClass}>
        <h2 className="text-lg">{def.title}</h2>
        <p className="mb-3 text-sm text-muted">{def.hint}</p>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="r" value={key} />
          <div>
            <label htmlFor="location" className={labelClass}>Place</label>
            <select id="location" name="location" defaultValue={params.location ?? ""} className={`${inputClass} w-56`}>
              <option value="">All my places</option>
              {myLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          {def.needsDates && (
            <>
              <div>
                <label htmlFor="from" className={labelClass}>From</label>
                <input id="from" name="from" type="date" defaultValue={params.from} className={inputClass} />
              </div>
              <div>
                <label htmlFor="to" className={labelClass}>To</label>
                <input id="to" name="to" type="date" defaultValue={params.to} className={inputClass} />
              </div>
            </>
          )}
          {def.needsDays && (
            <div>
              <label htmlFor="days" className={labelClass}>Not sold for (days)</label>
              <input id="days" name="days" type="number" min={1} max={3650} defaultValue={params.days} className={`${inputClass} w-32`} />
            </div>
          )}
          <button type="submit" className={primaryButton}>
            <Filter size={16} aria-hidden /> Show
          </button>
          {can(user, "reports.export") && (
            <a href={`/reports/export?${query.toString()}`} className={secondaryButton}>
              <Download size={16} aria-hidden /> Download CSV
            </a>
          )}
        </form>
      </section>

      {dayTotal !== null && (
        <p className="text-sm">
          <strong>{dayBills}</strong> bills, total <strong>{dayTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </p>
      )}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error.length <= 200 ? error : "Could not build this report."}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm">Nothing to show for these choices.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <th key={c.key} className={c.numeric ? "text-right" : ""}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line">
                  {def.columns.map((c) => (
                    <td key={c.key} className={c.numeric ? "text-right font-mono" : ""}>{fmt(c.key, r[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">{rows.length} row{rows.length === 1 ? "" : "s"} (at most 20,000 are shown).</p>
    </main>
  );
}
