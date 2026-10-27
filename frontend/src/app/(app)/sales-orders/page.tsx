import Link from "next/link";
import {
  ArrowDownToLine, Ban, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText, PackageCheck, Plus, Search, SquarePen, Truck, X as XIcon, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNELS, CHANNEL_BADGE, CHANNEL_LABEL, ORDER_STATUS_LABEL } from "@/lib/validation/sales-order";
import { RowsPerPage } from "../items/item-controls";
import { PrintButton } from "../stock/movements/ledger-controls";
import { OrderDecision, OrderForm, OrderRowMenu, type FormCustomer, type FormLine, type OrderInitial } from "./order-form";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_FILTERS = ["PENDING", "CONFIRMED", "IN_PACKING", "DISPATCHED", "CANCELLED"] as const;
const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  CONFIRMED: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  IN_PACKING: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  DISPATCHED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  CANCELLED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const STATUS_COLOR: Record<string, string> = { CONFIRMED: "#2a63d6", IN_PACKING: "#e8b21a", DISPATCHED: "#16a05f", PENDING: "#e08a1a", CANCELLED: "#d6402f" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; order_no: string; order_date: string; status: string; channel: string; dispatch_date: string | null; customer_id: string; customer_name: string;
  place_name: string; location_id: string; items: number; qty: number; total: number;
};
type PageData = {
  total: number; rows: Row[]; customers: { id: string; name: string }[];
  kpi: { total: number; pending: number; confirmed: number; in_packing: number; dispatched: number; cancelled: number; new_month: number };
  trend: { day: string; orders: number; value: number }[];
};
const EMPTY: PageData = { total: 0, rows: [], customers: [], kpi: { total: 0, pending: 0, confirmed: 0, in_packing: 0, dispatched: 0, cancelled: 0, new_month: 0 }, trend: [] };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inr = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{ORDER_STATUS_LABEL[status]}</span>;
const ChannelCell = ({ channel }: { channel: string }) => {
  const b = CHANNEL_BADGE[channel] ?? CHANNEL_BADGE.OTHER;
  return <span className="flex items-center gap-2"><span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: b.bg }}>{b.letter}</span><span>{CHANNEL_LABEL[channel]}</span></span>;
};

export default async function SalesOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("sales_orders.view", "sales_orders.create", "sales_orders.confirm");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const channel = (CHANNELS as readonly string[]).includes(first(sp.channel) ?? "") ? first(sp.channel)! : "all";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const customer = z.uuid().safeParse(first(sp.customer)).data ?? "";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canCreate = can(user, "sales_orders.create");
  const canConfirm = can(user, "sales_orders.confirm");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_orders_page", {
    p_q: q || null, p_channel: channel === "all" ? null : channel, p_status: status === "all" ? null : status, p_customer: customer || null,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const editId = z.uuid().safeParse(first(sp.edit)).data;
  const selId = editId ?? (selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (first(sp.p) === "create" ? null : rows[0]?.id) ?? null));
  const panel = editId ? "edit" : first(sp.p) === "details" || (selParam && selParam !== "none" && first(sp.p) !== "create") ? "details" : canCreate && (first(sp.p) === "create" || !selParam) ? "create" : "details";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, channel: channel !== "all" ? channel : undefined, status: status !== "all" ? status : undefined, customer: customer || undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: first(sp.p),
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/sales-orders?${s}` : "/sales-orders";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, channel: channel !== "all" ? channel : "", status: status !== "all" ? status : "", customer, from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || customer || from || to || channel !== "all" || status !== "all");
  const segments = STATUS_FILTERS.map((s) => ({ key: s, label: ORDER_STATUS_LABEL[s], value: s === "PENDING" ? kpi.pending : s === "CONFIRMED" ? kpi.confirmed : s === "IN_PACKING" ? kpi.in_packing : s === "DISPATCHED" ? kpi.dispatched : kpi.cancelled, color: STATUS_COLOR[s] }))
    .sort((a, b) => b.value - a.value);

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Sales &amp; Dispatch</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Sales Orders</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Sales Orders</h1>
          <p className="mt-1 text-sm text-muted">Make and follow customer orders from confirmation to dispatch. An order does not change stock; stock goes out when the goods are packed and dispatched.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/sales-orders/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
          {canCreate && (
            <Link href={keep({ p: "create", sel: undefined, edit: undefined })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Plus size={18} aria-hidden /> New Sales Order
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={FileText} tint="blue" label="Total Orders" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={Clock} tint="red" label="Pending Confirmation" value={n(kpi.pending)} href={keep({ status: "PENDING", page: undefined, sel: undefined })} sub={<span className="text-muted">Waiting for a person</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Confirmed" value={n(kpi.confirmed)} href={keep({ status: "CONFIRMED", page: undefined, sel: undefined })} sub={<span className="text-muted">Ready to pack</span>} />
        <Kpi icon={PackageCheck} tint="blue" label="In Packing" value={n(kpi.in_packing)} href={keep({ status: "IN_PACKING", page: undefined, sel: undefined })} sub={<span className="text-muted">Set by Picking &amp; Packing</span>} />
        <Kpi icon={Truck} tint="green" label="Dispatched" value={n(kpi.dispatched)} href={keep({ status: "DISPATCHED", page: undefined, sel: undefined })} sub={<span className="text-muted">Set by Dispatch</span>} />
        <Kpi icon={Ban} tint="red" label="Cancelled" value={n(kpi.cancelled)} href={keep({ status: "CANCELLED", page: undefined, sel: undefined })} sub={<span className="text-muted">No stock effect</span>} />
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
              <FilterSelect label="Channel" name="channel" value={channel}>
                <option value="all">All Channels</option>
                {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
              </FilterSelect>
              <FilterSelect label="Status" name="status" value={status}>
                <option value="all">All Status</option>
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
              </FilterSelect>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
                <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
                <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <FilterSelect label="Customer" name="customer" value={customer}>
                <option value="">All Customers</option>
                {result.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </FilterSelect>
              <Link href="/sales-orders" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={FileText} title="No sales orders found" text={filtersOn ? "Try a different word, or press Clear." : "A sales order records what a customer wants. Make the first one from the form on the right."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Order No.</th><th>Date</th><th>Customer Name</th><th>Channel</th><th className="text-right">Items</th><th className="text-right">Order Value</th><th>Status</th><th>Dispatch Date</th><th className="print:hidden">Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const selected = r.id === selId && panel !== "create";
                      const viewHref = keep({ sel: r.id, p: "details", edit: undefined });
                      return (
                        <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.order_no}</Link></td>
                          <td className="whitespace-nowrap">{day(r.order_date)}</td>
                          <td className="min-w-32 font-medium">{r.customer_name}</td>
                          <td className="whitespace-nowrap"><ChannelCell channel={r.channel} /></td>
                          <td className="text-right font-mono">{n(r.items)}</td>
                          <td className="text-right font-mono">{inr(r.total)}</td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="whitespace-nowrap">{r.dispatch_date ? day(r.dispatch_date) : "-"}</td>
                          <td className="print:hidden">
                            <span className="flex items-center gap-1">
                              <Link href={viewHref} aria-label={`View ${r.order_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              {canCreate && r.status === "PENDING" && <Link href={keep({ edit: r.id, p: undefined, sel: undefined })} aria-label={`Edit ${r.order_no}`} title="Edit" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                              <OrderRowMenu viewHref={viewHref} />
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

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Sales Orders Trend (Last 30 Days)</h2>
              <OrdersTrend points={result.trend} />
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Order Status Distribution</h2>
              {kpi.total === 0 ? <p className="py-8 text-center text-sm text-muted">No orders yet.</p> : (
                <DonutChart segments={segments} centerValue={n(kpi.total)} centerLabel="Total Orders" ariaLabel="Sales orders by status" />
              )}
            </section>
          </div>
        </div>

        <aside aria-label="Sales order" className="h-fit min-w-0 space-y-5 xl:sticky xl:top-20 print:hidden">
          <div className={`${cardClass} !p-4`}>
            <div role="tablist" aria-label="Order panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
              {canCreate ? (
                <Link href={keep({ p: "create", sel: undefined, edit: undefined })} role="tab" aria-selected={panel === "create" || panel === "edit"}
                  className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "create" || panel === "edit" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>{panel === "edit" ? "Edit Order" : "Create New Order"}</Link>
              ) : <span />}
              <Link href={keep({ p: "details", sel: selId ?? rows[0]?.id, edit: undefined })} role="tab" aria-selected={panel === "details"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "details" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Order Details</Link>
            </div>
            {panel === "create" || panel === "edit" ? <FormPanel user={user} editId={panel === "edit" ? selId : null} cancelHref={keep({ edit: undefined, p: "details", sel: selId ?? undefined })} /> : <DetailsPanel selId={selId} keep={keep} user={user} canConfirm={canConfirm} canCreate={canCreate} />}
          </div>

          <div className={`${cardClass} !p-4`}>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-bold">Recent Orders</h2><Link href="/sales-orders" className="text-xs font-semibold">View All</Link></div>
            {rows.length === 0 ? <p className="text-xs text-muted">No orders yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-xs">
                  <thead><tr className="text-muted"><th className="py-1 pr-2">Date</th><th className="py-1 pr-2">Order No.</th><th className="py-1 pr-2">Customer</th><th className="py-1 pr-2 text-right">Value</th><th className="py-1">Status</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-1 pr-2">{new Date(`${r.order_date}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}</td>
                        <td className="py-1 pr-2"><Link href={keep({ sel: r.id, p: "details", edit: undefined })}>{r.order_no}</Link></td>
                        <td className="max-w-24 truncate py-1 pr-2">{r.customer_name}</td>
                        <td className="py-1 pr-2 text-right font-mono">{inr(r.total)}</td>
                        <td className="py-1"><StatusPill status={r.status} /></td>
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", red: "bg-[#fde8e8] text-[#c8302f]" } as const;

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

// Orders per day (columns) and their value (line) for the last 30 days.
function OrdersTrend({ points }: { points: { day: string; orders: number; value: number }[] }) {
  const W = 640, H = 220, L = 34, R = 46, T = 10, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const maxN = Math.max(1, ...points.map((p) => p.orders));
  const maxV = Math.max(1, ...points.map((p) => p.value));
  const step = plotW / Math.max(points.length, 1);
  const bw = Math.min(8, step * 0.55);
  const yN = (v: number) => T + plotH - (v / maxN) * plotH;
  const yV = (v: number) => T + plotH - (v / maxV) * plotH;
  const empty = points.every((p) => p.orders === 0);
  if (empty) return <p className="py-10 text-center text-sm text-muted">No orders in the last 30 days.</p>;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(L + i * step + step / 2).toFixed(1)},${yV(p.value).toFixed(1)}`).join(" ");
  const label = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#2a63d6]" /> Order Count</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#16a05f]" /> Order Value (₹)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Orders per day and their value, last 30 days" className="h-auto w-full">
        {[0, 0.5, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={T + plotH - f * plotH} y2={T + plotH - f * plotH} stroke="var(--line)" strokeWidth="1" />)}
        {[0, 0.5, 1].map((f) => <text key={`n${f}`} x={L - 5} y={T + plotH - f * plotH + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{Math.round(f * maxN)}</text>)}
        {[0, 0.5, 1].map((f) => <text key={`v${f}`} x={W - R + 5} y={T + plotH - f * plotH + 4} className="fill-[var(--muted)] text-[10px]">{f === 0 ? "0" : `${Math.round((f * maxV) / 1000)}K`}</text>)}
        {points.map((p, i) => {
          const x = L + i * step + step / 2;
          return (
            <g key={p.day}>
              <title>{`${label(p.day)}: ${p.orders} orders, ${inr(p.value)}`}</title>
              {p.orders > 0 && <rect x={x - bw / 2} y={yN(p.orders)} width={bw} height={T + plotH - yN(p.orders)} rx="1.5" fill="#2a63d6" />}
              {i % 5 === 0 && <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{label(p.day)}</text>}
            </g>
          );
        })}
        <path d={line} fill="none" stroke="#16a05f" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div className="sr-only"><ul>{points.map((p) => <li key={p.day}>{label(p.day)}: {p.orders} orders, {inr(p.value)}</li>)}</ul></div>
    </div>
  );
}

// "Create New Sales Order" or "Edit": the form needs the active customers with their addresses.
async function FormPanel({ user, editId, cancelHref }: { user: Awaited<ReturnType<typeof requireAnyPermission>>; editId: string | null; cancelHref: string }) {
  if (!can(user, "sales_orders.create")) return <p className="py-6 text-center text-sm text-muted">You may look at orders but not make one.</p>;
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet. Ask an administrator.</p>;
  const supabase = await createClient();
  const { data: cs } = await supabase.from("customers").select("id, name, address, city, state, is_active").eq("is_active", true).order("name");
  const customers: FormCustomer[] = (cs ?? []).map((c) => ({ id: c.id, name: c.name, address: [c.address, c.city, c.state].filter(Boolean).join(", ") }));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  let initial: OrderInitial | undefined;
  if (editId) {
    const { data: o } = await supabase.from("sales_orders").select("*").eq("id", editId).maybeSingle();
    if (!o || o.status !== "PENDING") return <p className="py-6 text-center text-sm text-muted">Only an order that waits for confirmation can be edited.</p>;
    const { data: ls } = await supabase.from("sales_order_lines").select("item_id, quantity, rate, items(internal_item_code, item_name, unit)").eq("order_id", o.id).order("id");
    const { data: units } = await supabase.from("units").select("code, decimals");
    const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
    const ids = (ls ?? []).map((l) => l.item_id);
    const { data: bal } = ids.length ? await supabase.from("stock_balances").select("item_id, quantity").eq("location_id", loc.id).in("item_id", ids) : { data: [] };
    const have = new Map((bal ?? []).map((b) => [b.item_id as string, Number(b.quantity)]));
    const lines: FormLine[] = ((ls ?? []) as unknown as { item_id: string; quantity: number; rate: number; items: { internal_item_code: string; item_name: string; unit: string } | null }[]).map((l) => ({
      itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "", decimals: dec.get(l.items?.unit ?? "") ?? 0,
      available: have.get(l.item_id) ?? 0, quantity: String(Number(l.quantity)), rate: String(Number(l.rate)),
    }));
    initial = {
      id: o.id, customerId: o.customer_id, channel: o.channel, orderDate: o.order_date, expectedDispatch: o.expected_dispatch ?? "", shippingAddress: o.shipping_address ?? "", remarks: o.remarks ?? "",
      discount: Number(o.discount) ? String(Number(o.discount)) : "", shippingCharges: Number(o.shipping_charges) ? String(Number(o.shipping_charges)) : "", lines,
    };
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">The order is for {loc.name}. To use another place, switch your working place at the top.</p>
      <OrderForm key={editId ?? "new"} customers={customers} today={today} initial={initial} cancelHref={cancelHref} />
    </div>
  );
}

type Line = { id: number; quantity: number; rate: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

async function DetailsPanel({ selId, keep, user, canConfirm, canCreate }: { selId: string | null; keep: (extra: Record<string, string | number | undefined>) => string; user: Awaited<ReturnType<typeof requireAnyPermission>>; canConfirm: boolean; canCreate: boolean }) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose an order from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: o } = await supabase.from("sales_orders").select("*, customers(name, phone, gstin), locations(name, code)").eq("id", selId).maybeSingle();
  if (!o) return <p className="py-6 text-center text-sm text-muted">This order was not found, or you may not see it.</p>;
  const { data: lineData } = await supabase.from("sales_order_lines").select("id, quantity, rate, items(internal_item_code, item_name, unit)").eq("order_id", o.id).order("id");
  const lines = (lineData ?? []) as unknown as Line[];
  const cust = o.customers as unknown as { name: string; phone: string | null };
  const place = o.locations as unknown as { name: string; code: string };
  const { data: who } = await supabase.rpc("person_name", { p_id: o.created_by });
  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const here = mine.has(o.location_id);
  const sub = lines.reduce((a, l) => a + Number(l.quantity) * Number(l.rate), 0);
  const grand = sub - Number(o.discount) + Number(o.shipping_charges);
  const cancelled = o.status === "CANCELLED";
  const rank = ["PENDING", "CONFIRMED", "IN_PACKING", "DISPATCHED"].indexOf(o.status);
  const steps = [
    { label: "Created", when: o.created_at as string | null, done: true, bad: false },
    { label: "Confirmed", when: o.confirmed_at as string | null, done: rank >= 1 || !!o.confirmed_at, bad: false },
    { label: "Packing", when: null as string | null, done: rank >= 2, bad: false },
    cancelled ? { label: "Cancelled", when: o.cancelled_at as string | null, done: true, bad: true } : { label: "Dispatched", when: o.dispatch_date as string | null, done: rank >= 3, bad: false },
  ];
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{o.order_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={o.status} />
          <Link href={keep({ sel: "none", p: undefined })} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
        </div>
      </div>
      <dl>
        {field("Customer", cust.name)}
        {field("Phone", cust.phone)}
        {field("Order Date", day(o.order_date))}
        {field("Sales Channel", <ChannelCell channel={o.channel} />)}
        {field("Ships From", `${place.name} (${place.code})`)}
        {field("Expected Dispatch", o.expected_dispatch ? day(o.expected_dispatch) : "")}
        {field("Dispatch Date", o.dispatch_date ? day(o.dispatch_date) : "")}
        {field("Shipping Address", o.shipping_address)}
        {field("Remarks", o.remarks)}
        {o.cancel_note && field("Cancel Note", o.cancel_note)}
        {field("Created By", who as string | null)}
      </dl>

      <h3 className="mb-2 mt-3 text-sm font-bold">Order Progress</h3>
      <ol className="grid grid-cols-4 gap-1 text-center">
        {steps.map((s, i) => (
          <li key={s.label} className="relative min-w-0">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[11px] h-0.5 w-full ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "bg-[var(--line-strong)]"}`} />}
            <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "border-2 border-[var(--line-strong)] bg-surface"}`}>
              {s.done && (s.bad ? <XIcon size={13} aria-hidden /> : <Check size={13} aria-hidden />)}
            </span>
            <span className={`mt-1 block text-[10px] leading-tight ${s.done ? "font-medium" : "text-muted"}`}>{s.label}</span>
            <span className="block text-[9px] leading-tight text-muted">{s.when && s.label !== "Dispatched" ? dateTime(s.when).split(",")[0] : ""}</span>
          </li>
        ))}
      </ol>

      <h3 className="mb-1 mt-3 text-sm font-bold">Items ({lines.length})</h3>
      <ul className="divide-y divide-line text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0"><span className="block font-semibold">{l.items?.internal_item_code}</span><span className="block truncate text-xs text-muted">{l.items?.item_name}</span></span>
            <span className="shrink-0 text-right font-mono text-xs"><span className="block">{n(Number(l.quantity))} {l.items?.unit} × {inr2(Number(l.rate))}</span><span className="block font-semibold">{inr2(Number(l.quantity) * Number(l.rate))}</span></span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1 rounded-xl border border-line bg-surface-muted p-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Sub Total</dt><dd className="font-mono">{inr2(sub)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Discount</dt><dd className="font-mono">{inr2(Number(o.discount))}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Shipping Charges</dt><dd className="font-mono">{inr2(Number(o.shipping_charges))}</dd></div>
        <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Grand Total</dt><dd className="font-mono">{inr2(grand)}</dd></div>
      </dl>

      {here && ((canConfirm && o.status === "PENDING") || (canCreate && (o.status === "PENDING" || o.status === "CONFIRMED"))) && (
        <div className="mt-3"><OrderDecision id={o.id} canConfirm={canConfirm} pending={o.status === "PENDING"} canCancel={canCreate && (o.status === "PENDING" || o.status === "CONFIRMED")} /></div>
      )}
      {canCreate && here && o.status === "PENDING" && (
        <Link href={keep({ edit: o.id, p: undefined, sel: undefined })} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><SquarePen size={16} aria-hidden /> Edit Order</Link>
      )}
      {o.status === "PENDING" && !canConfirm && <p className="mt-3 text-xs text-muted">Waiting for a person who may confirm orders.</p>}
    </div>
  );
}

export const metadata = { title: "Sales Orders" };
