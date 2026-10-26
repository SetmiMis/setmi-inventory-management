import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Eye, FileText, Plus, Search, SquarePen, Wrench, X, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { startQualityCheck } from "./actions";
import { QcRowMenu, ResultsForm, type QcLine } from "./qc-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["items", "Items"], ["history", "History"]] as const;
const STATUS_FILTERS = ["PENDING", "PASSED", "REJECTED", "REWORK"] as const;
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", PASSED: "Passed", REJECTED: "Rejected", REWORK: "Rework" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; qc_no: string; qc_date: string | null; shown_date: string; inspector_name: string | null; receipt_id: string; receipt_no: string; po_id: string | null; po_no: string | null;
  place_name: string; supplier_id: string; supplier_name: string; items: number; passed: number; rejected: number; rework: number; status: string;
};
type PageData = {
  total: number; rows: Row[]; suppliers: { id: string; name: string }[]; places: { id: string; name: string }[];
  kpi: { total: number; passed: number; rejected: number; pending: number; rework: number; new_month: number };
};
const EMPTY: PageData = { total: 0, rows: [], suppliers: [], places: [], kpi: { total: 0, passed: 0, rejected: 0, pending: 0, rework: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  PASSED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  REJECTED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  REWORK: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
};
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;

export default async function QualityCheckPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("qc.view", "qc.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const supplier = z.uuid().safeParse(first(sp.supplier)).data ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";
  const canManage = can(user, "qc.manage");
  const mode = canManage && first(sp.new) === "1" ? "new" : canManage && first(sp.inspect) === "1" ? "inspect" : "view";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quality_checks_page", {
    p_q: q || null, p_location: place || null, p_supplier: supplier || null, p_status: status === "all" ? null : status,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selId = mode === "new" ? null : selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, place: place || undefined, supplier: supplier || undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/quality-check?${s}` : "/quality-check";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, place, supplier, status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || place || supplier || from || to || status !== "all");
  const showPanel = mode === "new" || !!selId;
  const newHref = keep({ new: "1", sel: undefined, inspect: undefined, err: undefined });

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Purchase &amp; Import</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Quality Check</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Quality Check</h1>
          <p className="mt-1 text-sm text-muted">Inspect and record the quality of received goods: how many passed, were rejected or need rework.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/quality-check/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canManage && (
            <Link href={newHref} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Plus size={18} aria-hidden /> New Quality Check
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi icon={ClipboardCheck} tint="blue" label="Total QC Batches" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Passed" value={n(kpi.passed)} href={keep({ status: "PASSED", page: undefined, sel: undefined })} sub={<span className="text-muted">All pieces good</span>} />
        <Kpi icon={AlertTriangle} tint="red" label="Rejected" value={n(kpi.rejected)} href={keep({ status: "REJECTED", page: undefined, sel: undefined })} sub={<span className="text-muted">Some pieces rejected</span>} />
        <Kpi icon={Clock} tint="violet" label="Pending" value={n(kpi.pending)} href={keep({ status: "PENDING", page: undefined, sel: undefined })} sub={<span className="text-muted">Not inspected yet</span>} />
        <Kpi icon={Wrench} tint="orange" label="Rework" value={n(kpi.rework)} href={keep({ status: "REWORK", page: undefined, sel: undefined })} sub={<span className="text-muted">Needs rework</span>} />
      </section>

      <div className={`grid gap-5 ${showPanel ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end">
            <label className="relative block md:col-span-3 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search QC no, GRN, PO, item, supplier" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Warehouse" name="place" value={place}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Supplier" name="supplier" value={supplier}>
              <option value="">All Suppliers</option>
              {result.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All Status</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </FilterSelect>
            <label className="block"><span className="mb-1 block text-xs text-muted">QC Date From</span>
              <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">QC Date To</span>
              <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <Link href="/quality-check" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No quality checks found" text={filtersOn ? "Try a different word, or press Clear." : "A quality check records how many pieces of a received GRN passed, were rejected or need rework. Start one on a posted goods receipt."} actionHref={canManage ? newHref : undefined} actionLabel="New Quality Check" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>QC No.</th><th>GRN No.</th><th>PO No.</th><th>Date</th><th>Supplier</th><th className="text-right">Items</th><th className="text-right">Passed</th><th className="text-right">Rejected</th><th>Status</th><th>QC By</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId;
                    const viewHref = keep({ sel: r.id, tab: undefined, inspect: undefined, new: undefined });
                    const inspectHref = canManage ? keep({ sel: r.id, inspect: "1", new: undefined }) : null;
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.qc_no}</Link></td>
                        <td className="whitespace-nowrap text-[13px]"><Link href={`/receipts?sel=${r.receipt_id}`}>{r.receipt_no}</Link></td>
                        <td className="whitespace-nowrap text-[13px]">{r.po_id && r.po_no ? <Link href={`/purchase-orders?sel=${r.po_id}`}>{r.po_no}</Link> : ""}</td>
                        <td className="whitespace-nowrap">{day(r.shown_date)}</td>
                        <td className="min-w-32 font-medium">{r.supplier_name}</td>
                        <td className="text-right font-mono">{n(r.items)}</td>
                        <td className="text-right font-mono">{r.status === "PENDING" ? "" : n(r.passed)}</td>
                        <td className="text-right font-mono">{r.status === "PENDING" ? "" : n(r.rejected)}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td className="whitespace-nowrap">{r.inspector_name ?? ""}</td>
                        <td>
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.qc_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            {inspectHref && <Link href={inspectHref} aria-label={`Record results for ${r.qc_no}`} title="Record results" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <QcRowMenu viewHref={viewHref} inspectHref={inspectHref} receiptHref={`/receipts?sel=${r.receipt_id}`} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} quality checks</span>
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

        {showPanel && <Panel mode={mode} selId={selId} tab={tab} keep={keep} canManage={canManage} err={first(sp.err)?.slice(0, 200) ?? null} />}
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
  blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", violet: "bg-[#ece8fb] text-[#6d4fd8]",
  orange: "bg-[#fdf0e1] text-[#b45f08]", red: "bg-[#fde8e8] text-[#c8302f]",
} as const;

function Kpi({ icon: Icon, tint, label, value, sub, href }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; sub: React.ReactNode; href: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-3xl font-bold leading-9 tracking-tight">{value}</span>
        <span className="block text-xs leading-tight">{sub}</span>
      </span>
    </Link>
  );
}

// A small ring: the coloured part is value / total of the circle, the number is in the middle.
function Ring({ value, total, color, label }: { value: number; total: number; color: string; label: string }) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const r = 22; const c = 2 * Math.PI * r;
  return (
    <div className="text-center">
      <span className="relative mx-auto flex h-14 w-14 items-center justify-center">
        <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="4" />
          <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
        </svg>
        <span className="relative text-sm font-bold">{n(value)}</span>
      </span>
      <span className="mt-1 block text-[11px] text-muted">{label}</span>
    </div>
  );
}

type Line = { id: number; passed: number; rejected: number; rework: number; reason: string | null; goods_receipt_lines: { quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null } | null };

// Side panel: details of the chosen check, the "new check" chooser, or the results form. Row rules apply.
async function Panel({ mode, selId, tab, keep, canManage, err }: { mode: "view" | "new" | "inspect"; selId: string | null; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; canManage: boolean; err: string | null }) {
  const closeHref = keep({ sel: "none", new: undefined, inspect: undefined, tab: undefined, err: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";
  const supabase = await createClient();

  if (mode === "new") {
    const [{ data: receipts }, { data: used }] = await Promise.all([
      supabase.from("goods_receipts").select("id, receipt_no, receipt_date, suppliers(name)").eq("status", "POSTED").order("created_at", { ascending: false }).limit(300),
      supabase.from("quality_checks").select("receipt_id"),
    ]);
    const usedIds = new Set((used ?? []).map((u) => u.receipt_id as string));
    const list = ((receipts ?? []) as unknown as { id: string; receipt_no: string; receipt_date: string; suppliers: { name: string } }[]).filter((r) => !usedIds.has(r.id));
    return (
      <aside aria-label="New quality check" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">New Quality Check</h2>
          <Link href={closeHref} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <p className="mb-3 text-sm text-muted">Choose the posted goods receipt (GRN) to inspect. A check does not change stock; stock was added when the receipt was posted.</p>
        {err && <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        {list.length === 0 ? <p className="rounded-lg border border-line bg-surface-muted p-3 text-sm">Every posted goods receipt already has a quality check.</p> : (
          <form action={startQualityCheck} className="space-y-3">
            <label className="block"><span className="mb-1 block text-xs text-muted">Goods receipt</span>
              <select name="receiptId" required className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">
                {list.map((r) => <option key={r.id} value={r.id}>{r.receipt_no} - {r.suppliers.name} ({day(r.receipt_date)})</option>)}
              </select></label>
            <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong">Start Quality Check</button>
          </form>
        )}
      </aside>
    );
  }
  if (!selId) return null;

  const { data: c } = await supabase
    .from("quality_checks")
    .select("id, qc_no, qc_date, remarks, inspected_at, inspector_name, created_at, receipt_id, goods_receipts(id, receipt_no, receipt_date, supplier_invoice_no, purchase_order_id, suppliers(id, name, country), locations(name))")
    .eq("id", selId).maybeSingle();
  if (!c) return null;
  const rc = c.goods_receipts as unknown as { id: string; receipt_no: string; receipt_date: string; supplier_invoice_no: string | null; purchase_order_id: string | null; suppliers: { id: string; name: string; country: string | null }; locations: { name: string } };
  const { data: lineData } = await supabase.from("quality_check_lines").select("id, passed, rejected, rework, reason, goods_receipt_lines(quantity, items(internal_item_code, item_name, unit))").eq("qc_id", c.id).order("id");
  const lines = (lineData ?? []) as unknown as Line[];
  let po: { id: string; po_no: string } | null = null;
  if (rc.purchase_order_id) {
    const { data } = await supabase.from("purchase_orders").select("id, po_no").eq("id", rc.purchase_order_id).maybeSingle();
    po = data;
  }

  const totalQty = lines.reduce((a, l) => a + Number(l.goods_receipt_lines?.quantity ?? 0), 0);
  const passed = lines.reduce((a, l) => a + Number(l.passed), 0);
  const rejected = lines.reduce((a, l) => a + Number(l.rejected), 0);
  const rework = lines.reduce((a, l) => a + Number(l.rework), 0);
  const done = !!c.inspected_at;
  const statusKey = !done ? "PENDING" : rejected > 0 ? "REJECTED" : rework > 0 ? "REWORK" : "PASSED";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  if (mode === "inspect" && canManage) {
    // The form needs the receipt line ids, so they are read together with the quantities.
    const { data: rl } = await supabase.from("quality_check_lines").select("receipt_line_id, passed, rejected, rework, reason, goods_receipt_lines(quantity, items(internal_item_code, item_name, unit))").eq("qc_id", c.id).order("id");
    const fl: QcLine[] = ((rl ?? []) as unknown as { receipt_line_id: number; passed: number; rejected: number; rework: number; reason: string | null; goods_receipt_lines: Line["goods_receipt_lines"] }[]).map((l) => ({
      id: l.receipt_line_id, code: l.goods_receipt_lines?.items?.internal_item_code ?? "", name: l.goods_receipt_lines?.items?.item_name ?? "", unit: l.goods_receipt_lines?.items?.unit ?? "",
      qty: Number(l.goods_receipt_lines?.quantity ?? 0), passed: Number(l.passed), rejected: Number(l.rejected), rework: Number(l.rework), reason: l.reason ?? "",
    }));
    return (
      <aside aria-label="Record quality check results" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Record Results</h2>
          <Link href={keep({ sel: c.id, inspect: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <p className="mb-3 text-sm"><span className="font-mono font-semibold">{c.qc_no}</span> <span className="text-muted">· {rc.receipt_no} · {rc.suppliers.name}</span></p>
        <ResultsForm id={c.id} date={c.qc_date ?? today} today={today} remarks={c.remarks ?? ""} lines={fl} fresh={!done} cancelHref={keep({ sel: c.id, inspect: undefined })} />
      </aside>
    );
  }

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const problems = lines.filter((l) => Number(l.rejected) > 0 || Number(l.rework) > 0);

  return (
    <aside aria-label="Quality check details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{c.qc_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={statusKey} />
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>

      <div role="tablist" aria-label="Quality check sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: c.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>
            {label}{v === "items" ? ` (${lines.length})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            <div className="rounded-xl border border-line bg-surface-muted p-3">
              <p className="text-xs text-muted">Supplier</p>
              <p className="mt-0.5 text-sm font-bold">{rc.suppliers.name}</p>
              <p className="text-xs text-muted">{rc.suppliers.country ?? ""}</p>
              <Link href={`/suppliers?sel=${rc.suppliers.id}`} className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-xs font-semibold hover:bg-brand-soft">View Supplier</Link>
            </div>
            <dl className="mt-2">
              {field("QC Number", c.qc_no)}
              {field("GRN Number", <Link href={`/receipts?sel=${rc.id}`}>{rc.receipt_no}</Link>)}
              {field("PO Number", po ? <Link href={`/purchase-orders?sel=${po.id}`}>{po.po_no}</Link> : "")}
              {field("Invoice No.", rc.supplier_invoice_no)}
              {field("Received Date", day(rc.receipt_date))}
              {field("QC Date", c.qc_date && day(c.qc_date))}
              {field("Warehouse", rc.locations.name)}
              {field("QC By", c.inspector_name)}
              {field("Status", <StatusPill status={statusKey} />)}
              {field("Remarks", c.remarks)}
            </dl>
            {done ? (
              <>
                <h3 className="mb-2 mt-4 text-sm font-bold">Quality Check Summary</h3>
                <div className="grid grid-cols-4 gap-1">
                  <Ring value={totalQty} total={totalQty} color="var(--brand)" label="Total Qty" />
                  <Ring value={passed} total={totalQty} color="#16a05f" label="Passed" />
                  <Ring value={rejected} total={totalQty} color="#d6402f" label="Rejected" />
                  <Ring value={rework} total={totalQty} color="#e08a1a" label="Rework" />
                </div>
                {problems.length > 0 && (
                  <>
                    <h3 className="mb-1 mt-4 text-sm font-bold">Rejected / Rework Items</h3>
                    <table className="w-full text-left text-xs">
                      <thead><tr className="text-muted"><th className="py-1 pr-1">Item</th><th className="py-1 pr-1 text-right">Rej.</th><th className="py-1 pr-1 text-right">Rew.</th><th className="py-1">Reason</th></tr></thead>
                      <tbody>
                        {problems.map((l) => (
                          <tr key={l.id} className="border-t border-line align-top">
                            <td className="py-1 pr-1"><span className="block font-semibold">{l.goods_receipt_lines?.items?.internal_item_code}</span></td>
                            <td className="py-1 pr-1 text-right font-mono">{n(Number(l.rejected))}</td>
                            <td className="py-1 pr-1 text-right font-mono">{n(Number(l.rework))}</td>
                            <td className="py-1">{l.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            ) : <p className="mt-4 rounded-lg border border-line bg-surface-muted p-3 text-sm text-muted">This check has not been done yet. Press Record Results and say how many pieces passed, were rejected or need rework.</p>}
          </>
        )}

        {tab === "items" && (
          lines.length === 0 ? <p className="py-6 text-center text-sm text-muted">No items.</p> : (
            <ul className="divide-y divide-line text-sm">
              {lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block font-semibold">{l.goods_receipt_lines?.items?.internal_item_code}</span><span className="block text-xs text-muted">{l.goods_receipt_lines?.items?.item_name}</span></span>
                  <span className="shrink-0 text-right font-mono text-xs">
                    <span className="block">{n(Number(l.goods_receipt_lines?.quantity ?? 0))} {l.goods_receipt_lines?.items?.unit}</span>
                    {done && <span className="block text-muted">P {n(Number(l.passed))} · R {n(Number(l.rejected))} · W {n(Number(l.rework))}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "history" && (
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between gap-3 py-2"><span className="font-semibold">Check started</span><span className="text-xs text-muted">{dateTime(c.created_at)}</span></li>
            {c.inspected_at && <li className="flex items-center justify-between gap-3 py-2"><span className="font-semibold">Results saved{c.inspector_name ? ` by ${c.inspector_name}` : ""}</span><span className="text-xs text-muted">{dateTime(c.inspected_at)}</span></li>}
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/receipts/${rc.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><FileText size={16} aria-hidden /> View GRN</Link>
        {canManage && (
          <Link href={keep({ sel: c.id, inspect: "1" })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong">
            <SquarePen size={16} aria-hidden /> {done ? "Recheck" : "Record Results"}
          </Link>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">A quality check is a record. It does not change stock. To remove rejected goods from stock, use Stock Adjustment.</p>
    </aside>
  );
}
