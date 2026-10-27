import Link from "next/link";
import { ArrowDownToLine, ChevronLeft, ChevronRight, ClipboardList, Clock, Eye, FileText, PackageCheck, Search, Users, Wallet, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { BarList, ColumnChart, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { STATUSES, STATUS_LABEL, TABS, TAB_LABEL, type Tab } from "@/lib/validation/purchase-report";
import { RowsPerPage } from "../../items/item-controls";
import { PrintButton } from "../../stock/movements/ledger-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-[#eceff3] text-[#5b6675] dark:bg-[#2a3340] dark:text-[#b7c0cc]",
  SENT: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  PARTIAL: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  COMPLETED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  CANCELLED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const STATUS_COLOR: Record<string, string> = { COMPLETED: "#16a05f", PARTIAL: "#e8b21a", SENT: "#d6402f", CANCELLED: "#8b95a5", DRAFT: "#2a63d6" };
const CAT_COLORS = ["#2a63d6", "#16a05f", "#e8b21a", "#7a55d6", "#d6402f", "#8b95a5"];

type Row = Record<string, string | number | boolean | null>;
type PageData = {
  tab: Tab; total: number; rows: Row[]; suppliers: { id: string; name: string }[]; categories: { id: string; name: string }[]; places: { id: string; name: string }[];
  compare_range: { cur_from: string; cur_to: string; prev_from: string; prev_to: string };
  kpi: { pos: number; value: number | null; received: number | null; pending: number | null; avg: number | null; suppliers: number };
  trend: { month: string; pos: number; value: number | null }[]; top_suppliers: { name: string; value: number }[]; categories_value: { name: string; value: number }[];
  status_dist: Record<string, number>; top_items: { code: string; item_name: string; qty: number; value: number | null }[]; recent: { at: string; po_no: string; activity: string; by_name: string | null }[];
};
const EMPTY: PageData = {
  tab: "orders", total: 0, rows: [], suppliers: [], categories: [], places: [], compare_range: { cur_from: "", cur_to: "", prev_from: "", prev_to: "" },
  kpi: { pos: 0, value: null, received: null, pending: null, avg: null, suppliers: 0 }, trend: [], top_suppliers: [], categories_value: [], status_dist: {}, top_items: [], recent: [],
};

const n = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 }));
const inr = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }));
const compactInr = (v: number) => (v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` : `₹${Math.round(v)}`);
const day = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" });
const StatusPill = ({ status, overdue }: { status: string; overdue?: boolean }) => (
  <span className="flex flex-wrap items-center gap-1"><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
    {overdue && <span className="rounded-md bg-[#fde8e8] px-1.5 py-0.5 text-[10px] font-semibold text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]">Overdue</span>}</span>
);

export default async function PurchaseReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? "") ? (first(sp.tab) as Tab) : "orders";
  const q = sanitizeSearch(first(sp.q));
  const supplier = z.uuid().safeParse(first(sp.supplier)).data ?? "";
  const category = z.uuid().safeParse(first(sp.category)).data ?? "";
  const location = z.uuid().safeParse(first(sp.location)).data ?? "";
  const status = (STATUSES as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_report", {
    p_tab: tab, p_q: q || null, p_supplier: supplier || null, p_category: category || null, p_status: status === "all" ? null : status, p_location: location || null,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const showMoney = kpi.value !== null;

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      tab: tab !== "orders" ? tab : undefined, q: q || undefined, supplier: supplier || undefined, category: category || undefined, location: location || undefined,
      status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined, size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/reports/purchase?${s}` : "/reports/purchase";
  };
  const exportQuery = new URLSearchParams(Object.entries({ tab, q, supplier, category, location, status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const catTotal = result.categories_value.reduce((a, c) => a + Number(c.value), 0);
  const catSorted = [...result.categories_value].sort((a, b) => Number(b.value) - Number(a.value));
  const catSegs = [...catSorted.slice(0, 5).map((c, i) => ({ key: c.name, label: c.name, value: Number(c.value), color: CAT_COLORS[i] })),
    ...(catSorted.slice(5).length ? [{ key: "others", label: "Others", value: catSorted.slice(5).reduce((a, c) => a + Number(c.value), 0), color: CAT_COLORS[5] }] : [])];
  const statusOrder = ["COMPLETED", "PARTIAL", "SENT", "CANCELLED", "DRAFT"];
  const statusSegs = statusOrder.map((s) => ({ key: s, label: STATUS_LABEL[s], value: Number(result.status_dist[s] ?? 0), color: STATUS_COLOR[s] }));
  const filtersOn = !!(q || supplier || category || location || from || to || status !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <Link href="/reports">Reports</Link> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Purchase Reports</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Purchase Reports</h1>
          <p className="mt-1 text-sm text-muted">View purchase orders, supplier-wise purchases, item-wise purchases and procurement analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/reports/purchase/export?${exportQuery}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted"><ArrowDownToLine size={18} aria-hidden /> Export</a>
          <PrintButton />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ClipboardList} tint="blue" label="Total Purchase Orders" value={n(kpi.pos)} href={keep({ tab: undefined, status: undefined, page: undefined })} />
        <Kpi icon={Wallet} tint="violet" label="Total Purchase Value" value={inr(kpi.value)} href={keep({ tab: "monthly", page: undefined })} sub={kpi.value === null ? "Needs the cost permission" : "Sent, partial and completed orders"} />
        <Kpi icon={PackageCheck} tint="blue" label="Received Value (GRN)" value={inr(kpi.received)} href={keep({ tab: "grn", page: undefined })} sub="Posted goods receipts" />
        <Kpi icon={Clock} tint="red" label="Pending PO Value" value={inr(kpi.pending)} href={keep({ tab: "pending", page: undefined })} sub="Still to be delivered" />
        <Kpi icon={FileText} tint="green" label="Average Order Value" value={inr(kpi.avg)} href={keep({ tab: "supplier", page: undefined })} />
        <Kpi icon={Users} tint="amber" label="Active Suppliers" value={n(kpi.suppliers)} href={keep({ tab: "supplier", page: undefined })} />
      </section>

      <section className={`${cardClass} !p-4 print:hidden`}>
        <form method="get" className="grid gap-3 md:grid-cols-3 2xl:grid-cols-[repeat(2,minmax(0,1fr))_repeat(4,minmax(0,1fr))_minmax(10rem,1.5fr)_auto_auto] 2xl:items-end">
          {tab !== "orders" && <input type="hidden" name="tab" value={tab} />}
          <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span><input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span><input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
          <FilterSelect label="Supplier" name="supplier" value={supplier}><option value="">All Suppliers</option>{result.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</FilterSelect>
          <FilterSelect label="Category" name="category" value={category}><option value="">All Categories</option>{result.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</FilterSelect>
          <FilterSelect label="Status" name="status" value={status}><option value="all">All Status</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</FilterSelect>
          <FilterSelect label="Warehouse" name="location" value={location}><option value="">All Warehouses</option>{result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FilterSelect>
          <label className="relative block md:col-span-3 2xl:col-span-1"><span className="sr-only">Search</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search PO no, supplier, item" autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" /></label>
          <Link href={tab !== "orders" ? `/reports/purchase?tab=${tab}` : "/reports/purchase"} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong"><Search size={16} aria-hidden /> Apply</button>
        </form>
        <p className="mt-2 text-xs text-muted">Date range works on the order date (receipt date in the GRN tab). Charts show the last 6 months. In Comparative, the range (default this month so far) is compared with the period of the same length just before it.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Purchase Value Trend (Last 6 Months)</h2>
          <TrendChart points={result.trend} money={showMoney} />
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">{showMoney ? "Supplier-wise Purchase Value (Top 5)" : "Supplier-wise Quantity (Top 5)"}</h2>
          <BarList rows={result.top_suppliers.map((s) => ({ key: s.name, label: s.name, value: Number(s.value), display: showMoney ? inr(s.value) : n(s.value) }))} emptyText="No purchases yet." />
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">{showMoney ? "Category-wise Purchase Value" : "Category-wise Quantity"}</h2>
          {catTotal === 0 ? <p className="py-8 text-center text-sm text-muted">No purchases yet.</p> : <DonutChart segments={catSegs} centerValue={showMoney ? compactInr(catTotal) : n(catTotal)} centerLabel="Total Purchase" ariaLabel="Purchases by category" />}
        </section>
      </div>

      <section className={`${cardClass} min-w-0 !p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Report tabs" className="flex flex-wrap gap-1 border-b border-line text-sm print:hidden">
            {TABS.map((t) => (
              <Link key={t} href={keep({ tab: t === "orders" ? undefined : t, page: undefined })} role="tab" aria-selected={t === tab}
                className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 py-2.5 font-semibold ${t === tab ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{TAB_LABEL[t]}</Link>
            ))}
          </div>
          <a href={`/reports/purchase/export?${exportQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-brand-strong print:hidden"><ArrowDownToLine size={16} aria-hidden /> Download Excel (CSV)</a>
        </div>
        <h2 className="mb-2 hidden text-base font-bold print:block">{TAB_LABEL[tab]}</h2>
        {tab === "comparative" && <p className="mb-2 text-xs text-muted">This period: {day(result.compare_range.cur_from)} to {day(result.compare_range.cur_to)}. Previous period: {day(result.compare_range.prev_from)} to {day(result.compare_range.prev_to)}.</p>}

        {result.rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nothing to show" text={filtersOn ? "Try a different word, or press Clear." : "Nothing matches this tab yet."} />
        ) : <div className="overflow-x-auto"><ReportTable tab={tab} rows={result.rows} offset={(page - 1) * size} showMoney={showMoney} /></div>}

        {tab !== "comparative" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} {tab === "orders" || tab === "pending" ? "purchase orders" : tab === "grn" ? "receipts" : "lines"}</span>
            <nav aria-label="Pagination" className="flex items-center gap-1.5">
              {page > 1 ? <PageLink href={keep({ page: page - 1 })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
              {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : <PageLink key={p} href={keep({ page: p })} active={p === page} label={`Page ${p}`}>{p}</PageLink>)}
              {page < lastPage ? <PageLink href={keep({ page: page + 1 })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
            </nav>
            <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">PO Status Distribution</h2>
          {kpi.pos === 0 ? <p className="py-8 text-center text-sm text-muted">No purchase orders yet.</p> : <DonutChart segments={statusSegs} centerValue={n(kpi.pos)} centerLabel="Total POs" ariaLabel="Purchase orders by status" />}
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Monthly Purchase Value</h2>
          <ColumnChart data={result.trend.map((t) => ({ key: t.month, label: monthLabel(t.month), value: Number(showMoney ? (t.value ?? 0) : t.pos) }))} money={showMoney} ariaLabel="Purchase value per month" tableLabel="Purchases by month" valueLabel={showMoney ? "Purchase value" : "Orders"} emptyText="No purchases yet." />
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-3 text-base font-bold">Top 5 Purchased Items</h2>
          {result.top_items.length === 0 ? <p className="py-6 text-center text-sm text-muted">No purchases yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Item Name</th><th className="py-1 pr-2 text-right">Quantity</th><th className="py-1 text-right">Value</th></tr></thead>
              <tbody>{result.top_items.map((t, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2 font-semibold">{t.code}</td><td className="max-w-28 truncate py-1.5 pr-2">{t.item_name}</td><td className="py-1.5 pr-2 text-right font-mono">{n(t.qty)}</td><td className="py-1.5 text-right font-mono">{inr(t.value)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Recent Purchase Activity</h2><Link href="/purchase-orders" className="text-xs font-semibold">View All</Link></div>
          {result.recent.length === 0 ? <p className="py-6 text-center text-sm text-muted">No activity yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">Time</th><th className="py-1 pr-2">PO / GRN</th><th className="py-1 pr-2">Activity</th><th className="py-1">User</th></tr></thead>
              <tbody>{result.recent.map((r, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2">{time(r.at)}</td><td className="py-1.5 pr-2 font-semibold">{r.po_no}</td><td className="py-1.5 pr-2">{r.activity}</td><td className="py-1.5">{r.by_name ?? "-"}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportTable({ tab, rows, offset, showMoney }: { tab: Tab; rows: Row[]; offset: number; showMoney: boolean }) {
  const num = "text-right font-mono";
  const money = (v: unknown) => <td className={num}>{inr(v as number | null)}</td>;
  const idx = (i: number) => <td className="text-muted">{offset + i + 1}</td>;
  if (tab === "comparative") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>Measure</th><th className="text-right">This Period</th><th className="text-right">Previous Period</th><th className="text-right">Change</th></tr></thead>
        <tbody>{rows.map((r) => {
          const isMoney = /value|price/i.test(String(r.metric));
          const cur = r.current === null ? null : Number(r.current), prev = r.previous === null ? null : Number(r.previous);
          const pct = cur !== null && prev !== null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
          const f = (v: number | null) => (v === null ? "-" : isMoney ? inr(v) : n(v));
          return (
            <tr key={String(r.metric)}><td className="font-medium">{String(r.metric)}</td><td className={num}>{f(cur)}</td><td className={num}>{f(prev)}</td>
              <td className={`${num} ${pct === null ? "" : pct >= 0 ? "text-green-700 dark:text-green-400" : "text-[var(--danger)]"}`}>{pct === null ? "-" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}</td></tr>
          );
        })}</tbody>
      </table>
    );
  }
  if (tab === "grn") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>GRN No.</th><th>Date</th><th>Supplier Invoice</th><th>Supplier</th><th>Warehouse</th><th className="text-right">Items</th><th className="text-right">Quantity</th>{showMoney && <th className="text-right">Value</th>}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={String(r.receipt_no)}>{idx(i)}<td className="whitespace-nowrap text-[13px] font-semibold"><Link href={`/receipts?q=${r.receipt_no}`}>{String(r.receipt_no)}</Link></td><td className="whitespace-nowrap">{day(r.receipt_date as string)}</td>
            <td>{(r.supplier_invoice_no as string) ?? "-"}</td><td className="min-w-32">{String(r.sname)}</td><td>{String(r.lname)}</td><td className={num}>{n(r.items as number)}</td><td className={num}>{n(r.qty as number)}</td>{showMoney && money(r.value)}</tr>
        ))}</tbody>
      </table>
    );
  }
  if (tab === "supplier") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Supplier</th><th className="text-right">Orders</th><th className="text-right">Lines</th><th className="text-right">Quantity</th>{showMoney && <><th className="text-right">PO Value</th><th className="text-right">Received</th><th className="text-right">Pending</th></>}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.supplier_id)}>{idx(i)}<td className="font-semibold">{String(r.sname)}</td><td className={num}>{n(r.pos as number)}</td><td className={num}>{n(r.items as number)}</td><td className={num}>{n(r.qty as number)}</td>{showMoney && <>{money(r.value)}{money(r.received_value)}{money(r.pending_value)}</>}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "category") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Category</th><th className="text-right">Orders</th><th className="text-right">Items</th><th className="text-right">Quantity</th><th className="text-right">Received Qty</th>{showMoney && <><th className="text-right">PO Value</th><th className="text-right">Received</th></>}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.category_name)}>{idx(i)}<td className="font-semibold">{String(r.category_name)}</td><td className={num}>{n(r.pos as number)}</td><td className={num}>{n(r.items as number)}</td><td className={num}>{n(r.qty as number)}</td><td className={num}>{n(r.recv_qty as number)}</td>{showMoney && <>{money(r.value)}{money(r.received_value)}</>}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "item") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>SKU Code</th><th>Item Name</th><th>Category</th><th className="text-right">Orders</th><th className="text-right">Quantity</th><th className="text-right">Received Qty</th><th>Unit</th>{showMoney && <><th className="text-right">Avg Rate</th><th className="text-right">PO Value</th></>}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.code)}>{idx(i)}<td className="whitespace-nowrap text-[13px] font-semibold">{String(r.code)}</td><td className="min-w-32">{String(r.item_name)}</td><td>{String(r.category_name)}</td><td className={num}>{n(r.pos as number)}</td><td className={num}>{n(r.qty as number)}</td><td className={num}>{n(r.recv_qty as number)}</td><td>{String(r.unit)}</td>{showMoney && <>{money(r.avg_rate)}{money(r.value)}</>}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "monthly") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Month</th><th className="text-right">Orders</th><th className="text-right">Suppliers</th><th className="text-right">Quantity</th>{showMoney && <><th className="text-right">PO Value</th><th className="text-right">Received</th></>}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.month)}>{idx(i)}<td className="font-semibold">{monthLabel(String(r.month))}</td><td className={num}>{n(r.pos as number)}</td><td className={num}>{n(r.suppliers as number)}</td><td className={num}>{n(r.qty as number)}</td>{showMoney && <>{money(r.value)}{money(r.received_value)}</>}</tr>)}</tbody>
      </table>
    );
  }
  const pending = tab === "pending";
  return (
    <table className="dash-table w-full text-left text-sm">
      <thead><tr><th>#</th><th>PO No.</th><th>PO Date</th><th>Supplier</th>{!pending && <th>Category</th>}<th className="text-right">Items</th>{pending ? <><th className="text-right">Ordered</th><th className="text-right">Received</th></> : null}{showMoney && (pending ? <th className="text-right">Pending Value</th> : <><th className="text-right">PO Value</th><th className="text-right">Received</th><th className="text-right">Pending</th></>)}<th>Expected Delivery</th>{pending && <th className="text-right">Days Late</th>}<th>Status</th><th className="print:hidden">Action</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={String(r.po_id)}>{idx(i)}<td className="whitespace-nowrap text-[13px] font-semibold"><Link href={`/purchase-orders/${r.po_id}`}>{String(r.po_no)}</Link></td><td className="whitespace-nowrap">{day(r.order_date as string)}</td><td className="min-w-32">{String(r.sname)}</td>
          {!pending && <td>{String(r.category_name)}</td>}<td className={num}>{n(r.items as number)}</td>
          {pending ? <><td className={num}>{n(r.qty as number)}</td><td className={num}>{n(r.recv_qty as number)}</td></> : null}
          {showMoney && (pending ? money(r.pending_value) : <>{money(r.value)}{money(r.received_value)}{money(r.pending_value)}</>)}
          <td className="whitespace-nowrap">{day(r.expected_date as string)}</td>{pending && <td className={`${num} ${Number(r.days_late) > 0 ? "text-[var(--danger)]" : ""}`}>{r.days_late === null ? "-" : n(r.days_late as number)}</td>}
          <td><StatusPill status={String(r.status)} overdue={!!r.overdue} /></td>
          <td className="print:hidden"><Link href={`/purchase-orders/${r.po_id}`} aria-label={`View ${r.po_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link></td></tr>
      ))}</tbody>
    </table>
  );
}

function FilterSelect({ label, name, value, children }: { label: string; name: string; value: string; children: React.ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-xs text-muted">{label}</span>
      <select name={name} defaultValue={value} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">{children}</select></label>
  );
}

function PageLink({ href, label, active, disabled, children }: { href?: string; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const cls = `inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-medium ${
    active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-surface hover:bg-surface-muted"
  } ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (disabled || !href) return <span aria-label={label} aria-disabled="true" className={cls}>{children}</span>;
  return <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cls}>{children}</Link>;
}

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", red: "bg-[#fde8e8] text-[#c8302f]", amber: "bg-[#fdf0e1] text-[#b45f08]", violet: "bg-[#ece8fb] text-[#5b3fc0]" } as const;

function Kpi({ icon: Icon, tint, label, value, href, sub }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; href: string; sub?: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0"><span className="block text-sm text-muted">{label}</span><span className="block text-2xl font-bold leading-9 tracking-tight">{value}</span>{sub && <span className="block text-xs leading-tight text-muted">{sub}</span>}</span>
    </Link>
  );
}

// Purchase value per month (columns) and number of orders per month (line), last 6 months.
function TrendChart({ points, money }: { points: { month: string; pos: number; value: number | null }[]; money: boolean }) {
  const W = 400, H = 230, L = 38, R = 30, T = 10, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const maxV = Math.max(1, ...points.map((p) => Number(money ? (p.value ?? 0) : p.pos)));
  const maxN = Math.max(1, ...points.map((p) => Number(p.pos)));
  const step = plotW / Math.max(points.length, 1);
  const bw = Math.min(26, step * 0.55);
  const yV = (v: number) => T + plotH - (v / maxV) * plotH;
  const yN = (v: number) => T + plotH - (v / maxN) * plotH;
  if (points.every((p) => Number(p.pos) === 0)) return <p className="py-10 text-center text-sm text-muted">No purchase orders in the last 6 months.</p>;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(L + i * step + step / 2).toFixed(1)},${yN(Number(p.pos)).toFixed(1)}`).join(" ");
  const fmt = (v: number) => (money ? compactInr(v) : String(Math.round(v)));
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#2a63d6]" /> {money ? "Purchase Value (₹)" : "Orders"}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#16a05f]" /> No. of POs</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Purchase value and number of orders per month, last 6 months" className="h-auto w-full">
        {[0, 0.5, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={T + plotH - f * plotH} y2={T + plotH - f * plotH} stroke="var(--line)" strokeWidth="1" />)}
        {[0, 0.5, 1].map((f) => <text key={`v${f}`} x={L - 5} y={T + plotH - f * plotH + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{fmt(f * maxV)}</text>)}
        {[0, 0.5, 1].map((f) => <text key={`n${f}`} x={W - R + 5} y={T + plotH - f * plotH + 4} className="fill-[var(--muted)] text-[10px]">{Math.round(f * maxN)}</text>)}
        {points.map((p, i) => {
          const x = L + i * step + step / 2;
          const v = Number(money ? (p.value ?? 0) : p.pos);
          return (
            <g key={p.month}>
              <title>{`${monthLabel(p.month)}: ${p.pos} orders${money ? `, ${inr(p.value)}` : ""}`}</title>
              {v > 0 && <rect x={x - bw / 2} y={yV(v)} width={bw} height={T + plotH - yV(v)} rx="2" fill="#2a63d6" />}
              <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{monthLabel(p.month)}</text>
            </g>
          );
        })}
        <path d={line} fill="none" stroke="#16a05f" strokeWidth="1.8" strokeLinejoin="round" />
        {points.map((p, i) => <circle key={p.month} cx={L + i * step + step / 2} cy={yN(Number(p.pos))} r="3" fill="#16a05f" />)}
      </svg>
    </div>
  );
}
