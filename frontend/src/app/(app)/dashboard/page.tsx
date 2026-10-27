import Link from "next/link";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Boxes, ChevronRight, ClipboardList, IndianRupee, PackageCheck, Receipt, Truck, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { BarList, DonutChart, PairColumnChart, Sparkline } from "@/components/charts";
import { CountUp, Reveal, RevealItem } from "@/components/motion";
import { can, requireUser } from "@/lib/auth";
import { getLang, tr, type MessageKey } from "@/lib/i18n";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";
import { cardClass } from "@/lib/ui";
import { friendlyDbError } from "@/lib/db-errors";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "../purchase-orders/status";
import { DashboardFilters, QuickAction } from "../top-bar-parts";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const RANGES = { today: 1, "7": 7, "30": 30, "90": 90 } as const;
type RangeKey = keyof typeof RANGES;
const RANGE_LABEL: Record<RangeKey, MessageKey> = { today: "dash_today", "7": "dash_7", "30": "dash_30", "90": "dash_90" };

// The shape returned by the database function dashboard_data (sections are missing without permission).
type Dash = {
  sales?: {
    total: number; bills: number; cash: number; upi: number; card: number; other: number;
    by_day: { d: string; total: number; bills: number }[];
    top_items: { code: string; name: string; unit: string; qty: number; amount: number }[];
  };
  stock?: {
    low_list: { code: string; name: string; unit: string; place: string; qty: number; min: number }[];
    recent: { at: string; type: string; qty: number; code: string; unit: string; from_place: string | null; to_place: string | null }[];
  };
  purchase?: { open: number; late: number; drafts: number };
  transfers?: { incoming: number; outgoing: number };
};
type Spark = { items?: number[]; stock_in?: number[]; pos?: number[]; transfers?: number[]; bills?: number[] };
// The shape returned by dashboard_extra (the numbers added for this layout).
type Extra = {
  catalog?: { total: number; inactive: number; new_month: number };
  stock_value?: number;
  status?: { ok: number; low: number; out: number };
  by_category?: { name: string; value: number }[];
  moves_by_day?: { d: string; in: number; out: number }[];
  po?: { total: number; completed: number; pending: number; recent: { id: string; po_no: string; supplier: string; place: string; status: string; expected_date: string | null; qty: number }[] };
  grn_recent?: { id: string; receipt_no: string; po_no: string | null; supplier: string; status: string; d: string; items: number; qty: number }[];
  transfer_status?: { received: number; sent: number; draft: number; cancelled: number };
};

const isoDay = (msAgo: number) => new Date(Date.now() - msAgo).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const num = (n: number | undefined | null) => Number(n ?? 0);
const inr = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const ago = (iso: string, t: (k: MessageKey) => string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t("ago_now");
  if (mins < 60) return `${mins} ${t("ago_min")}`;
  if (mins < 1440) return `${Math.floor(mins / 60)} ${t("ago_hour")}`;
  return `${Math.floor(mins / 1440)} ${t("ago_day")}`;
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const lang = await getLang();
  const t = (k: MessageKey) => tr(lang, k);
  const sp = await searchParams;
  const range: RangeKey = (Object.keys(RANGES) as RangeKey[]).includes(first(sp.range) as RangeKey) ? (first(sp.range) as RangeKey) : "today";
  const days = RANGES[range];
  const to = isoDay(0);
  const from = isoDay((days - 1) * 86_400_000);
  const location = z.uuid().safeParse(first(sp.location)).data ?? null;

  const supabase = await createClient();
  const [main, extra, sparkRes, myLocations] = await Promise.all([
    supabase.rpc("dashboard_data", { p_from: from, p_to: to, p_location: location }),
    supabase.rpc("dashboard_extra", { p_location: location }),
    supabase.rpc("dashboard_spark", { p_location: location }),
    getMyLocations(user),
  ]);
  const error = main.error ?? extra.error;
  const spark = (sparkRes.data ?? {}) as Spark;
  const d = (main.data ?? {}) as Dash;
  const x = (extra.data ?? {}) as Extra;
  const hasAny = !!(d.sales || d.stock || d.purchase || d.transfers || x.catalog || x.po || x.grn_recent);

  const name = user.fullName?.trim() || user.email.split("@")[0];
  const quick = [
    can(user, "receipts.create") && { href: "/receipts/new", label: t("act_new_receipt") },
    can(user, "purchase.create") && { href: "/purchase-orders/new", label: t("act_new_po") },
    can(user, "transfers.create") && { href: "/transfers/new", label: t("act_new_transfer") },
    can(user, "stock.entry") && { href: "/stock/entry", label: t("nav_adjust") },
    can(user, "items.create") && { href: "/items/new", label: t("act_new_item") },
    can(user, "bills.create") && { href: "/billing", label: t("nav_billing2") },
    can(user, "stock.view") && can(user, "items.view") && { href: "/reorder", label: t("nav_reorder") },
  ].filter((a): a is { href: string; label: string } => !!a);

  const st = x.status;
  const statusSegments = st
    ? [
        { key: "ok", label: t("st_in"), value: num(st.ok), color: "#17a589" },
        { key: "low", label: t("st_low"), value: num(st.low), color: "#f5b301" },
        { key: "out", label: t("st_out"), value: num(st.out), color: "#e5484d" },
        { key: "inactive", label: t("st_inactive"), value: num(x.catalog?.inactive), color: "#aab4be" },
      ]
    : [];
  const trs = x.transfer_status;
  const trSegments = trs
    ? [
        { key: "received", label: t("tr_received"), value: num(trs.received), color: "#17a589" },
        { key: "sent", label: t("tr_sent"), value: num(trs.sent), color: "#1d6fe0" },
        { key: "draft", label: t("tr_draft"), value: num(trs.draft), color: "#f5b301" },
        { key: "cancelled", label: t("tr_cancelled"), value: num(trs.cancelled), color: "#e5484d" },
      ]
    : [];

  return (
    <main className="space-y-5">
      {/* Title and filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="!text-3xl !font-bold">{t("dash_title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("dash_welcome").replace("{name}", name)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DashboardFilters
            range={range}
            ranges={(Object.keys(RANGES) as RangeKey[]).map((r) => ({ value: r, label: t(RANGE_LABEL[r]) }))}
            location={location ?? ""}
            locations={myLocations}
            allLabel={t("dash_place_all")}
            warehouseLabel={t("dash_warehouse")}
          />
          <QuickAction label={t("dash_quick")} actions={quick} />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}
      {!error && !hasAny && <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">{t("dash_no_sections")}</p>}

      {/* The five numbers */}
      {hasAny && (
        <Reveal className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {x.catalog && (
            <Kpi icon={Boxes} tint="teal" label={t("kpi_products")} href="/items" value={<CountUp value={num(x.catalog.total)} />} spark={spark.items} sparkColor="#17a589"
              sub={<span className="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400"><ArrowUpRight size={14} aria-hidden /> +{num(x.catalog.new_month)} {t("kpi_new_month")}</span>} />
          )}
          {x.stock_value !== undefined && (
            <Kpi icon={IndianRupee} tint="green" label={t("kpi_value")} href="/stock" value={<CountUp value={num(x.stock_value)} money />} spark={spark.stock_in} sparkColor="#17a589"
              sub={<span className="text-muted">{t("kpi_value_note")}</span>} />
          )}
          {x.po && (
            <Kpi icon={ClipboardList} tint="orange" label={t("kpi_po")} href="/purchase-orders" value={<CountUp value={num(x.po.total)} />} spark={spark.pos} sparkColor="#e08a1e"
              sub={<span className="text-muted">{num(x.po.pending)} {t("kpi_pending")} | {num(x.po.completed)} {t("kpi_received")}</span>} />
          )}
          {d.transfers && (
            <Kpi icon={Truck} tint="blue" label={t("kpi_transfers")} href="/transfers" value={<CountUp value={num(d.transfers.incoming) + num(d.transfers.outgoing)} />} spark={spark.transfers} sparkColor="#1d6fe0"
              sub={<span className="text-muted">{num(d.transfers.incoming)} {t("kpi_in")} | {num(d.transfers.outgoing)} {t("kpi_out")}</span>} />
          )}
          {d.sales && (
            <Kpi icon={Receipt} tint="green" label={t("kpi_bills")} href="/bills" value={<CountUp value={num(d.sales.bills)} />} spark={spark.bills} sparkColor="#7c5cd6"
              sub={<span className="text-muted">{inr(num(d.sales.total))}</span>} />
          )}
        </Reveal>
      )}

      {/* Stock status, movement, top categories */}
      {(x.status || x.moves_by_day || x.by_category) && (
        <div className="grid gap-4 lg:grid-cols-12">
          {x.status && (
            <section className={`${cardClass} lg:col-span-4`}>
              <CardHead title={t("card_status")} href="/stock" all={t("view_details")} />
              <DonutChart
                segments={statusSegments}
                centerValue={num(x.catalog?.total).toLocaleString("en-IN")}
                centerLabel={t("card_status_center")}
                ariaLabel={t("card_status")}
              />
            </section>
          )}
          {x.moves_by_day && (
            <section className={`${cardClass} lg:col-span-5`}>
              <CardHead title={t("card_moves")} href="/stock/movements" all={t("view_report")} />
              <PairColumnChart
                data={x.moves_by_day.map((m) => ({ key: m.d, label: dayLabel(m.d), a: num(m.in), b: num(m.out) }))}
                aLabel={t("mv_in")} bLabel={t("mv_out")} aColor="#17a589" bColor="#1d6fe0"
                ariaLabel={t("card_moves")} emptyText={t("chart_sales_empty")}
              />
            </section>
          )}
          {x.by_category && (
            <section className={`${cardClass} lg:col-span-3`}>
              <CardHead title={t("card_cats")} href="/items" all={t("view_all")} />
              <BarList
                rows={x.by_category.map((c) => ({ key: c.name, label: c.name, value: num(c.value), display: inr(num(c.value)) }))}
                emptyText={t("empty_generic")}
              />
            </section>
          )}
        </div>
      )}

      {/* Recent purchase orders and goods inward */}
      {(x.po || x.grn_recent) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {x.po && (
            <section className={cardClass}>
              <CardHead title={t("card_po")} href="/purchase-orders" all={t("view_all")} />
              {x.po.recent.length === 0 ? <Empty text={t("empty_generic")} /> : (
                <div className="overflow-x-auto">
                  <table className="dash-table w-full text-left text-sm">
                    <thead><tr><th>{t("col_po")}</th><th>{t("col_supplier")}</th><th>{t("col_place")}</th><th className="text-right">{t("col_qty")}</th><th>{t("col_status")}</th><th>{t("col_eta")}</th></tr></thead>
                    <tbody>
                      {x.po.recent.map((o) => (
                        <tr key={o.id}>
                          <td><Link href={`/purchase-orders/${o.id}`}>{o.po_no}</Link></td>
                          <td>{o.supplier}</td><td>{o.place}</td>
                          <td className="text-right font-mono">{num(o.qty).toLocaleString("en-IN")}</td>
                          <td><Badge tone={PO_STATUS_TONE[o.status] ?? "gray"}>{PO_STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                          <td className="whitespace-nowrap">{o.expected_date ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {x.grn_recent && (
            <section className={cardClass}>
              <CardHead title={t("card_grn")} href="/receipts" all={t("view_all")} />
              {x.grn_recent.length === 0 ? <Empty text={t("empty_generic")} /> : (
                <div className="overflow-x-auto">
                  <table className="dash-table w-full text-left text-sm">
                    <thead><tr><th>{t("col_grn")}</th><th>{t("col_po")}</th><th>{t("col_supplier")}</th><th className="text-right">{t("col_items")}</th><th className="text-right">{t("col_qty")}</th><th>{t("col_status")}</th><th>{t("col_date")}</th></tr></thead>
                    <tbody>
                      {x.grn_recent.map((g) => (
                        <tr key={g.id}>
                          <td><Link href={`/receipts/${g.id}`}>{g.receipt_no}</Link></td>
                          <td>{g.po_no ?? "-"}</td><td>{g.supplier}</td>
                          <td className="text-right">{num(g.items)}</td>
                          <td className="text-right font-mono">{num(g.qty).toLocaleString("en-IN")}</td>
                          <td><Badge tone={g.status === "POSTED" ? "green" : g.status === "DRAFT" ? "amber" : "gray"}>{g.status === "POSTED" ? "Completed" : g.status === "DRAFT" ? "Draft" : "Cancelled"}</Badge></td>
                          <td className="whitespace-nowrap">{g.d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Low stock, transfers donut, recent activity */}
      {(d.stock || x.transfer_status) && (
        <div className="grid gap-4 lg:grid-cols-12">
          {d.stock && (
            <section className={`${cardClass} lg:col-span-12 xl:col-span-5`}>
              <CardHead title={t("card_low")} href="/reports?r=low" all={t("view_all")} />
              {d.stock.low_list.length === 0 ? <Empty text={t("list_low_empty")} /> : (
                <div className="overflow-x-auto">
                  <table className="dash-table w-full text-left text-sm">
                    <thead><tr><th>{t("col_sku")}</th><th>{t("col_product")}</th><th className="text-right">{t("col_current")}</th><th className="text-right">{t("col_reorder")}</th><th>{t("col_status")}</th></tr></thead>
                    <tbody>
                      {d.stock.low_list.map((l) => (
                        <tr key={`${l.place}-${l.code}`}>
                          <td className="max-w-[8rem] truncate font-medium" title={l.code}>{l.code}</td>
                          <td className="max-w-[5.5rem] truncate" title={`${l.name} (${l.place})`}>{l.name}</td>
                          <td className={`text-right font-mono ${num(l.qty) === 0 ? "text-red-600" : ""}`}>{num(l.qty)}</td>
                          <td className="text-right font-mono">{num(l.min)}</td>
                          <td><Badge tone={num(l.qty) === 0 ? "red" : "amber"}>{num(l.qty) === 0 ? t("st_out") : t("st_low")}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {x.transfer_status && (
            <section className={`${cardClass} lg:col-span-5 xl:col-span-3`}>
              <CardHead title={t("card_transfers")} href="/transfers" all={t("view_all")} />
              <DonutChart
                segments={trSegments}
                centerValue={trSegments.reduce((a, s) => a + s.value, 0).toLocaleString("en-IN")}
                centerLabel={t("tr_orders")}
                ariaLabel={t("card_transfers")}
              />
            </section>
          )}
          {d.stock && (
            <section className={`${cardClass} lg:col-span-7 xl:col-span-4`}>
              <CardHead title={t("card_activity")} href="/stock/movements" all={t("view_all")} />
              {d.stock.recent.length === 0 ? <Empty text={t("list_recent_empty")} /> : (
                <ul className="space-y-3">
                  {d.stock.recent.slice(0, 6).map((m, i) => {
                    const incoming = m.from_place === null && m.to_place !== null;
                    const Icon: LucideIcon = m.type === "TRANSFER" ? ArrowLeftRight : incoming ? ArrowDownLeft : m.to_place === null ? ArrowUpRight : PackageCheck;
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[var(--brand-text)]"><Icon size={18} aria-hidden /></span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="block font-medium">{MOVEMENT_LABELS[m.type] ?? m.type}: {m.code}</span>
                          <span className="block text-xs text-muted">{num(m.qty)} {m.unit} · {m.from_place ?? "·"} → {m.to_place ?? "·"}</span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-muted" title={when(m.at)}>{ago(m.at, t)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

    </main>
  );
}

function CardHead({ title, href, all }: { title: string; href: string; all: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold">{all} <ChevronRight size={13} aria-hidden /></Link>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}

const TINTS = {
  teal: "bg-[#e0f5f0] text-[#0b7d70]",
  green: "bg-[#e3f6ec] text-[#16824f]",
  orange: "bg-[#fdf0e1] text-[#c2670a]",
  blue: "bg-[#e5effd] text-[#1d62c9]",
} as const;

function Kpi({ icon: Icon, tint, label, value, sub, href, spark, sparkColor }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: React.ReactNode; sub: React.ReactNode; href: string; spark?: number[]; sparkColor: string }) {
  return (
    <RevealItem>
      <Link href={href} className={`${cardClass} flex h-full items-center gap-3 p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={24} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight text-muted">{label}</span>
          <span className="flex flex-wrap items-end justify-between gap-x-2">
            <span className="text-[26px] font-bold leading-9 tracking-tight">{value}</span>
            <Sparkline values={spark ?? []} color={sparkColor} label={label} />
          </span>
          <span className="mt-0.5 block text-xs leading-tight">{sub}</span>
        </span>
      </Link>
    </RevealItem>
  );
}

export const metadata = { title: "Dashboard" };
