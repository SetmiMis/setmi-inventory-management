import Link from "next/link";
import {
  ArrowDownToLine, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText, Layers, PackageMinus, PackagePlus, Plus, Search, Settings2, X as XIcon, XCircle, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { DonutChart, PairColumnChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getLang } from "@/lib/i18n";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { REASON_LABELS, type EntryReason } from "@/lib/validation/stock-entry";
import { RowsPerPage } from "../../items/item-controls";
import { PrintButton } from "../movements/ledger-controls";
import { AdjRowMenu } from "./adj-menu";
import { DecisionForm } from "./decision-form";
import { EntryForm } from "./entry-form";
import { ENTRY_LABELS } from "./labels";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_FILTERS = ["PENDING", "APPROVED", "REJECTED"] as const;
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };
const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  APPROVED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  REJECTED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REASON_COLORS = ["#2a63d6", "#16a05f", "#e08a1a", "#d6402f", "#7a4fd8", "#35b8d6", "#8a96a3", "#c2528a", "#4f9d2f", "#a87b1a"];

type Row = {
  id: string; entry_no: string; created_at: string; direction: "IN" | "OUT"; reason: EntryReason; reference: string | null; status: string; place_name: string; location_id: string;
  items: number; qty: number; first_code: string | null; first_name: string | null; requested_by: string | null;
};
type PageData = {
  total: number; rows: Row[]; places: { id: string; name: string }[];
  kpi: { total: number; increase: number; decrease: number; pending: number; approved: number; rejected: number; new_month: number };
  reasons: { reason: EntryReason; qty: number }[]; trend: { day: string; inc: number; dec: number }[];
};
const EMPTY: PageData = { total: 0, rows: [], places: [], kpi: { total: 0, increase: 0, decrease: 0, pending: 0, approved: 0, rejected: 0, new_month: 0 }, reasons: [], trend: [] };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
const TypePill = ({ dir }: { dir: string }) => (
  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${dir === "IN" ? "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]" : "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]"}`}>{dir === "IN" ? "Increase" : "Decrease"}</span>
);

export default async function StockAdjustmentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("stock.entry", "stock.view", "stock.approve");
  const lang = await getLang();
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const type = ["IN", "OUT"].includes(first(sp.type) ?? "") ? first(sp.type)! : "all";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canEntry = can(user, "stock.entry");
  const canApprove = can(user, "stock.approve");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_adjustments_page", {
    p_q: q || null, p_location: place || null, p_type: type === "all" ? null : type, p_status: status === "all" ? null : status,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const rl = REASON_LABELS[lang];

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (first(sp.p) === "create" ? null : rows[0]?.id) ?? null);
  const panel = first(sp.p) === "details" || (selParam && selParam !== "none" && first(sp.p) !== "create") ? "details" : canEntry && (first(sp.p) === "create" || !selParam) ? "create" : "details";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, place: place || undefined, type: type !== "all" ? type : undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: first(sp.p),
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/stock/entry?${s}` : "/stock/entry";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, place, type: type !== "all" ? type : "", status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || place || from || to || type !== "all" || status !== "all");
  const monthTotal = result.reasons.reduce((a, r) => a + Number(r.qty), 0);
  const segments = result.reasons.map((r, i) => ({ key: r.reason, label: rl[r.reason] ?? r.reason, value: Number(r.qty), color: REASON_COLORS[i % REASON_COLORS.length] }));
  const trend = result.trend.map((t) => ({
    key: t.day, label: new Date(`${t.day}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }), a: Number(t.inc), b: Number(t.dec),
  }));

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Inventory</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Stock Adjustment</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Stock Adjustment</h1>
          <p className="mt-1 text-sm text-muted">Adjust stock for damage, loss, found goods or other reasons. A manager approves the request before the stock changes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/stock/entry/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
          {canEntry && (
            <Link href={keep({ p: "create", sel: undefined })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Plus size={18} aria-hidden /> New Adjustment
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Settings2} tint="blue" label="Total Adjustments" value={n(kpi.total)} href={keep({ status: undefined, type: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={PackagePlus} tint="green" label="Increase (Qty)" value={n(kpi.increase)} href={keep({ type: "IN", status: "APPROVED", page: undefined, sel: undefined })} sub={<span className="text-muted">Approved only</span>} />
        <Kpi icon={PackageMinus} tint="red" label="Decrease (Qty)" value={n(kpi.decrease)} href={keep({ type: "OUT", status: "APPROVED", page: undefined, sel: undefined })} sub={<span className="text-muted">Approved only</span>} />
        <Kpi icon={Clock} tint="orange" label="Pending Approval" value={n(kpi.pending)} href={keep({ status: "PENDING", page: undefined, sel: undefined })} sub={<span className="text-muted">Stock not changed yet</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Approved" value={n(kpi.approved)} href={keep({ status: "APPROVED", page: undefined, sel: undefined })} sub={<span className="text-muted">Stock changed</span>} />
        <Kpi icon={XCircle} tint="red" label="Rejected" value={n(kpi.rejected)} href={keep({ status: "REJECTED", page: undefined, sel: undefined })} sub={<span className="text-muted">Stock not changed</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(10rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
              <label className="relative block md:col-span-3 2xl:col-span-1">
                <span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search adjustment no, SKU, item name" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
              </label>
              <FilterSelect label="Warehouse" name="place" value={place}>
                <option value="">All Warehouses</option>
                {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </FilterSelect>
              <FilterSelect label="Adjustment Type" name="type" value={type}>
                <option value="all">All Types</option><option value="IN">Increase</option><option value="OUT">Decrease</option>
              </FilterSelect>
              <FilterSelect label="Status" name="status" value={status}>
                <option value="all">All Status</option>
                {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </FilterSelect>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
                <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
                <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
              <Link href="/stock/entry" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={Layers} title="No stock adjustments found" text={filtersOn ? "Try a different word, or press Clear." : "An adjustment adds or removes stock with a reason (damage, loss, found goods). Make the first one from the form on the right."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Date &amp; Time</th><th>Adjustment No.</th><th>SKU Code</th><th>Item Name</th><th>Warehouse</th><th>Type</th><th className="text-right">Qty</th><th>Reason</th><th>Status</th><th>Requested By</th><th className="print:hidden">Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const selected = r.id === selId && panel === "details";
                      const viewHref = keep({ sel: r.id, p: "details" });
                      return (
                        <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap">{day(r.created_at)}<span className="block text-xs text-muted">{time(r.created_at)}</span></td>
                          <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.entry_no}</Link></td>
                          <td className="whitespace-nowrap text-[13px]">{r.first_code}{r.items > 1 && <span className="block text-xs text-muted">+{r.items - 1} more</span>}</td>
                          <td className="min-w-28">{r.first_name}</td>
                          <td className="min-w-24">{r.place_name}</td>
                          <td><TypePill dir={r.direction} /></td>
                          <td className={`text-right font-mono ${r.direction === "OUT" ? "text-[var(--danger)]" : "text-green-700 dark:text-green-400"}`}>{r.direction === "OUT" ? "-" : "+"}{n(r.qty)}</td>
                          <td className="min-w-24 text-[13px]">{rl[r.reason] ?? r.reason}</td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="whitespace-nowrap">{r.requested_by ?? ""}</td>
                          <td className="print:hidden">
                            <span className="flex items-center gap-1">
                              <Link href={viewHref} aria-label={`View ${r.entry_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              {canApprove && r.status === "PENDING" && <Link href={viewHref} aria-label={`Decide ${r.entry_no}`} title="Approve or reject" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--brand)] bg-surface text-[var(--brand-text)] hover:bg-brand-soft"><Check size={18} aria-hidden /></Link>}
                              <AdjRowMenu viewHref={viewHref} entryNo={r.entry_no} />
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
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} adjustments</span>
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
              <h2 className="mb-3 text-base font-bold">Adjustment Reasons (This Month)</h2>
              {segments.length === 0 ? <p className="py-8 text-center text-sm text-muted">No approved adjustment this month.</p> : (
                <DonutChart segments={segments} centerValue={n(monthTotal)} centerLabel="Total Qty Adjusted" ariaLabel="Approved adjustment quantity by reason this month" />
              )}
            </section>
            <section className={`${cardClass} !p-4`}>
              <h2 className="mb-3 text-base font-bold">Adjustment Trend (Last 30 Days)</h2>
              <PairColumnChart data={trend} aLabel="Increase (Qty)" bLabel="Decrease (Qty)" aColor="#16a05f" bColor="#d6402f" ariaLabel="Approved increase and decrease quantity per day, last 30 days" emptyText="No approved adjustment in the last 30 days." />
            </section>
          </div>
        </div>

        <aside aria-label="Adjustment" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20 print:hidden`}>
          <div role="tablist" aria-label="Adjustment panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
            {canEntry ? (
              <Link href={keep({ p: "create", sel: undefined })} role="tab" aria-selected={panel === "create"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "create" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Create Adjustment</Link>
            ) : <span />}
            <Link href={keep({ p: "details", sel: selId ?? rows[0]?.id })} role="tab" aria-selected={panel === "details"}
              className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "details" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Adjustment Details</Link>
          </div>
          {panel === "create" ? <CreatePanel lang={lang} user={user} canApprove={canApprove} /> : <DetailsPanel selId={selId} keep={keep} canApprove={canApprove} lang={lang} />}
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", orange: "bg-[#fdf0e1] text-[#b45f08]", red: "bg-[#fde8e8] text-[#c8302f]" } as const;

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

// "Create Adjustment": the existing Stock In / Out form. The place is the place the person works in (change it at the top).
async function CreatePanel({ lang, user, canApprove }: { lang: "en" | "hi"; user: Awaited<ReturnType<typeof requireAnyPermission>>; canApprove: boolean }) {
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet. Ask an administrator.</p>;
  const t = ENTRY_LABELS[lang];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {canApprove
          ? "You are a manager: your own adjustment is approved at once and the stock changes now."
          : "Your adjustment waits for a manager. The stock changes only after it is approved."}
        {" "}It is for {loc.name}; to adjust another place, switch your working place at the top.
      </p>
      <EntryForm placeName={`${loc.name} (${loc.code})`} reasonLabels={REASON_LABELS[lang]} t={t} />
    </div>
  );
}

type Line = { id: number; quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

async function DetailsPanel({ selId, keep, canApprove, lang }: { selId: string | null; keep: (extra: Record<string, string | number | undefined>) => string; canApprove: boolean; lang: "en" | "hi" }) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose an adjustment from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: e } = await supabase.from("stock_entries").select("*, locations(name, code)").eq("id", selId).maybeSingle();
  if (!e) return <p className="py-6 text-center text-sm text-muted">This adjustment was not found, or you may not see it.</p>;
  const { data: lineData } = await supabase.from("stock_entry_lines").select("id, quantity, items(internal_item_code, item_name, unit)").eq("entry_id", e.id).order("id");
  const lines = (lineData ?? []) as unknown as Line[];
  const [{ data: who }, { data: decider }] = await Promise.all([
    supabase.rpc("person_name", { p_id: e.created_by }),
    e.decided_by ? supabase.rpc("person_name", { p_id: e.decided_by }) : Promise.resolve({ data: null }),
  ]);
  const place = e.locations as unknown as { name: string; code: string };
  const mine = new Set((await getMyLocations(await requireAnyPermission("stock.entry", "stock.view", "stock.approve"))).map((l) => l.id));
  const canDecide = canApprove && e.status === "PENDING" && mine.has(e.location_id);
  const total = lines.reduce((a, l) => a + Number(l.quantity), 0);
  const rejected = e.status === "REJECTED";
  const steps = [
    { label: "Requested", when: e.created_at as string | null, done: true, bad: false },
    { label: rejected ? "Rejected" : "Approved", when: e.decided_at as string | null, done: e.status !== "PENDING", bad: rejected },
  ];
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{e.entry_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={e.status} />
          <Link href={keep({ sel: "none", p: undefined })} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
        </div>
      </div>
      <dl>
        {field("Date", dateTime(e.created_at))}
        {field("Warehouse", `${place.name} (${place.code})`)}
        {field("Type", <TypePill dir={e.direction} />)}
        {field("Reason", REASON_LABELS[lang][e.reason as EntryReason] ?? e.reason)}
        {field("Reference", e.reference)}
        {field("Remarks", e.remarks)}
        {field("Requested By", who as string | null)}
        {field("Total Items", n(lines.length))}
        {field("Total Qty", `${e.direction === "OUT" ? "-" : "+"}${n(total)}`)}
        {e.status !== "PENDING" && field(rejected ? "Rejected By" : "Approved By", decider as string | null)}
        {e.decision_note && field("Decision Note", e.decision_note)}
      </dl>

      <h3 className="mb-2 mt-3 text-sm font-bold">Progress</h3>
      <ol className="grid grid-cols-2 gap-1 text-center">
        {steps.map((s, i) => (
          <li key={s.label} className="relative min-w-0">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[11px] h-0.5 w-full ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "bg-[var(--line-strong)]"}`} />}
            <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "border-2 border-[var(--line-strong)] bg-surface"}`}>
              {s.done && (s.bad ? <XIcon size={13} aria-hidden /> : <Check size={13} aria-hidden />)}
            </span>
            <span className={`mt-1 block text-[11px] leading-tight ${s.done ? "font-medium" : "text-muted"}`}>{s.label}{!s.done ? " (waiting)" : ""}</span>
            <span className="block text-[10px] leading-tight text-muted">{s.done && s.when ? dateTime(s.when) : ""}</span>
          </li>
        ))}
      </ol>

      <h3 className="mb-1 mt-3 text-sm font-bold">Items</h3>
      <ul className="divide-y divide-line text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0"><span className="block font-semibold">{l.items?.internal_item_code}</span><span className="block truncate text-xs text-muted">{l.items?.item_name}</span></span>
            <span className="shrink-0 font-mono text-xs">{e.direction === "OUT" ? "-" : "+"}{n(Number(l.quantity))} {l.items?.unit}</span>
          </li>
        ))}
      </ul>

      {canDecide && <div className="mt-3"><DecisionForm id={e.id} /></div>}
      {e.status === "PENDING" && !canDecide && <p className="mt-3 text-xs text-muted">Waiting for a manager. The stock has not changed.</p>}
      <div className="mt-4">
        <Link href={`/stock/movements?q=${encodeURIComponent(e.entry_no)}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><FileText size={16} aria-hidden /> See in Stock Ledger</Link>
      </div>
    </div>
  );
}

export const metadata = { title: "Stock Adjustment" };
