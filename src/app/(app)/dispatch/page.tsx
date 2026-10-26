import Link from "next/link";
import { ArrowDownToLine, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Eye, MapPin, Printer, Search, Send, Truck, Undo2, Package, X as XIcon, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { BarList, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { DISPATCH_STATUSES, FINAL_STATUSES, SERVICE_LABEL, STATUS_LABEL } from "@/lib/validation/dispatch";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNEL_BADGE, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { RowsPerPage } from "../items/item-controls";
import { DispatchForm, DispatchRowMenu, StatusForm, type FormInitial } from "./dispatch-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_STYLE: Record<string, string> = {
  DISPATCHED: "bg-[#ece8fb] text-[#5b3fc0] dark:bg-[#2c2556] dark:text-[#c3b5ff]",
  IN_TRANSIT: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  OUT_FOR_DELIVERY: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  DELIVERED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  DELIVERY_FAILED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  RTO: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const STATUS_COLOR: Record<string, string> = { DISPATCHED: "#7a55d6", IN_TRANSIT: "#2a63d6", OUT_FOR_DELIVERY: "#e8b21a", DELIVERED: "#16a05f", DELIVERY_FAILED: "#e08a1a", RTO: "#d6402f" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; order_id: string; order_no: string; order_date: string; dispatch_date: string; channel: string; customer_name: string; courier_id: string; courier_name: string;
  service_type: string | null; awb: string; insurance: boolean; pickup_ref: string | null; remarks: string | null; status: string; delivery_date: string | null; location_id: string; place_name: string;
};
type PageData = {
  total: number; rows: Row[]; couriers: { id: string; name: string }[]; ready: { order_id: string; order_no: string; customer_name: string; place_name: string }[];
  kpi: { to_dispatch: number; total: number; today: number; dispatched: number; in_transit: number; out_for_delivery: number; delivered: number; failed: number; rto: number };
  trend: { day: string; dispatched: number; delivered: number }[]; couriers_month: { name: string; n: number }[]; recent: { order_no: string; status: string; at: string; user: string | null }[];
};
const EMPTY: PageData = { total: 0, rows: [], couriers: [], ready: [], kpi: { to_dispatch: 0, total: 0, today: 0, dispatched: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, failed: 0, rto: 0 }, trend: [], couriers_month: [], recent: [] };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
const ChannelCell = ({ channel }: { channel: string }) => {
  const b = CHANNEL_BADGE[channel] ?? CHANNEL_BADGE.OTHER;
  return <span className="flex items-center gap-2"><span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: b.bg }}>{b.letter}</span><span>{CHANNEL_LABEL[channel]}</span></span>;
};

export default async function DispatchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("dispatch.view", "dispatch.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const status = (DISPATCH_STATUSES as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const courier = z.uuid().safeParse(first(sp.courier)).data ?? "";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canManage = can(user, "dispatch.manage");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_page", {
    p_q: q || null, p_courier: courier || null, p_status: status === "all" ? null : status, p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (first(sp.p) === "create" ? null : rows[0]?.id) ?? null);
  const orderParam = z.uuid().safeParse(first(sp.order)).data ?? "";
  const pRaw = first(sp.p);
  const panel = pRaw === "edit" && canManage ? "edit" : pRaw === "details" || (selParam && selParam !== "none" && pRaw !== "create") ? "details" : canManage && (pRaw === "create" || !selParam) ? "create" : "details";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, courier: courier || undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: pRaw,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/dispatch?${s}` : "/dispatch";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, courier, status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();
  const filterBase = keep({ p: undefined, sel: undefined, order: undefined });

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || courier || from || to || status !== "all");
  const statusCount: Record<string, number> = { DISPATCHED: kpi.dispatched, IN_TRANSIT: kpi.in_transit, OUT_FOR_DELIVERY: kpi.out_for_delivery, DELIVERED: kpi.delivered, DELIVERY_FAILED: kpi.failed, RTO: kpi.rto };
  const segments = DISPATCH_STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], value: statusCount[s], color: STATUS_COLOR[s] })).sort((a, b) => b.value - a.value);
  const monthTotal = result.couriers_month.reduce((a, c) => a + Number(c.n), 0);

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Sales &amp; Dispatch</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Dispatch</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Dispatch</h1>
          <p className="mt-1 text-sm text-muted">Hand packed orders to a courier, print the shipping label and follow the parcel until it is delivered. Marking an order as dispatched takes its stock out.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/dispatch/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {selId && (
            <Link href={`/dispatch/${selId}/label`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
              <Printer size={18} aria-hidden /> Print Label
            </Link>
          )}
          {canManage && (
            <Link href={keep({ p: "create", sel: undefined, order: undefined })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Truck size={18} aria-hidden /> Create Dispatch
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Package} tint="blue" label="Total to Dispatch" value={n(kpi.to_dispatch)} href={keep({ p: "create", sel: undefined, order: undefined })} sub={<span className="text-muted">Packed, waiting</span>} />
        <Kpi icon={Send} tint="green" label="Dispatched Today" value={n(kpi.today)} href={keep({ status: undefined, from: today, to: today, page: undefined, sel: undefined })} sub={<span className="text-muted">Today</span>} />
        <Kpi icon={MapPin} tint="violet" label="In Transit" value={n(kpi.in_transit)} href={keep({ status: "IN_TRANSIT", page: undefined, sel: undefined })} sub={<span className="text-muted">On the way</span>} />
        <Kpi icon={CheckCircle2} tint="amber" label="Delivered" value={n(kpi.delivered)} href={keep({ status: "DELIVERED", page: undefined, sel: undefined })} sub={<span className="text-muted">Reached the customer</span>} />
        <Kpi icon={CircleAlert} tint="red" label="Delivery Failed" value={n(kpi.failed)} href={keep({ status: "DELIVERY_FAILED", page: undefined, sel: undefined })} sub={<span className="text-muted">Could not deliver</span>} />
        <Kpi icon={Undo2} tint="red" label="RTO" value={n(kpi.rto)} href={keep({ status: "RTO", page: undefined, sel: undefined })} sub={<span className="text-muted">Returned to us</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(10rem,2fr)_repeat(4,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
              <label className="relative block md:col-span-3 2xl:col-span-1">
                <span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search order no, customer, AWB, tracking ID" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
              </label>
              <FilterSelect label="Courier Partner" name="courier" value={courier}>
                <option value="">All Couriers</option>
                {result.couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </FilterSelect>
              <FilterSelect label="Dispatch Status" name="status" value={status}>
                <option value="all">All Status</option>
                {DISPATCH_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </FilterSelect>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
                <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
                <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <Link href="/dispatch" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={Truck} title="No dispatches found" text={filtersOn ? "Try a different word, or press Clear." : "Orders that are packed can be dispatched from the form on the right."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Order No.</th><th>Dispatch Date</th><th>Customer</th><th>Channel</th><th>Courier Partner</th><th>AWB / Tracking ID</th><th>Status</th><th>Delivery Date</th><th className="print:hidden">Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isSel = r.id === selId && panel !== "create";
                      const viewHref = keep({ sel: r.id, p: "details", order: undefined });
                      return (
                        <tr key={r.id} aria-selected={isSel} className={isSel ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.order_no}</Link></td>
                          <td className="whitespace-nowrap">{day(r.dispatch_date)}</td>
                          <td className="min-w-32 font-medium">{r.customer_name}</td>
                          <td className="whitespace-nowrap"><ChannelCell channel={r.channel} /></td>
                          <td className="whitespace-nowrap">{r.courier_name}</td>
                          <td className="whitespace-nowrap font-mono text-[13px]">{r.awb}</td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="whitespace-nowrap">{r.delivery_date ? day(r.delivery_date) : "-"}</td>
                          <td className="print:hidden">
                            <span className="flex items-center gap-1">
                              <Link href={viewHref} aria-label={`View ${r.order_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              <Link href={`/dispatch/${r.id}/label`} aria-label={`Print label ${r.order_no}`} title="Print label" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Printer size={18} aria-hidden /></Link>
                              <DispatchRowMenu viewHref={viewHref} labelHref={`/dispatch/${r.id}/label`} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} dispatches</span>
              <nav aria-label="Pagination" className="flex items-center gap-1.5">
                {page > 1 ? <PageLink href={keep({ page: page - 1, sel: undefined })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
                {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : (
                  <PageLink key={p} href={keep({ page: p, sel: undefined })} active={p === page} label={`Page ${p}`}>{p}</PageLink>
                ))}
                {page < lastPage ? <PageLink href={keep({ page: page + 1, sel: undefined })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
              </nav>
              <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined, sel: undefined })} />
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Dispatch Trend (Last 30 Days)</h2>
              <DispatchTrend points={result.trend} />
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Dispatch Status Distribution</h2>
              {kpi.total === 0 ? <p className="py-8 text-center text-sm text-muted">No dispatches yet.</p> : (
                <DonutChart segments={segments} centerValue={n(kpi.total)} centerLabel="Total Orders" ariaLabel="Dispatches by status" />
              )}
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Courier Partner (This Month)</h2>
              <BarList rows={result.couriers_month.map((c) => ({ key: c.name, label: c.name, value: Number(c.n), display: `${n(Number(c.n))} (${monthTotal ? Math.round((Number(c.n) / monthTotal) * 100) : 0}%)` }))} emptyText="Nothing was dispatched this month." />
            </section>
          </div>
        </div>

        <aside aria-label="Dispatch" className="h-fit min-w-0 space-y-5 xl:sticky xl:top-20 print:hidden">
          <div className={`${cardClass} !p-4`}>
            <div role="tablist" aria-label="Dispatch panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
              {canManage ? (
                <Link href={keep({ p: "create", sel: undefined, order: undefined })} role="tab" aria-selected={panel === "create" || panel === "edit"}
                  className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "create" || panel === "edit" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>{panel === "edit" ? "Update Dispatch" : "Create / Update Dispatch"}</Link>
              ) : <span />}
              <Link href={keep({ p: "details", sel: selId ?? rows[0]?.id, order: undefined })} role="tab" aria-selected={panel === "details"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "details" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Order Details</Link>
            </div>
            {panel === "create" ? (
              <CreatePanel result={result} orderParam={orderParam} baseHref={filterBase} today={today} />
            ) : (
              <DetailsPanel selId={selId} panel={panel} canManage={canManage} keep={keep} couriers={result.couriers} today={today} user={user} />
            )}
          </div>

          <div className={`${cardClass} !p-4`}>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-bold">Recent Dispatch Activity</h2><Link href="/dispatch" className="text-xs font-semibold">View All</Link></div>
            {result.recent.length === 0 ? <p className="text-xs text-muted">Nothing has been dispatched yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-xs">
                  <thead><tr className="text-muted"><th className="py-1 pr-2">Time</th><th className="py-1 pr-2">Order No.</th><th className="py-1 pr-2">Activity</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {result.recent.map((a, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1.5 pr-2">{time(a.at)}</td>
                        <td className="py-1.5 pr-2 font-semibold">{a.order_no}</td>
                        <td className="py-1.5 pr-2">{STATUS_LABEL[a.status]}{a.user ? <span className="text-muted"> · {a.user}</span> : ""}</td>
                        <td className="py-1.5"><StatusPill status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function FilterSelect({ label, name, value, children }: { label: string; name: string; value: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select name={name} defaultValue={value} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">{children}</select>
    </label>
  );
}

function PageLink({ href, label, active, disabled, children }: { href?: string; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const cls = `inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-medium ${
    active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-surface hover:bg-surface-muted"
  } ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (disabled || !href) return <span aria-label={label} aria-disabled="true" className={cls}>{children}</span>;
  return <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cls}>{children}</Link>;
}

const TINTS = {
  blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", red: "bg-[#fde8e8] text-[#c8302f]",
  amber: "bg-[#fdf0e1] text-[#b45f08]", violet: "bg-[#ece8fb] text-[#5b3fc0]",
} as const;

function Kpi({ icon: Icon, tint, label, value, sub, href }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; sub: React.ReactNode; href: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-2xl font-bold leading-9 tracking-tight">{value}</span>
        <span className="block text-xs leading-tight">{sub}</span>
      </span>
    </Link>
  );
}

// Dispatched per day (columns) and delivered per day (line), last 30 days.
function DispatchTrend({ points }: { points: { day: string; dispatched: number; delivered: number }[] }) {
  const W = 400, H = 220, L = 28, R = 8, T = 10, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(1, ...points.map((p) => Math.max(p.dispatched, p.delivered)));
  const step = plotW / Math.max(points.length, 1);
  const bw = Math.min(7, step * 0.55);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  if (points.every((p) => p.dispatched === 0 && p.delivered === 0)) return <p className="py-10 text-center text-sm text-muted">Nothing was dispatched in the last 30 days.</p>;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(L + i * step + step / 2).toFixed(1)},${y(p.delivered).toFixed(1)}`).join(" ");
  const label = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#2a63d6]" /> Dispatched</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#16a05f]" /> Delivered</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dispatched and delivered parcels per day, last 30 days" className="h-auto w-full">
        {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />)}
        {ticks.map((t) => <text key={`n${t}`} x={L - 5} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{t}</text>)}
        {points.map((p, i) => {
          const x = L + i * step + step / 2;
          return (
            <g key={p.day}>
              <title>{`${label(p.day)}: ${p.dispatched} dispatched, ${p.delivered} delivered`}</title>
              {p.dispatched > 0 && <rect x={x - bw / 2} y={y(p.dispatched)} width={bw} height={T + plotH - y(p.dispatched)} rx="1.5" fill="#2a63d6" />}
              {i % 7 === 0 && <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{label(p.day)}</text>}
            </g>
          );
        })}
        <path d={line} fill="none" stroke="#16a05f" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div className="sr-only"><ul>{points.map((p) => <li key={p.day}>{label(p.day)}: {p.dispatched} dispatched, {p.delivered} delivered</li>)}</ul></div>
    </div>
  );
}

type JobLine = { item_id: string; required: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

// The items of an order (as packed) shown under the form.
async function ItemsInOrder({ orderId }: { orderId: string }) {
  const supabase = await createClient();
  const { data: job } = await supabase.from("pick_pack_jobs").select("id").eq("order_id", orderId).neq("status", "CANCELLED").maybeSingle();
  if (!job) return <p className="text-xs text-muted">No pick sheet for this order.</p>;
  const { data } = await supabase.from("pick_pack_lines").select("item_id, required, items(internal_item_code, item_name, unit)").eq("job_id", job.id).order("id");
  const lines = (data ?? []) as unknown as JobLine[];
  return (
    <div>
      <h3 className="mb-1 text-sm font-bold">Items in Order</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="text-muted"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Item Name</th><th className="py-1 pr-2 text-right">Ordered</th><th className="py-1 pr-2 text-right">Packed</th><th className="py-1 text-right">Dispatch</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.item_id} className="border-t border-line">
                <td className="py-1.5 pr-2">{i + 1}</td><td className="py-1.5 pr-2 font-semibold">{l.items?.internal_item_code}</td><td className="max-w-28 truncate py-1.5 pr-2">{l.items?.item_name}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{n(Number(l.required))}</td><td className="py-1.5 pr-2 text-right font-mono">{n(Number(l.required))}</td><td className="py-1.5 text-right font-mono">{n(Number(l.required))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreatePanel({ result, orderParam, baseHref, today }: { result: PageData; orderParam: string; baseHref: string; today: string }) {
  const ready = result.ready.map((o) => ({ id: o.order_id, label: `${o.order_no} - ${o.customer_name}` }));
  const chosen = ready.some((o) => o.id === orderParam) ? orderParam : "";
  return (
    <div className="space-y-4">
      {ready.length === 0 && <p role="status" className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-muted">No order is packed yet. Pack an order in Picking &amp; Packing first; it then appears here.</p>}
      <DispatchForm mode="create" couriers={result.couriers} ready={ready} orderId={chosen || null} orderLabel="" baseHref={baseHref} today={today} />
      {chosen && <ItemsInOrder orderId={chosen} />}
    </div>
  );
}

async function DetailsPanel({ selId, panel, canManage, keep, couriers, today, user }: {
  selId: string | null; panel: "details" | "edit"; canManage: boolean; keep: (extra: Record<string, string | number | undefined>) => string;
  couriers: { id: string; name: string }[]; today: string; user: Awaited<ReturnType<typeof requireAnyPermission>>;
}) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose a dispatch from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: d } = await supabase.from("dispatches").select("*, couriers(name), locations(name, code)").eq("id", selId).maybeSingle();
  if (!d) return <p className="py-6 text-center text-sm text-muted">This dispatch was not found, or you may not see it.</p>;
  const { data: o } = await supabase.from("sales_orders").select("order_no, order_date, channel, shipping_address, customers(name, phone)").eq("id", d.order_id).maybeSingle();
  const cust = o?.customers as unknown as { name: string; phone: string | null } | null;
  const place = d.locations as unknown as { name: string; code: string };
  const courier = d.couriers as unknown as { name: string };
  const { data: who } = await supabase.rpc("person_name", { p_id: d.created_by });
  const { data: ev } = await supabase.from("dispatch_events").select("status, at").eq("dispatch_id", d.id).order("id");
  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const here = mine.has(d.location_id);
  const final = (FINAL_STATUSES as readonly string[]).includes(d.status);
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const initial: FormInitial = {
    dispatchId: d.id, courierId: d.courier_id, serviceType: d.service_type ?? "", awb: d.awb, insurance: d.insurance, pickupRef: d.pickup_ref ?? "", remarks: d.remarks ?? "", dispatchDate: d.dispatch_date,
  };

  if (panel === "edit" && canManage && here && !final) {
    return (
      <div className="space-y-4">
        <DispatchForm mode="update" couriers={couriers} ready={[]} orderId={d.order_id} orderLabel={o?.order_no ?? ""} baseHref="/dispatch" today={today} initial={initial} labelHref={`/dispatch/${d.id}/label`} />
        <Link href={keep({ p: "details", sel: d.id })} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-sm font-semibold hover:bg-surface-muted">Back to details</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{o?.order_no}</h2>
          <div className="flex items-center gap-1">
            <StatusPill status={d.status} />
            <Link href={keep({ sel: "none", p: undefined })} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
          </div>
        </div>
        <dl>
          {field("Customer", cust?.name)}
          {field("Phone", cust?.phone)}
          {field("Sales Channel", o ? <ChannelCell channel={o.channel} /> : "")}
          {field("Shipping Address", o?.shipping_address)}
          {field("Shipped From", `${place.name} (${place.code})`)}
          {field("Dispatch Date", day(d.dispatch_date))}
          {field("Courier Partner", courier.name)}
          {field("Service Type", d.service_type ? SERVICE_LABEL[d.service_type] : "")}
          {field("AWB / Tracking ID", <span className="font-mono">{d.awb}</span>)}
          {field("Insurance", d.insurance ? "Yes" : "No")}
          {field("Pickup Reference", d.pickup_ref)}
          {field("Delivery Date", d.delivery_date ? day(d.delivery_date) : "")}
          {field("Remarks", d.remarks)}
          {field("Dispatched By", who as string | null)}
        </dl>
      </div>

      {ev && ev.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">Parcel History</h3>
          <ol className="space-y-1 text-xs">
            {ev.map((e, i) => <li key={i} className="flex items-center justify-between gap-2"><StatusPill status={e.status} /><span className="text-muted">{time(e.at)}</span></li>)}
          </ol>
        </div>
      )}

      {canManage && here && !final && (
        <>
          <StatusForm dispatchId={d.id} current={d.status} today={today} />
          <Link href={keep({ p: "edit", sel: d.id })} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">Edit courier details</Link>
        </>
      )}
      {final && <p className="text-xs text-muted">This parcel is {STATUS_LABEL[d.status].toLowerCase()}, so it cannot be changed. {d.status === "RTO" ? "Putting the goods back in stock belongs to the Returns page." : ""}</p>}
      <Link href={`/dispatch/${d.id}/label`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted"><Printer size={16} aria-hidden /> Print Label</Link>
      <ItemsInOrder orderId={d.order_id} />
    </div>
  );
}
