import Link from "next/link";
import {
  ArrowDownToLine, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, Eye, FileText, IndianRupee, Layers, Loader, Plus, Search, SquarePen, X as XIcon, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { DonutChart, PairColumnChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../../items/item-controls";
import { PrintButton } from "../movements/ledger-controls";
import { REASON_LABEL } from "@/lib/validation/count";
import { CountDecision, CountRowMenu, CreateCountForm } from "./count-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_FILTERS = ["PENDING", "IN_PROGRESS", "WAITING_APPROVAL", "COMPLETED", "CANCELLED"] as const;
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", IN_PROGRESS: "In Progress", WAITING_APPROVAL: "Waiting Approval", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  IN_PROGRESS: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  WAITING_APPROVAL: "bg-[#efe9fb] text-[#6d4fd8] dark:bg-[#3a2a66] dark:text-[#c7b4ff]",
  COMPLETED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  CANCELLED: "bg-[#eceff3] text-[#5b6b7c] dark:bg-[#25394a] dark:text-[#b7c6d3]",
};
const TYPE_LABEL: Record<string, string> = { FULL: "Full Count", CYCLE: "Cycle Count", LOCATION: "Location Count" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REASON_COLORS = ["#d6402f", "#16a05f", "#2a63d6", "#e08a1a", "#7a4fd8"];

type Row = {
  id: string; count_no: string; created_at: string; count_type: string; status: string; place_name: string; location_id: string; items: number; counted: number;
  var_qty: number; var_value: number | null; created_by_name: string | null;
};
type PageData = {
  total: number; rows: Row[]; places: { id: string; name: string }[];
  kpi: { total: number; completed: number; in_progress: number; pending: number; waiting: number; variance_qty: number; variance_value: number | null; new_month: number };
  reasons: { reason: string; qty: number }[]; trend: { day: string; pos: number; neg: number }[];
};
const EMPTY: PageData = { total: 0, rows: [], places: [], kpi: { total: 0, completed: 0, in_progress: 0, pending: 0, waiting: 0, variance_qty: 0, variance_value: null, new_month: 0 }, reasons: [], trend: [] };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inr = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
const Var = ({ v }: { v: number }) => <span className={`font-mono ${v < 0 ? "text-[var(--danger)]" : v > 0 ? "text-green-700 dark:text-green-400" : "text-muted"}`}>{v > 0 ? `+${n(v)}` : n(v)}</span>;

export default async function PhysicalCountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("stock.view", "stock.adjust", "stock.approve");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const type = ["FULL", "CYCLE", "LOCATION"].includes(first(sp.type) ?? "") ? first(sp.type)! : "all";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canCount = can(user, "stock.adjust");
  const canApprove = can(user, "stock.approve");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("physical_counts_page", {
    p_q: q || null, p_location: place || null, p_type: type === "all" ? null : type, p_status: status === "all" ? null : status,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (first(sp.p) === "create" ? null : rows[0]?.id) ?? null);
  const panel = first(sp.p) === "details" || (selParam && selParam !== "none" && first(sp.p) !== "create") ? "details" : canCount && (first(sp.p) === "create" || !selParam) ? "create" : "details";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, place: place || undefined, type: type !== "all" ? type : undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: first(sp.p),
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/stock/count?${s}` : "/stock/count";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, place, type: type !== "all" ? type : "", status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || place || from || to || type !== "all" || status !== "all");
  const reasonTotal = result.reasons.reduce((a, r) => a + Number(r.qty), 0);
  const segments = result.reasons.map((r, i) => ({ key: r.reason, label: REASON_LABEL[r.reason] ?? r.reason, value: Number(r.qty), color: REASON_COLORS[i % REASON_COLORS.length] }));
  const trend = result.trend.map((t) => ({ key: t.day, label: new Date(`${t.day}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }), a: Number(t.pos), b: Number(t.neg) }));

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Inventory</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Physical Count</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Physical Count</h1>
          <p className="mt-1 text-sm text-muted">Count the real stock, compare it with the system and find the differences. A manager approves the finished count before stock changes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/stock/count/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
          {canCount && (
            <Link href={keep({ p: "create", sel: undefined })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Plus size={18} aria-hidden /> New Physical Count
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ClipboardList} tint="blue" label="Total Counts" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Completed" value={n(kpi.completed)} href={keep({ status: "COMPLETED", page: undefined, sel: undefined })} sub={<span className="text-muted">Stock corrected</span>} />
        <Kpi icon={Loader} tint="orange" label="In Progress" value={n(kpi.in_progress)} href={keep({ status: "IN_PROGRESS", page: undefined, sel: undefined })} sub={<span className="text-muted">{kpi.waiting} waiting for approval</span>} />
        <Kpi icon={Clock} tint="red" label="Pending" value={n(kpi.pending)} href={keep({ status: "PENDING", page: undefined, sel: undefined })} sub={<span className="text-muted">Not started</span>} />
        <Kpi icon={Layers} tint="violet" label="Total Variance (Qty)" value={n(kpi.variance_qty)} href={keep({ status: "COMPLETED", page: undefined, sel: undefined })} sub={<span className="text-muted">Completed counts, up and down</span>} />
        <Kpi icon={IndianRupee} tint="orange" label="Variance Value" value={kpi.variance_value === null ? "-" : inr(kpi.variance_value)} href={keep({ status: "COMPLETED", page: undefined, sel: undefined })} sub={<span className="text-muted">{can(user, "receipts.cost") ? "At average cost" : "Needs permission"}</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(10rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
              <label className="relative block md:col-span-3 2xl:col-span-1">
                <span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search count no, warehouse, SKU, item" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
              </label>
              <FilterSelect label="Warehouse" name="place" value={place}>
                <option value="">All Warehouses</option>
                {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </FilterSelect>
              <FilterSelect label="Count Type" name="type" value={type}>
                <option value="all">All Types</option>
                {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </FilterSelect>
              <FilterSelect label="Status" name="status" value={status}>
                <option value="all">All Status</option>
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </FilterSelect>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
                <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
                <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <Link href="/stock/count" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No physical counts found" text={filtersOn ? "Try a different word, or press Clear." : "A physical count checks the real stock against the system. Start one from the form on the right."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Count No.</th><th>Date</th><th>Warehouse</th><th>Count Type</th><th className="text-right">Total Items</th><th className="text-right">Counted</th><th className="text-right">Variance (Qty)</th>{can(user, "receipts.cost") && <th className="text-right">Variance Value</th>}<th>Status</th><th>Created By</th><th className="print:hidden">Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const selected = r.id === selId && panel === "details";
                      const viewHref = keep({ sel: r.id, p: "details" });
                      const editable = canCount && (r.status === "PENDING" || r.status === "IN_PROGRESS");
                      return (
                        <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.count_no}</Link></td>
                          <td className="whitespace-nowrap">{day(r.created_at)}</td>
                          <td className="min-w-24">{r.place_name}</td>
                          <td className="whitespace-nowrap">{TYPE_LABEL[r.count_type]}</td>
                          <td className="text-right font-mono">{n(r.items)}</td>
                          <td className="text-right font-mono">{n(r.counted)}</td>
                          <td className="text-right">{r.counted === 0 ? "-" : <Var v={r.var_qty} />}</td>
                          {can(user, "receipts.cost") && <td className="text-right font-mono">{r.var_value === null || r.counted === 0 ? "-" : inr(Math.abs(r.var_value))}</td>}
                          <td><StatusPill status={r.status} /></td>
                          <td className="whitespace-nowrap">{r.created_by_name ?? ""}</td>
                          <td className="print:hidden">
                            <span className="flex items-center gap-1">
                              <Link href={viewHref} aria-label={`View ${r.count_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              <Link href={`/stock/count/${r.id}`} aria-label={`Count sheet ${r.count_no}`} title={editable ? "Count items" : "Open count sheet"} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>
                              <CountRowMenu id={r.id} viewHref={viewHref} />
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
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} counts</span>
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

          <div className="grid gap-5 lg:grid-cols-2">
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Variance Analysis (This Month)</h2>
              {segments.length === 0 ? <p className="py-8 text-center text-sm text-muted">No completed count with a difference this month.</p> : (
                <DonutChart segments={segments} centerValue={n(reasonTotal)} centerLabel="Total Variance (Qty)" ariaLabel="Count differences by reason this month" />
              )}
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Variance Trend (Last 30 Days)</h2>
              <PairColumnChart data={trend} aLabel="Positive Variance" bLabel="Negative Variance" aColor="#16a05f" bColor="#d6402f" ariaLabel="Count differences per day, last 30 days" emptyText="No completed count in the last 30 days." />
            </section>
          </div>
        </div>

        <aside aria-label="Physical count" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20 print:hidden`}>
          <div role="tablist" aria-label="Count panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
            {canCount ? (
              <Link href={keep({ p: "create", sel: undefined })} role="tab" aria-selected={panel === "create"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "create" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Create New Count</Link>
            ) : <span />}
            <Link href={keep({ p: "details", sel: selId ?? rows[0]?.id })} role="tab" aria-selected={panel === "details"}
              className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "details" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Count Details</Link>
          </div>
          {panel === "create" ? <CreatePanel user={user} /> : <DetailsPanel selId={selId} keep={keep} canCount={canCount} canApprove={canApprove} user={user} />}
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", violet: "bg-[#ece8fb] text-[#6d4fd8]", orange: "bg-[#fdf0e1] text-[#b45f08]", red: "bg-[#fde8e8] text-[#c8302f]" } as const;

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

async function CreatePanel({ user }: { user: Awaited<ReturnType<typeof requireAnyPermission>> }) {
  if (!can(user, "stock.adjust")) return <p className="py-6 text-center text-sm text-muted">You may look at counts but not make one.</p>;
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet. Ask an administrator.</p>;
  const supabase = await createClient();
  const [{ data: cats }, { data: bins }] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("storage_bins").select("rack").eq("location_id", loc.id),
  ]);
  const racks = [...new Set((bins ?? []).map((b) => b.rack as string))].sort();
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">The count is for {loc.name}. To count another place, switch your working place at the top.</p>
      <CreateCountForm placeName={`${loc.name} (${loc.code})`} categories={cats ?? []} racks={racks} />
    </div>
  );
}

type LineRow = { id: number; expected: number; counted: number | null; reason: string | null; items: { internal_item_code: string; item_name: string; unit: string } | null };

async function DetailsPanel({ selId, keep, canCount, canApprove, user }: {
  selId: string | null; keep: (extra: Record<string, string | number | undefined>) => string; canCount: boolean; canApprove: boolean; user: Awaited<ReturnType<typeof requireAnyPermission>>;
}) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose a count from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: c } = await supabase.from("physical_counts").select("*, locations(name, code), categories(name)").eq("id", selId).maybeSingle();
  if (!c) return <p className="py-6 text-center text-sm text-muted">This count was not found, or you may not see it.</p>;
  const { data: lineData } = await supabase.from("physical_count_lines").select("id, expected, counted, reason, items(internal_item_code, item_name, unit)").eq("count_id", c.id).order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];
  const [{ data: who }, { data: decider }] = await Promise.all([
    supabase.rpc("person_name", { p_id: c.created_by }),
    c.decided_by ? supabase.rpc("person_name", { p_id: c.decided_by }) : Promise.resolve({ data: null }),
  ]);
  const place = c.locations as unknown as { name: string; code: string };
  const cat = (c.categories as unknown as { name: string } | null)?.name;
  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const here = mine.has(c.location_id);
  const open = c.status === "PENDING" || c.status === "IN_PROGRESS";
  const waiting = c.status === "WAITING_APPROVAL";
  const counted = lines.filter((l) => l.counted !== null).length;
  const pct = lines.length ? Math.round((counted / lines.length) * 100) : 0;
  const diffs = lines.filter((l) => l.counted !== null && Number(l.counted) !== Number(l.expected));
  const netVar = lines.reduce((a, l) => a + (l.counted === null ? 0 : Number(l.counted) - Number(l.expected)), 0);
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const steps = [
    { label: "Created", when: c.created_at as string | null, done: true, bad: false },
    { label: "Counted", when: null as string | null, done: c.status !== "PENDING" && c.status !== "CANCELLED" && counted > 0, bad: false },
    { label: "Sent", when: c.submitted_at as string | null, done: !!c.submitted_at && c.status !== "IN_PROGRESS" && c.status !== "PENDING", bad: false },
    c.status === "CANCELLED" ? { label: "Cancelled", when: c.decided_at as string | null, done: true, bad: true } : { label: "Completed", when: c.status === "COMPLETED" ? (c.decided_at as string | null) : null, done: c.status === "COMPLETED", bad: false },
  ];

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{c.count_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={c.status} />
          <Link href={keep({ sel: "none", p: undefined })} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
        </div>
      </div>
      <dl>
        {field("Date", dateTime(c.created_at))}
        {field("Warehouse", `${place.name} (${place.code})`)}
        {field("Count Type", TYPE_LABEL[c.count_type] + (cat ? ` - ${cat}` : c.rack ? ` - rack ${c.rack}` : ""))}
        {field("Created By", who as string | null)}
        {field("Notes", c.notes)}
        {c.decision_note && field(c.status === "IN_PROGRESS" ? "Sent back" : "Decision Note", c.decision_note)}
        {c.status === "COMPLETED" && field("Approved By", decider as string | null)}
      </dl>

      <h3 className="mb-1 mt-3 flex items-center justify-between text-sm font-bold">Count Progress <span className="font-normal text-muted">{pct}%</span></h3>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--line-strong)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Count progress"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} /></div>
      <p className="mt-1 text-xs text-muted">{counted} / {lines.length} items counted</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Counted Items" value={n(counted)} />
        <Stat label="Remaining" value={n(lines.length - counted)} />
        <Stat label="Variance (Qty)" value={counted === 0 ? "-" : (netVar > 0 ? "+" : "") + n(netVar)} />
      </div>

      <h3 className="mb-2 mt-3 text-sm font-bold">Progress</h3>
      <ol className="grid grid-cols-4 gap-1 text-center">
        {steps.map((s, i) => (
          <li key={s.label} className="relative min-w-0">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[11px] h-0.5 w-full ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "bg-[var(--line-strong)]"}`} />}
            <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "border-2 border-[var(--line-strong)] bg-surface"}`}>
              {s.done && (s.bad ? <XIcon size={13} aria-hidden /> : <Check size={13} aria-hidden />)}
            </span>
            <span className={`mt-1 block text-[10px] leading-tight ${s.done ? "font-medium" : "text-muted"}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      {diffs.length > 0 && (
        <>
          <h3 className="mb-1 mt-3 text-sm font-bold">Differences ({diffs.length})</h3>
          <ul className="divide-y divide-line text-sm">
            {diffs.slice(0, 8).map((l) => {
              const d = Number(l.counted) - Number(l.expected);
              return (
                <li key={l.id} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="min-w-0"><span className="block font-semibold">{l.items?.internal_item_code}</span><span className="block truncate text-xs text-muted">{l.reason ? REASON_LABEL[l.reason] : "No reason yet"}</span></span>
                  <span className="shrink-0 text-right font-mono text-xs"><span className="block text-muted">{n(Number(l.expected))} to {n(Number(l.counted))}</span><Var v={d} /></span>
                </li>
              );
            })}
          </ul>
          {diffs.length > 8 && <p className="mt-1 text-xs text-muted">The first 8 differences are shown. Open the count sheet for all.</p>}
        </>
      )}

      {(canApprove && waiting && here) || (canCount && !["COMPLETED", "CANCELLED"].includes(c.status) && here) ? (
        <div className="mt-3"><CountDecision id={c.id} canApprove={canApprove && here} waiting={waiting} canCancel={canCount && here && c.status !== "COMPLETED" && c.status !== "CANCELLED"} /></div>
      ) : null}
      {waiting && !(canApprove && here) && <p className="mt-3 text-xs text-muted">Waiting for a manager. The stock has not changed.</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/stock/count/${c.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong"><FileText size={16} aria-hidden /> {open && canCount && here ? "Count Items" : "Count Sheet"}</Link>
        <Link href={`/stock/movements?q=${encodeURIComponent(c.count_no)}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">Stock Ledger</Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-2.5">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-bold">{value}</p>
    </div>
  );
}
