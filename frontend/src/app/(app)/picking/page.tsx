import Link from "next/link";
import { ArrowDownToLine, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, Eye, PackageCheck, Play, Printer, Search, Timer, Truck, X as XIcon, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { ColoredColumns, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { PACKING_LABEL, PRIORITY_LABEL, STAGES, STAGE_LABEL } from "@/lib/validation/picking";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNELS, CHANNEL_BADGE, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { RowsPerPage } from "../items/item-controls";
import { CancelPicking, PackForm, PickRowMenu, PickSheet, StartForm, type PickLine } from "./picking-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_FILTERS = [...STAGES, "DELAYED"] as readonly string[];
const STAGE_STYLE: Record<string, string> = {
  PENDING_PICKING: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  IN_PICKING: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  IN_PACKING: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  READY: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  DISPATCHED: "bg-[#ece8fb] text-[#5b3fc0] dark:bg-[#2c2556] dark:text-[#c3b5ff]",
};
const STAGE_COLOR: Record<string, string> = { PENDING_PICKING: "#e08a1a", IN_PICKING: "#2a63d6", IN_PACKING: "#e8b21a", READY: "#16a05f", DISPATCHED: "#7a55d6" };
const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  MEDIUM: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  LOW: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  order_id: string; order_no: string; order_date: string; expected_dispatch: string | null; channel: string; customer_name: string; location_id: string; place_name: string;
  job_id: string | null; priority: string | null; stage: string; items: number; picked_items: number; delayed: boolean; job_updated: string | null; job_user: string | null;
};
type PageData = {
  total: number; rows: Row[]; places: { id: string; name: string }[];
  kpi: { total: number; pending: number; in_picking: number; in_packing: number; ready: number; dispatched: number; delayed: number };
  channels: { channel: string; n: number }[]; recent: { order_no: string; stage: string; at: string; user: string | null }[];
};
const EMPTY: PageData = { total: 0, rows: [], places: [], kpi: { total: 0, pending: 0, in_picking: 0, in_packing: 0, ready: 0, dispatched: 0, delayed: 0 }, channels: [], recent: [] };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const StagePill = ({ stage }: { stage: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STAGE_STYLE[stage]}`}>{STAGE_LABEL[stage]}</span>;
const PriorityPill = ({ priority }: { priority: string | null }) => priority
  ? <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[priority]}`}>{PRIORITY_LABEL[priority]}</span> : <span className="text-muted">-</span>;
const ChannelCell = ({ channel }: { channel: string }) => {
  const b = CHANNEL_BADGE[channel] ?? CHANNEL_BADGE.OTHER;
  return <span className="flex items-center gap-2"><span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: b.bg }}>{b.letter}</span><span>{CHANNEL_LABEL[channel]}</span></span>;
};

export default async function PickingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("picking.view", "picking.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const channel = (CHANNELS as readonly string[]).includes(first(sp.channel) ?? "") ? first(sp.channel)! : "all";
  const status = STATUS_FILTERS.includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const location = z.uuid().safeParse(first(sp.location)).data ?? "";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canManage = can(user, "picking.manage");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("picking_page", {
    p_q: q || null, p_location: location || null, p_channel: channel === "all" ? null : channel, p_status: status === "all" ? null : status,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.order_id ?? null);
  const panel = first(sp.p) === "start" && canManage ? "start" : first(sp.p) === "details" ? "details" : "work";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, location: location || undefined, channel: channel !== "all" ? channel : undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: first(sp.p),
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/picking?${s}` : "/picking";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, location, channel: channel !== "all" ? channel : "", status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || location || from || to || channel !== "all" || status !== "all");
  const stageCount: Record<string, number> = { PENDING_PICKING: kpi.pending, IN_PICKING: kpi.in_picking, IN_PACKING: kpi.in_packing, READY: kpi.ready, DISPATCHED: kpi.dispatched };
  const segments = STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], value: stageCount[s], color: STAGE_COLOR[s] })).sort((a, b) => b.value - a.value);
  const channelColors = ["#2a63d6", "#16a05f", "#e8b21a", "#7a55d6", "#d6402f", "#8b95a5"];
  const channelSegs = result.channels.map((c, i) => ({ key: c.channel, label: CHANNEL_LABEL[c.channel] ?? c.channel, value: Number(c.n), color: channelColors[i % channelColors.length] }));
  const open = kpi.pending + kpi.in_picking + kpi.in_packing + kpi.ready;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Sales &amp; Dispatch</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Picking &amp; Packing</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Picking &amp; Packing</h1>
          <p className="mt-1 text-sm text-muted">Pick the items of confirmed orders from the shelves and pack them. This is a record only; stock goes out when the order is dispatched.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {selId && (
            <Link href={`/picking/${selId}/print`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
              <Printer size={18} aria-hidden /> Print Pick List
            </Link>
          )}
          <a href={`/picking/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canManage && (
            <Link href={keep({ p: "start" })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Play size={18} aria-hidden /> Start Picking
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ClipboardList} tint="blue" label="Total Orders" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="text-muted">{n(open)} still open</span>} />
        <Kpi icon={Clock} tint="amber" label="Pending Picking" value={n(kpi.pending)} href={keep({ status: "PENDING_PICKING", page: undefined, sel: undefined })} sub={<span className="text-muted">Confirmed, not started</span>} />
        <Kpi icon={ClipboardList} tint="blue" label="In Picking" value={n(kpi.in_picking)} href={keep({ status: "IN_PICKING", page: undefined, sel: undefined })} sub={<span className="text-muted">Being picked</span>} />
        <Kpi icon={PackageCheck} tint="amber" label="In Packing" value={n(kpi.in_packing)} href={keep({ status: "IN_PACKING", page: undefined, sel: undefined })} sub={<span className="text-muted">Picked, to be packed</span>} />
        <Kpi icon={Truck} tint="green" label="Ready to Dispatch" value={n(kpi.ready)} href={keep({ status: "READY", page: undefined, sel: undefined })} sub={<span className="text-muted">Packed</span>} />
        <Kpi icon={Timer} tint="red" label="Delayed" value={n(kpi.delayed)} href={keep({ status: "DELAYED", page: undefined, sel: undefined })} sub={<span className="text-muted">Past expected dispatch</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(10rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
              <label className="relative block md:col-span-3 2xl:col-span-1">
                <span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search order no, customer, SKU" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
              </label>
              <FilterSelect label="Warehouse" name="location" value={location}>
                <option value="">All Warehouses</option>
                {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </FilterSelect>
              <FilterSelect label="Channel" name="channel" value={channel}>
                <option value="all">All Channels</option>
                {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </FilterSelect>
              <FilterSelect label="Status" name="status" value={status}>
                <option value="all">All Status</option>
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </FilterSelect>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
                <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
                <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <Link href="/picking" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No orders to pick" text={filtersOn ? "Try a different word, or press Clear." : "Confirmed sales orders appear here. Confirm an order in Sales Orders first."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Order No.</th><th>Date</th><th>Customer</th><th>Channel</th><th className="text-right">Items</th><th className="text-right">Picking</th><th className="text-right">Packing</th><th>Status</th><th>Priority</th><th className="print:hidden">Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const selected = r.order_id === selId;
                      const viewHref = keep({ sel: r.order_id, p: "work" });
                      const packed = r.stage === "READY" || r.stage === "DISPATCHED";
                      const pickedDone = packed || r.stage === "IN_PACKING";
                      return (
                        <tr key={r.order_id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.order_no}</Link></td>
                          <td className="whitespace-nowrap">{day(r.order_date)}</td>
                          <td className="min-w-32 font-medium">{r.customer_name}</td>
                          <td className="whitespace-nowrap"><ChannelCell channel={r.channel} /></td>
                          <td className="text-right font-mono">{n(r.items)}</td>
                          <td className="whitespace-nowrap text-right font-mono">{pickedDone ? r.items : r.picked_items} / {r.items}</td>
                          <td className="whitespace-nowrap text-right font-mono">{packed ? r.items : 0} / {r.items}</td>
                          <td><span className="flex flex-wrap items-center gap-1"><StagePill stage={r.stage} />{r.delayed && <span className="rounded-md bg-[#fde8e8] px-1.5 py-0.5 text-[10px] font-semibold text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]">Delayed</span>}</span></td>
                          <td><PriorityPill priority={r.priority} /></td>
                          <td className="print:hidden">
                            <span className="flex items-center gap-1">
                              <Link href={viewHref} aria-label={`Open ${r.order_no}`} title="Open" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              <PickRowMenu viewHref={keep({ sel: r.order_id, p: "details" })} printHref={`/picking/${r.order_id}/print`} />
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
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} orders</span>
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
              <h2 className="mb-3 text-base font-bold">Picking &amp; Packing Progress</h2>
              {kpi.total === 0 ? <p className="py-8 text-center text-sm text-muted">No orders yet.</p> : (
                <DonutChart segments={segments} centerValue={n(kpi.total)} centerLabel="Total Orders" ariaLabel="Orders by picking and packing stage" />
              )}
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Orders by Status</h2>
              <ColoredColumns data={STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], value: stageCount[s], color: STAGE_COLOR[s] }))} ariaLabel="Number of orders in each stage" emptyText="No orders yet." />
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Channel Wise Open Orders</h2>
              {channelSegs.length === 0 ? <p className="py-8 text-center text-sm text-muted">No open orders.</p> : (
                <DonutChart segments={channelSegs} centerValue={n(channelSegs.reduce((a, c) => a + c.value, 0))} centerLabel="Open Orders" ariaLabel="Open orders by sales channel" />
              )}
            </section>
          </div>
        </div>

        <aside aria-label="Picking and packing" className="h-fit min-w-0 space-y-5 xl:sticky xl:top-20 print:hidden">
          <div className={`${cardClass} !p-4`}>
            <div role="tablist" aria-label="Order panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
              <Link href={keep({ p: "work", sel: selId ?? undefined })} role="tab" aria-selected={panel === "work" || panel === "start"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "work" || panel === "start" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>{panel === "start" ? "Start Picking" : "Picking & Packing"}</Link>
              <Link href={keep({ p: "details", sel: selId ?? undefined })} role="tab" aria-selected={panel === "details"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "details" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Order Details</Link>
            </div>
            {panel === "start" ? <StartPanel /> : <OrderPanel selId={selId} panel={panel} canManage={canManage} keep={keep} user={user} />}
          </div>

          <div className={`${cardClass} !p-4`}>
            <h2 className="mb-2 text-base font-bold">Recent Picking &amp; Packing Activity</h2>
            {result.recent.length === 0 ? <p className="text-xs text-muted">Nothing has been picked or packed yet.</p> : (
              <ul className="divide-y divide-line text-xs">
                {result.recent.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 py-1.5">
                    <span className="min-w-0"><span className="block font-semibold">{a.order_no}</span><span className="block text-muted">{a.user ?? "-"}</span></span>
                    <span className="shrink-0 text-right"><StagePill stage={a.stage} /><span className="mt-0.5 block text-muted">{dateTime(a.at)}</span></span>
                  </li>
                ))}
              </ul>
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", red: "bg-[#fde8e8] text-[#c8302f]", amber: "bg-[#fdf0e1] text-[#b45f08]" } as const;

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

// "Start Picking": confirmed orders that have no pick job yet.
async function StartPanel() {
  const supabase = await createClient();
  const { data: os } = await supabase.from("sales_orders").select("id, order_no, customers(name)").eq("status", "CONFIRMED").order("order_date").limit(200);
  const orders = ((os ?? []) as unknown as { id: string; order_no: string; customers: { name: string } | null }[]).map((o) => ({ id: o.id, label: `${o.order_no} - ${o.customers?.name ?? ""}` }));
  if (orders.length === 0) return <p className="py-6 text-center text-sm text-muted">No confirmed order is waiting. Confirm an order in Sales Orders first.</p>;
  return <StartForm orders={orders} orderId={null} />;
}

type JobLine = { item_id: string; required: number; picked: number; items: { internal_item_code: string; item_name: string; unit: string } | null };
type OrderLine = { item_id: string; quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

async function OrderPanel({ selId, panel, canManage, keep, user }: {
  selId: string | null; panel: "work" | "details"; canManage: boolean; keep: (extra: Record<string, string | number | undefined>) => string; user: Awaited<ReturnType<typeof requireAnyPermission>>;
}) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose an order from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: o } = await supabase.from("sales_orders").select("id, order_no, order_date, status, channel, expected_dispatch, location_id, shipping_address, remarks, customers(name, phone), locations(name, code)").eq("id", selId).maybeSingle();
  if (!o) return <p className="py-6 text-center text-sm text-muted">This order was not found, or you may not see it.</p>;
  const cust = o.customers as unknown as { name: string; phone: string | null } | null;
  const place = o.locations as unknown as { name: string; code: string } | null;
  const { data: job } = await supabase.from("pick_pack_jobs").select("*").eq("order_id", o.id).neq("status", "CANCELLED").maybeSingle();
  const stage = job ? job.status as string : o.status === "DISPATCHED" ? "DISPATCHED" : o.status === "IN_PACKING" ? "IN_PICKING" : "PENDING_PICKING";
  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const here = mine.has(o.location_id);

  const { data: ols } = await supabase.from("sales_order_lines").select("item_id, quantity, items(internal_item_code, item_name, unit)").eq("order_id", o.id).order("id");
  const orderLines = (ols ?? []) as unknown as OrderLine[];
  const jobLines: JobLine[] = job
    ? (((await supabase.from("pick_pack_lines").select("item_id, required, picked, items(internal_item_code, item_name, unit)").eq("job_id", job.id).order("id")).data ?? []) as unknown as JobLine[])
    : orderLines.map((l) => ({ item_id: l.item_id, required: Number(l.quantity), picked: 0, items: l.items }));

  const ids = jobLines.map((l) => l.item_id);
  const { data: bins } = ids.length ? await supabase.from("item_bins").select("item_id, storage_bins(code)").eq("location_id", o.location_id).in("item_id", ids) : { data: [] };
  const rack = new Map<string, string>();
  for (const b of (bins ?? []) as unknown as { item_id: string; storage_bins: { code: string } | null }[]) if (b.storage_bins) rack.set(b.item_id, [rack.get(b.item_id), b.storage_bins.code].filter(Boolean).join(", "));
  const lines: PickLine[] = jobLines.map((l) => ({
    itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "", required: Number(l.required), picked: Number(l.picked), location: rack.get(l.item_id) ?? "",
  }));

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const head = (
    <div className="mb-2 flex items-start justify-between gap-2">
      <h2 className="text-lg font-bold">{o.order_no}</h2>
      <div className="flex items-center gap-1">
        <StagePill stage={stage} />
        <Link href={keep({ sel: "none", p: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
      </div>
    </div>
  );

  if (panel === "details") {
    return (
      <div>
        {head}
        <dl>
          {field("Customer", cust?.name)}
          {field("Phone", cust?.phone)}
          {field("Order Date", day(o.order_date))}
          {field("Sales Channel", <ChannelCell channel={o.channel} />)}
          {field("Pick From", place ? `${place.name} (${place.code})` : "")}
          {field("Expected Dispatch", o.expected_dispatch ? day(o.expected_dispatch) : "")}
          {field("Shipping Address", o.shipping_address)}
          {field("Remarks", o.remarks)}
        </dl>
        <h3 className="mb-1 mt-3 text-sm font-bold">Items ({lines.length})</h3>
        <ul className="divide-y divide-line text-sm">
          {lines.map((l) => (
            <li key={l.itemId} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0"><span className="block font-semibold">{l.code}</span><span className="block truncate text-xs text-muted">{l.name}</span></span>
              <span className="shrink-0 font-mono text-xs">{n(l.required)} {l.unit}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const canAct = canManage && here;
  return (
    <div className="space-y-4">
      {head}
      <p className="text-xs text-muted">{cust?.name} · {place?.name}{o.expected_dispatch ? ` · dispatch by ${day(o.expected_dispatch)}` : ""}</p>

      {stage === "PENDING_PICKING" && (
        <>
          <ul className="divide-y divide-line text-sm">
            {lines.map((l) => (
              <li key={l.itemId} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block font-semibold">{l.code}</span><span className="block truncate text-xs text-muted">{l.name}{l.location ? ` · ${l.location}` : ""}</span></span>
                <span className="shrink-0 font-mono text-xs">{n(l.required)} {l.unit}</span>
              </li>
            ))}
          </ul>
          {canAct ? <StartForm orders={[]} orderId={o.id} /> : <p className="text-xs text-muted">{canManage ? "This order belongs to another place. Switch your working place to pick it." : "You may look at picking but not start it."}</p>}
        </>
      )}

      {(stage === "IN_PICKING" || stage === "IN_PACKING") && (
        job ? (
          <>
            <PickSheet jobId={job.id} lines={lines} editable={canAct && stage === "IN_PICKING"} />
            {stage === "IN_PACKING" && (canAct ? <PackForm jobId={job.id} /> : <p className="text-xs text-muted">Everything is picked. Waiting for packing.</p>)}
            {canAct && <CancelPicking jobId={job.id} orderId={o.id} />}
          </>
        ) : (
          <p className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-muted">This order was moved to packing in Sales Orders before picking was recorded here, so there is no pick sheet for it.</p>
        )
      )}

      {(stage === "READY" || stage === "DISPATCHED") && job && (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400"><CheckCircle2 size={18} aria-hidden /> {stage === "READY" ? "Packed and ready to dispatch" : "Dispatched"}</p>
          <dl>
            {field("Packing Type", PACKING_LABEL[job.packing_type as string] ?? job.packing_type)}
            {field("Box / Packet No.", job.box_no)}
            {field("Weight", job.weight_kg != null ? `${n(Number(job.weight_kg))} kg` : "")}
            {field("Dimensions", job.dim_l != null ? `${n(Number(job.dim_l))} x ${n(Number(job.dim_w))} x ${n(Number(job.dim_h))} cm` : "")}
            {field("Packed At", job.packed_at ? dateTime(job.packed_at) : "")}
            {field("Remarks", job.pack_remarks)}
          </dl>
          <PickSheet jobId={job.id} lines={lines} editable={false} />
          {stage === "READY" && canAct && <CancelPicking jobId={job.id} orderId={o.id} />}
        </>
      )}
    </div>
  );
}

export const metadata = { title: "Picking & Packing" };
