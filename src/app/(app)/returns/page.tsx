import Link from "next/link";
import { ArrowDownToLine, ChevronLeft, ChevronRight, ClipboardList, Eye, PackageSearch, Plus, Search, ShieldCheck, ShieldX, Truck, Undo2, X as XIcon, Clock, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { REASONS, REASON_LABEL, RESOLUTION_LABEL, STATUSES, STATUS_LABEL } from "@/lib/validation/returns";
import { CHANNELS, CHANNEL_BADGE, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { RowsPerPage } from "../items/item-controls";
import { PrintButton } from "../stock/movements/ledger-controls";
import { CreateReturnForm, DecisionForm, InspectionForm, ReturnRowMenu, ReturnStatusForm, type InspectLine, type OrderItem } from "./returns-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_STYLE: Record<string, string> = {
  PICKUP_PENDING: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  IN_TRANSIT: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  UNDER_INSPECTION: "bg-[#ece8fb] text-[#5b3fc0] dark:bg-[#2c2556] dark:text-[#c3b5ff]",
  APPROVED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  REJECTED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const STATUS_COLOR: Record<string, string> = { PICKUP_PENDING: "#e8b21a", IN_TRANSIT: "#2a63d6", UNDER_INSPECTION: "#7a55d6", APPROVED: "#16a05f", REJECTED: "#d6402f" };
const REASON_COLOR: Record<string, string> = { DAMAGED: "#d6402f", WRONG_ITEM: "#e8b21a", NOT_WORKING: "#2a63d6", CHANGED_MIND: "#16a05f", MISSING_ITEM: "#7a55d6", OTHER: "#8b95a5" };
const REASON_STYLE = "bg-[#fde8e8] text-[#b03030] dark:bg-[#3d1f26] dark:text-[#f0a8a8]";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; return_no: string; order_id: string; order_no: string; order_date: string; return_date: string; channel: string; customer_name: string; reason: string;
  status: string; resolution: string | null; pickup_awb: string | null; location_id: string; place_name: string; items: number;
};
type PageData = {
  total: number; rows: Row[]; orders: { order_id: string; order_no: string; customer_name: string }[];
  kpi: { total: number; pickup_pending: number; in_transit: number; under_inspection: number; approved: number; rejected: number };
  trend: { day: string; total: number; approved: number }[]; reasons_month: { reason: string; n: number }[]; recent: { return_no: string; status: string; at: string; user: string | null }[];
};
const EMPTY: PageData = { total: 0, rows: [], orders: [], kpi: { total: 0, pickup_pending: 0, in_transit: 0, under_inspection: 0, approved: 0, rejected: 0 }, trend: [], reasons_month: [], recent: [] };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
const ChannelCell = ({ channel }: { channel: string }) => {
  const b = CHANNEL_BADGE[channel] ?? CHANNEL_BADGE.OTHER;
  return <span className="flex items-center gap-2"><span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: b.bg }}>{b.letter}</span><span>{CHANNEL_LABEL[channel]}</span></span>;
};

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("returns.view", "returns.manage", "returns.approve");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const reason = (REASONS as readonly string[]).includes(first(sp.reason) ?? "") ? first(sp.reason)! : "all";
  const status = (STATUSES as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const channel = (CHANNELS as readonly string[]).includes(first(sp.channel) ?? "") ? first(sp.channel)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canManage = can(user, "returns.manage");
  const canApprove = can(user, "returns.approve");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("returns_page", {
    p_q: q || null, p_reason: reason === "all" ? null : reason, p_status: status === "all" ? null : status, p_channel: channel === "all" ? null : channel,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const selParam = first(sp.sel);
  const pRaw = first(sp.p);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (pRaw === "create" ? null : rows[0]?.id) ?? null);
  const orderParam = z.uuid().safeParse(first(sp.order)).data ?? "";
  const panel = pRaw === "inspect" ? "inspect" : pRaw === "details" || (selParam && selParam !== "none" && pRaw !== "create") ? "details" : canManage && (pRaw === "create" || !selParam) ? "create" : "details";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, reason: reason !== "all" ? reason : undefined, status: status !== "all" ? status : undefined, channel: channel !== "all" ? channel : undefined,
      from: from || undefined, to: to || undefined, size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: pRaw,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/returns?${s}` : "/returns";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, reason: reason !== "all" ? reason : "", status: status !== "all" ? status : "", channel: channel !== "all" ? channel : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();
  const filterBase = keep({ p: undefined, sel: undefined, order: undefined });

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || from || to || reason !== "all" || status !== "all" || channel !== "all");
  const statusCount: Record<string, number> = { PICKUP_PENDING: kpi.pickup_pending, IN_TRANSIT: kpi.in_transit, UNDER_INSPECTION: kpi.under_inspection, APPROVED: kpi.approved, REJECTED: kpi.rejected };
  const statusSegs = STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], value: statusCount[s], color: STATUS_COLOR[s] })).sort((a, b) => b.value - a.value);
  const monthTotal = result.reasons_month.reduce((a, c) => a + Number(c.n), 0);
  const reasonSegs = result.reasons_month.map((r) => ({ key: r.reason, label: REASON_LABEL[r.reason] ?? r.reason, value: Number(r.n), color: REASON_COLOR[r.reason] ?? "#8b95a5" }));

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Sales &amp; Dispatch</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Returns</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Returns</h1>
          <p className="mt-1 text-sm text-muted">Record goods that customers send back, follow the pickup, inspect the items and decide. Good items go back into stock only when a return is approved.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/returns/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
          {canManage && (
            <Link href={keep({ p: "create", sel: undefined, order: undefined })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Plus size={18} aria-hidden /> Create Return
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ClipboardList} tint="blue" label="Total Returns" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="text-muted">All time</span>} />
        <Kpi icon={Clock} tint="red" label="Pickup Pending" value={n(kpi.pickup_pending)} href={keep({ status: "PICKUP_PENDING", page: undefined, sel: undefined })} sub={<span className="text-muted">Waiting for pickup</span>} />
        <Kpi icon={Truck} tint="amber" label="In Transit" value={n(kpi.in_transit)} href={keep({ status: "IN_TRANSIT", page: undefined, sel: undefined })} sub={<span className="text-muted">Coming back</span>} />
        <Kpi icon={PackageSearch} tint="violet" label="Under Inspection" value={n(kpi.under_inspection)} href={keep({ status: "UNDER_INSPECTION", page: undefined, sel: undefined })} sub={<span className="text-muted">To be checked</span>} />
        <Kpi icon={ShieldCheck} tint="green" label="Approved" value={n(kpi.approved)} href={keep({ status: "APPROVED", page: undefined, sel: undefined })} sub={<span className="text-muted">Stock updated</span>} />
        <Kpi icon={ShieldX} tint="red" label="Rejected" value={n(kpi.rejected)} href={keep({ status: "REJECTED", page: undefined, sel: undefined })} sub={<span className="text-muted">No stock change</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(10rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
              <label className="relative block md:col-span-3 2xl:col-span-1">
                <span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search return ID, order no, customer, SKU" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
              </label>
              <FilterSelect label="Return Reason" name="reason" value={reason}>
                <option value="all">All Reasons</option>{REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
              </FilterSelect>
              <FilterSelect label="Return Status" name="status" value={status}>
                <option value="all">All Status</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </FilterSelect>
              <FilterSelect label="Channel" name="channel" value={channel}>
                <option value="all">All Channels</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </FilterSelect>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
                <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
                <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <Link href="/returns" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={Undo2} title="No returns found" text={filtersOn ? "Try a different word, or press Clear." : "A return is made for an order that was dispatched. Use the form on the right."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Return ID</th><th>Order No.</th><th>Date</th><th>Customer</th><th>Channel</th><th className="text-right">Items</th><th>Reason</th><th>Status</th><th>Refund / Replacement</th><th className="print:hidden">Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isSel = r.id === selId && panel !== "create";
                      const viewHref = keep({ sel: r.id, p: "details", order: undefined });
                      return (
                        <tr key={r.id} aria-selected={isSel} className={isSel ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.return_no}</Link></td>
                          <td className="whitespace-nowrap text-[13px]">{r.order_no}</td>
                          <td className="whitespace-nowrap">{day(r.return_date)}</td>
                          <td className="min-w-32 font-medium">{r.customer_name}</td>
                          <td className="whitespace-nowrap"><ChannelCell channel={r.channel} /></td>
                          <td className="text-right font-mono">{n(r.items)}</td>
                          <td><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${REASON_STYLE}`}>{REASON_LABEL[r.reason]}</span></td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="whitespace-nowrap">{r.resolution ? RESOLUTION_LABEL[r.resolution] : "-"}</td>
                          <td className="print:hidden">
                            <span className="flex items-center gap-1">
                              <Link href={viewHref} aria-label={`View ${r.return_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              <ReturnRowMenu viewHref={viewHref} inspectHref={keep({ sel: r.id, p: "inspect", order: undefined })} />
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
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} returns</span>
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
              <h2 className="mb-3 text-base font-bold">Returns Trend (Last 30 Days)</h2>
              <ReturnsTrend points={result.trend} />
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Return Reasons (This Month)</h2>
              {monthTotal === 0 ? <p className="py-8 text-center text-sm text-muted">No returns this month.</p> : (
                <DonutChart segments={reasonSegs} centerValue={n(monthTotal)} centerLabel="This Month" ariaLabel="Returns this month by reason" />
              )}
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Return Status</h2>
              {kpi.total === 0 ? <p className="py-8 text-center text-sm text-muted">No returns yet.</p> : (
                <DonutChart segments={statusSegs} centerValue={n(kpi.total)} centerLabel="Total Returns" ariaLabel="Returns by status" />
              )}
            </section>
          </div>
        </div>

        <aside aria-label="Return" className="h-fit min-w-0 space-y-5 xl:sticky xl:top-20 print:hidden">
          <div className={`${cardClass} !p-4`}>
            <div role="tablist" aria-label="Return panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
              <Link href={panel === "create" || !selId ? keep({ p: "create", sel: undefined, order: undefined }) : keep({ p: "details", sel: selId, order: undefined })} role="tab" aria-selected={panel !== "inspect"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel !== "inspect" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>{panel === "create" ? "New Return" : "Return Details"}</Link>
              <Link href={keep({ p: "inspect", sel: selId ?? rows[0]?.id, order: undefined })} role="tab" aria-selected={panel === "inspect"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "inspect" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Inspection &amp; Resolution</Link>
            </div>
            {panel === "create" ? (
              <CreatePanel result={result} orderParam={orderParam} baseHref={filterBase} today={today} />
            ) : (
              <ReturnPanel selId={selId} panel={panel} canManage={canManage} canApprove={canApprove} keep={keep} user={user} />
            )}
          </div>

          <div className={`${cardClass} !p-4`}>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-bold">Recent Return Activity</h2><Link href="/returns" className="text-xs font-semibold">View All</Link></div>
            {result.recent.length === 0 ? <p className="text-xs text-muted">No return activity yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-xs">
                  <thead><tr className="text-muted"><th className="py-1 pr-2">Time</th><th className="py-1 pr-2">Return ID</th><th className="py-1 pr-2">Activity</th><th className="py-1">User</th></tr></thead>
                  <tbody>
                    {result.recent.map((a, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1.5 pr-2">{time(a.at)}</td><td className="py-1.5 pr-2 font-semibold">{a.return_no}</td>
                        <td className="py-1.5 pr-2"><StatusPill status={a.status} /></td><td className="py-1.5">{a.user ?? "-"}</td>
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

// Returns made per day (columns) and approved per day (line), last 30 days.
function ReturnsTrend({ points }: { points: { day: string; total: number; approved: number }[] }) {
  const W = 400, H = 220, L = 28, R = 8, T = 10, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(1, ...points.map((p) => Math.max(p.total, p.approved)));
  const step = plotW / Math.max(points.length, 1);
  const bw = Math.min(7, step * 0.55);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  if (points.every((p) => p.total === 0 && p.approved === 0)) return <p className="py-10 text-center text-sm text-muted">No returns in the last 30 days.</p>;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(L + i * step + step / 2).toFixed(1)},${y(p.approved).toFixed(1)}`).join(" ");
  const label = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#2a63d6]" /> Total Returns</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#16a05f]" /> Approved</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Returns made and approved per day, last 30 days" className="h-auto w-full">
        {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />)}
        {ticks.map((t) => <text key={`n${t}`} x={L - 5} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{t}</text>)}
        {points.map((p, i) => {
          const x = L + i * step + step / 2;
          return (
            <g key={p.day}>
              <title>{`${label(p.day)}: ${p.total} returns, ${p.approved} approved`}</title>
              {p.total > 0 && <rect x={x - bw / 2} y={y(p.total)} width={bw} height={T + plotH - y(p.total)} rx="1.5" fill="#2a63d6" />}
              {i % 7 === 0 && <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{label(p.day)}</text>}
            </g>
          );
        })}
        <path d={line} fill="none" stroke="#16a05f" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div className="sr-only"><ul>{points.map((p) => <li key={p.day}>{label(p.day)}: {p.total} returns, {p.approved} approved</li>)}</ul></div>
    </div>
  );
}

async function CreatePanel({ result, orderParam, baseHref, today }: { result: PageData; orderParam: string; baseHref: string; today: string }) {
  const orders = result.orders.map((o) => ({ id: o.order_id, label: `${o.order_no} - ${o.customer_name}` }));
  const chosen = orders.some((o) => o.id === orderParam) ? orderParam : "";
  let info: { orderDate: string; customer: string; channel: string } | null = null;
  let items: OrderItem[] = [];
  if (chosen) {
    const supabase = await createClient();
    const { data: o } = await supabase.from("sales_orders").select("order_date, channel, customers(name)").eq("id", chosen).maybeSingle();
    if (o) info = { orderDate: day(o.order_date), customer: (o.customers as unknown as { name: string } | null)?.name ?? "", channel: CHANNEL_LABEL[o.channel] ?? o.channel };
    const { data: it } = await supabase.rpc("return_order_items", { p_order_id: chosen });
    items = ((it ?? []) as OrderItem[]).map((x) => ({ ...x, ordered: Number(x.ordered), returned: Number(x.returned), remaining: Number(x.remaining) }));
  }
  return (
    <div className="space-y-3">
      {orders.length === 0 && <p role="status" className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-muted">No order has been dispatched yet. A return can only be made for a dispatched order.</p>}
      <CreateReturnForm orders={orders} orderId={chosen} baseHref={baseHref} today={today} info={info} items={items} />
    </div>
  );
}

type Line = { item_id: string; quantity: number; condition: string; items: { internal_item_code: string; item_name: string; unit: string } | null };

async function ReturnPanel({ selId, panel, canManage, canApprove, keep, user }: {
  selId: string | null; panel: "details" | "inspect"; canManage: boolean; canApprove: boolean; keep: (extra: Record<string, string | number | undefined>) => string;
  user: Awaited<ReturnType<typeof requireAnyPermission>>;
}) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose a return from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: r } = await supabase.from("sales_returns").select("*, locations(name, code)").eq("id", selId).maybeSingle();
  if (!r) return <p className="py-6 text-center text-sm text-muted">This return was not found, or you may not see it.</p>;
  const { data: o } = await supabase.from("sales_orders").select("order_no, order_date, channel, customers(name, phone)").eq("id", r.order_id).maybeSingle();
  const cust = o?.customers as unknown as { name: string; phone: string | null } | null;
  const place = r.locations as unknown as { name: string; code: string };
  const { data: ls } = await supabase.from("sales_return_lines").select("item_id, quantity, condition, items(internal_item_code, item_name, unit)").eq("return_id", r.id).order("id");
  const lines = (ls ?? []) as unknown as Line[];
  const { data: who } = await supabase.rpc("person_name", { p_id: r.created_by });
  const { data: ev } = await supabase.from("sales_return_events").select("status, at").eq("return_id", r.id).order("id");
  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const here = mine.has(r.location_id);
  const decided = r.status === "APPROVED" || r.status === "REJECTED";
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const head = (
    <div className="mb-2 flex items-start justify-between gap-2">
      <h2 className="text-lg font-bold">{r.return_no}</h2>
      <div className="flex items-center gap-1">
        <StatusPill status={r.status} />
        <Link href={keep({ sel: "none", p: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
      </div>
    </div>
  );

  if (panel === "inspect") {
    const il: InspectLine[] = lines.map((l) => ({ itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "", quantity: Number(l.quantity), condition: l.condition }));
    const editable = canManage && here && !decided;
    return (
      <div className="space-y-4">
        {head}
        {r.status === "PICKUP_PENDING" && <p className="rounded-lg border border-line bg-surface-muted p-2 text-xs text-muted">The goods have not been collected yet. You can write the inspection once they are Under Inspection, but it can be saved at any time before the decision.</p>}
        <InspectionForm key={`${r.id}-${r.updated_at}`} returnId={r.id} lines={il} resolution={r.resolution ?? ""} note={r.inspection_note ?? ""} pickupAwb={r.pickup_awb ?? ""} editable={editable} />
        {decided ? (
          <p className="text-xs text-muted">This return is {STATUS_LABEL[r.status].toLowerCase()}{r.decided_at ? ` on ${time(r.decided_at)}` : ""}, so it cannot be changed. {r.status === "APPROVED" ? "Items marked Good were put back into stock." : ""}</p>
        ) : here && r.status === "UNDER_INSPECTION" ? <DecisionForm returnId={r.id} canApprove={canApprove} /> : <p className="text-xs text-muted">Approve or reject is possible when the return is Under Inspection.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {head}
        <dl>
          {field("Order No.", o?.order_no)}
          {field("Order Date", o ? day(o.order_date) : "")}
          {field("Customer", cust?.name)}
          {field("Phone", cust?.phone)}
          {field("Sales Channel", o ? <ChannelCell channel={o.channel} /> : "")}
          {field("Return Date", day(r.return_date))}
          {field("Return Reason", <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${REASON_STYLE}`}>{REASON_LABEL[r.reason]}</span>)}
          {field("Pickup AWB", r.pickup_awb ? <span className="font-mono">{r.pickup_awb}</span> : "")}
          {field("Returns To", `${place.name} (${place.code})`)}
          {field("Refund / Replacement", r.resolution ? RESOLUTION_LABEL[r.resolution] : "")}
          {field("Customer Remarks", r.remarks)}
          {r.inspection_note && field("Inspection Note", r.inspection_note)}
          {field("Made By", who as string | null)}
        </dl>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-bold">Item Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Item Name</th><th className="py-1 pr-2 text-right">Qty</th><th className="py-1">Condition</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.item_id} className="border-t border-line">
                  <td className="py-1.5 pr-2">{i + 1}</td><td className="py-1.5 pr-2 font-semibold">{l.items?.internal_item_code}</td><td className="max-w-24 truncate py-1.5 pr-2">{l.items?.item_name}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">{n(Number(l.quantity))} {l.items?.unit}</td>
                  <td className="py-1.5"><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${l.condition === "GOOD" ? "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]" : "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]"}`}>{l.condition === "GOOD" ? "Good" : l.condition === "DAMAGED" ? "Damaged" : "Used"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {ev && ev.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-bold">History</h3>
          <ol className="space-y-1 text-xs">{ev.map((e, i) => <li key={i} className="flex items-center justify-between gap-2"><StatusPill status={e.status} /><span className="text-muted">{time(e.at)}</span></li>)}</ol>
        </div>
      )}
      {canManage && here && !decided && <ReturnStatusForm returnId={r.id} current={r.status} />}
      <Link href={keep({ p: "inspect", sel: r.id })} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">Open Inspection &amp; Resolution</Link>
    </div>
  );
}
