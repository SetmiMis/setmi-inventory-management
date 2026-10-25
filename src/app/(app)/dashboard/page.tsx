import Link from "next/link";
import {
  AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, Boxes, ChevronRight, ClipboardList, IndianRupee,
  PackageCheck, PackageX, Receipt, Wallet, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { BarList, ColumnChart } from "@/components/charts";
import { CountUp, Reveal, RevealItem } from "@/components/motion";
import { requireUser } from "@/lib/auth";
import { getLang, tr, type MessageKey } from "@/lib/i18n";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";
import { cardClass } from "@/lib/ui";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const RANGES = { today: 1, "7": 7, "30": 30, "90": 90 } as const;
type RangeKey = keyof typeof RANGES;
const RANGE_LABEL: Record<RangeKey, MessageKey> = { today: "dash_today", "7": "dash_7", "30": "dash_30", "90": "dash_90" };

// The shape returned by the database function dashboard_data (sections are missing without permission).
type Dash = {
  sales?: {
    total: number; bills: number; discount: number; cash: number; upi: number; card: number; other: number; prev_total: number;
    by_day: { d: string; total: number; bills: number }[];
    top_items: { code: string; name: string; unit: string; qty: number; amount: number }[];
  };
  stock?: {
    in_stock: number; low: number; out: number;
    low_list: { code: string; name: string; unit: string; place: string; qty: number; min: number }[];
    by_place: { place: string; place_name: string; in_stock: number; low: number }[];
    recent: { at: string; type: string; qty: number; code: string; unit: string; from_place: string | null; to_place: string | null }[];
  };
  purchase?: { open: number; late: number; drafts: number };
  receipts?: { drafts: number };
  transfers?: { incoming: number; outgoing: number };
};

const isoDay = (msAgo: number) => new Date(Date.now() - msAgo).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const num = (n: number) => Number(n ?? 0);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const lang = await getLang();
  const t = (k: MessageKey) => tr(lang, k);
  const sp = await searchParams;
  const range: RangeKey = (Object.keys(RANGES) as RangeKey[]).includes(first(sp.range) as RangeKey) ? (first(sp.range) as RangeKey) : "7";
  const days = RANGES[range];
  const to = isoDay(0);
  const from = isoDay((days - 1) * 86_400_000);
  const location = z.uuid().safeParse(first(sp.location)).data ?? null;

  const supabase = await createClient();
  const [{ data, error }, myLocations] = await Promise.all([
    supabase.rpc("dashboard_data", { p_from: from, p_to: to, p_location: location }),
    getMyLocations(user),
  ]);
  const d = (data ?? {}) as Dash;
  const hasAny = !!(d.sales || d.stock || d.purchase || d.receipts || d.transfers);
  const link = (r: RangeKey) => `/dashboard?${new URLSearchParams({ range: r, ...(location ? { location } : {}) }).toString()}`;

  // Sales change against the same number of days just before.
  const total = num(d.sales?.total ?? 0);
  const prev = num(d.sales?.prev_total ?? 0);
  const delta = prev > 0 ? ((total - prev) / prev) * 100 : null;
  const bills = num(d.sales?.bills ?? 0);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{t("dash_title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("dash_subtitle")}</p>
        </div>
        {/* Filters: one row, above everything they change. */}
        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm" aria-label="Date range">
            {(Object.keys(RANGES) as RangeKey[]).map((r) => (
              <Link
                key={r}
                href={link(r)}
                aria-current={r === range ? "page" : undefined}
                className={`px-3 py-1.5 text-sm font-medium ${r === range ? "bg-brand text-white" : "hover:bg-surface-muted"}`}
              >
                {t(RANGE_LABEL[r])}
              </Link>
            ))}
          </nav>
          {myLocations.length > 1 && (
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="range" value={range} />
              <label htmlFor="location" className="sr-only">{t("dash_place")}</label>
              <select id="location" name="location" defaultValue={location ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm shadow-sm">
                <option value="">{t("dash_place_all")}</option>
                {myLocations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
              </select>
              <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-strong">OK</button>
            </form>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error.message.length <= 200 ? error.message : "Could not load the dashboard."}</p>}
      {!error && !hasAny && <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">{t("dash_no_sections")}</p>}

      {hasAny && (
        <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {d.sales && (
            <RevealItem className="sm:col-span-2">
              <Link href="/bills" className={`${cardClass} block h-full p-5 transition hover:border-brand hover:shadow-md`}>
                <p className="flex items-center gap-2 text-sm text-muted"><IndianRupee size={16} aria-hidden /> {t("tile_sales")} · {t(RANGE_LABEL[range])}</p>
                <p className="mt-2 text-5xl font-semibold tracking-tight"><CountUp value={total} money /></p>
                <p className="mt-2 text-sm">
                  {delta === null ? (
                    total > 0 ? <span className="text-muted">{t("tile_new")}</span> : <span className="text-muted">&nbsp;</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 font-medium ${delta >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
                      {delta >= 0 ? <ArrowUpRight size={16} aria-hidden /> : <ArrowDownRight size={16} aria-hidden />}
                      {delta >= 0 ? "+" : ""}{delta.toFixed(1)}%
                    </span>
                  )}{" "}
                  {delta !== null && <span className="text-muted">{t("tile_vs_prev")}</span>}
                </p>
              </Link>
            </RevealItem>
          )}
          {d.sales && <Tile icon={Receipt} label={t("tile_bills")} href="/bills" value={<CountUp value={bills} />} />}
          {d.sales && <Tile icon={Wallet} label={t("tile_avg")} href="/bills" value={<CountUp value={bills ? total / bills : 0} money />} />}
          {d.stock && <Tile icon={AlertTriangle} label={t("tile_low")} href="/reports?r=low" value={<CountUp value={num(d.stock.low)} />} warn={num(d.stock.low) > 0} />}
          {d.stock && <Tile icon={PackageX} label={t("tile_out")} href="/reports?r=low" value={<CountUp value={num(d.stock.out)} />} warn={num(d.stock.out) > 0} />}
          {d.stock && <Tile icon={Boxes} label={t("tile_in_stock")} href="/stock" value={<CountUp value={num(d.stock.in_stock)} />} />}
          {d.purchase && (
            <Tile icon={ClipboardList} label={t("tile_open_po")} href="/purchase-orders?status=SENT" value={<CountUp value={num(d.purchase.open)} />}
              sub={num(d.purchase.late) > 0 ? `${num(d.purchase.late)} ${t("tile_late")}` : undefined} warn={num(d.purchase.late) > 0} />
          )}
          {d.transfers && (
            <Tile icon={ArrowLeftRight} label={t("tile_incoming")} href="/transfers" value={<CountUp value={num(d.transfers.incoming)} />}
              sub={num(d.transfers.outgoing) > 0 ? `${num(d.transfers.outgoing)} ${t("tile_outgoing")}` : undefined} />
          )}
          {d.receipts && <Tile icon={PackageCheck} label={t("tile_receipts")} href="/receipts?status=DRAFT" value={<CountUp value={num(d.receipts.drafts)} />} />}
        </Reveal>
      )}

      {d.sales && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className={`${cardClass} lg:col-span-2`}>
            <h2 className="mb-3 text-base">{t("chart_sales")}</h2>
            <ColumnChart
              data={d.sales.by_day.map((x) => ({ key: x.d, label: dayLabel(x.d), value: num(x.total), detail: `${num(x.bills)} ${t("unit_bills")}` }))}
              money
              ariaLabel={t("chart_sales")}
              tableLabel={t("chart_table")}
              valueLabel={t("chart_sales")}
              emptyText={t("chart_sales_empty")}
            />
          </section>
          <section className={cardClass}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base">{t("chart_top")}</h2>
              <Link href={`/reports?r=sales-item&from=${from}&to=${to}`} className="text-sm">{t("see_all")}</Link>
            </div>
            <BarList
              rows={d.sales.top_items.map((x) => ({ key: x.code, label: x.name, sub: `${x.code} · ${num(x.qty)} ${x.unit}`, value: num(x.amount) }))}
              money
              emptyText={t("chart_top_empty")}
            />
          </section>
        </div>
      )}

      {(d.sales || d.stock) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {d.sales && (
            <section className={cardClass}>
              <h2 className="mb-3 text-base">{t("chart_pay")}</h2>
              <BarList
                rows={[
                  { key: "cash", label: "Cash", value: num(d.sales.cash) },
                  { key: "upi", label: "UPI", value: num(d.sales.upi) },
                  { key: "card", label: "Card", value: num(d.sales.card) },
                  { key: "other", label: "Other", value: num(d.sales.other) },
                ].filter((r) => r.value > 0)}
                money
                emptyText={t("chart_pay_empty")}
              />
            </section>
          )}
          {d.stock && (
            <section className={cardClass}>
              <h2 className="mb-3 text-base">{t("chart_place")}</h2>
              <BarList
                rows={d.stock.by_place.filter((p) => num(p.low) > 0).map((p) => ({ key: p.place, label: p.place_name, sub: p.place, value: num(p.low), display: String(num(p.low)) }))}
                emptyText={t("chart_place_empty")}
              />
            </section>
          )}
          {d.stock && (
            <section className={cardClass}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base">{t("list_low")}</h2>
                <Link href="/reports?r=low" className="text-sm">{t("see_all")}</Link>
              </div>
              {d.stock.low_list.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">{t("list_low_empty")}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {d.stock.low_list.map((x) => (
                    <li key={`${x.place}-${x.code}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{x.name}</span>
                        <span className="block text-xs text-muted">{x.code} · {x.place}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`inline-flex items-center gap-1 font-semibold ${num(x.qty) === 0 ? "text-red-600" : ""}`}>
                          {num(x.qty) === 0 && <PackageX size={14} aria-hidden />}{num(x.qty)} / {num(x.min)} {x.unit}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {d.stock && (
        <section className={cardClass}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base">{t("list_recent")}</h2>
            <Link href="/stock/movements" className="inline-flex items-center gap-0.5 text-sm">{t("see_all")} <ChevronRight size={14} aria-hidden /></Link>
          </div>
          {d.stock.recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">{t("list_recent_empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {d.stock.recent.map((m, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="whitespace-nowrap text-muted">{new Date(m.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="font-medium">{m.code}</td>
                      <td>{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                      <td className="text-muted">{m.from_place ?? "·"} → {m.to_place ?? "·"}</td>
                      <td className="text-right font-mono">{num(m.qty)} {m.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Tile({ icon: Icon, label, value, href, sub, warn = false }: { icon: LucideIcon; label: string; value: React.ReactNode; href: string; sub?: string; warn?: boolean }) {
  return (
    <RevealItem>
      <Link href={href} className={`${cardClass} flex h-full flex-col justify-between gap-2 p-5 transition hover:border-brand hover:shadow-md`}>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Icon size={16} className={warn ? "text-amber-600" : ""} aria-hidden /> {label}
        </p>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {sub ? (
          <p className={`inline-flex items-center gap-1 text-xs font-medium ${warn ? "text-amber-700 dark:text-amber-400" : "text-muted"}`}>
            {warn && <AlertTriangle size={12} aria-hidden />}{sub}
          </p>
        ) : <p className="text-xs">&nbsp;</p>}
      </Link>
    </RevealItem>
  );
}
