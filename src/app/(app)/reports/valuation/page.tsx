import Link from "next/link";
import { ArrowDownToLine, Boxes, ChevronLeft, ChevronRight, CircleX, Eye, Hourglass, Layers, Search, TrendingDown, Wallet, Zap, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { BarList, ColumnChart, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { MOVE_LABEL } from "@/lib/validation/inventory-report";
import { sanitizeSearch } from "@/lib/validation/item";
import { MOVEMENT_LABEL, STATUS_FILTERS, STATUS_LABEL, TABS, TAB_LABEL, type Tab } from "@/lib/validation/stock-valuation";
import { RowsPerPage } from "../../items/item-controls";
import { PrintButton } from "../../stock/movements/ledger-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const COLORS = ["#2a63d6", "#16a05f", "#e8b21a", "#7a55d6", "#d6402f", "#8b95a5"];
const STATUS_STYLE: Record<string, string> = {
  IN: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]", OVER: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  LOW: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]", OUT: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const MOVEMENT_STYLE: Record<string, string> = {
  FAST: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]", SLOW: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]", NORMAL: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
};

type Row = Record<string, string | number | null>;
type PageData = {
  tab: Tab; total: number; rows: Row[]; categories: { id: string; name: string }[]; places: { id: string; name: string }[]; suppliers: { id: string; name: string }[];
  kpi: { value: number; items: number; fast: number; slow: number; low: number; out_refill: number; unpriced: number };
  value_by_category: { name: string; value: number }[]; value_by_place: { name: string; value: number }[]; ageing_value: { bucket: string; value: number }[];
  status_value: { in_stock: number; low: number; reserved: number; transit: number };
  top_items: { code: string; item_name: string; qty: number; value: number }[]; low_top: { code: string; item_name: string; place_name: string; qty: number; value: number | null }[];
  recent: { created_at: string; code: string; item_name: string; typ: string; delta: number; value: number | null; by_name: string | null }[];
};
const EMPTY: PageData = {
  tab: "sku", total: 0, rows: [], categories: [], places: [], suppliers: [], kpi: { value: 0, items: 0, fast: 0, slow: 0, low: 0, out_refill: 0, unpriced: 0 },
  value_by_category: [], value_by_place: [], ageing_value: [], status_value: { in_stock: 0, low: 0, reserved: 0, transit: 0 }, top_items: [], low_top: [], recent: [],
};

const n = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 }));
const inr = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }));
const inr2 = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const compactInr = (v: number) => (v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` : `₹${Math.round(v)}`);
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function StockValuationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? "") ? (first(sp.tab) as Tab) : "sku";
  const q = sanitizeSearch(first(sp.q));
  const category = z.uuid().safeParse(first(sp.category)).data ?? "";
  const location = z.uuid().safeParse(first(sp.location)).data ?? "";
  const supplier = z.uuid().safeParse(first(sp.supplier)).data ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_valuation", {
    p_tab: tab, p_q: q || null, p_category: category || null, p_location: location || null, p_supplier: supplier || null, p_status: status === "all" ? null : status,
    p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      tab: tab !== "sku" ? tab : undefined, q: q || undefined, category: category || undefined, location: location || undefined, supplier: supplier || undefined,
      status: status !== "all" ? status : undefined, size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/reports/valuation?${s}` : "/reports/valuation";
  };
  const exportQuery = new URLSearchParams(Object.entries({ tab, q, category, location, supplier, status: status !== "all" ? status : "" }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const catSorted = [...result.value_by_category].sort((a, b) => Number(b.value) - Number(a.value));
  const catSegs = [...catSorted.slice(0, 5).map((c, i) => ({ key: c.name, label: c.name, value: Number(c.value), color: COLORS[i] })),
    ...(catSorted.length > 5 ? [{ key: "others", label: "Others", value: catSorted.slice(5).reduce((a, c) => a + Number(c.value), 0), color: COLORS[5] }] : [])];
  const ageSegs = result.ageing_value.map((a, i) => ({ key: a.bucket, label: a.bucket, value: Number(a.value), color: COLORS[i % COLORS.length] }));
  const sv = result.status_value;
  const statusSegs = [
    { key: "in", label: "In Stock", value: Number(sv.in_stock), color: "#16a05f" }, { key: "low", label: "Low Stock", value: Number(sv.low), color: "#e8b21a" },
    { key: "reserved", label: "Reserved", value: Number(sv.reserved), color: "#2a63d6" }, { key: "transit", label: "In Transit", value: Number(sv.transit), color: "#7a55d6" },
  ];
  const statusTotal = statusSegs.reduce((a, s) => a + s.value, 0);
  const filtersOn = !!(q || category || location || supplier || status !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <Link href="/reports">Reports</Link> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Stock Valuation</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Stock Valuation</h1>
          <p className="mt-1 text-sm text-muted">View current stock value, valuation by category and warehouse, ageing and stock movement analysis. Value = quantity x average buying cost.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/reports/valuation/export?${exportQuery}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted"><ArrowDownToLine size={18} aria-hidden /> Export</a>
          <PrintButton />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}
      {kpi.unpriced > 0 && <p role="status" className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-[#3a2d10] dark:text-[#f2d166]">{kpi.unpriced} stock line(s) have stock but no priced goods receipt, so they have no value yet.</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Wallet} tint="green" label="Total Stock Value" value={inr(kpi.value)} href={keep({ tab: "category", page: undefined })} />
        <Kpi icon={Boxes} tint="blue" label="Total Items (SKU)" value={n(kpi.items)} href={keep({ tab: undefined, page: undefined })} />
        <Kpi icon={Zap} tint="violet" label="Fast Moving Stock Value" value={inr(kpi.fast)} href={keep({ tab: "movers", page: undefined })} sub="10+ sold in 30 days" />
        <Kpi icon={Hourglass} tint="amber" label="Slow Moving Stock Value" value={inr(kpi.slow)} href={keep({ tab: "movers", page: undefined })} sub="Under 5 sold in 30 days" />
        <Kpi icon={TrendingDown} tint="red" label="Low Stock Value" value={inr(kpi.low)} href={keep({ tab: "low", page: undefined })} />
        <Kpi icon={CircleX} tint="red" label="Out of Stock Value" value={inr(kpi.out_refill)} href={keep({ tab: "out", page: undefined })} sub="Needed to refill to the minimum" />
      </section>

      <section className={`${cardClass} !p-4 print:hidden`}>
        <form method="get" className="grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,1fr))_minmax(10rem,1.5fr)_auto_auto] 2xl:items-end">
          {tab !== "sku" && <input type="hidden" name="tab" value={tab} />}
          <label className="block"><span className="mb-1 block text-xs text-muted">Valuation Method</span>
            <select disabled aria-label="Valuation method" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface-muted px-3 text-base md:text-sm"><option>Average Cost</option></select></label>
          <FilterSelect label="Warehouse" name="location" value={location}><option value="">All Warehouses</option>{result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FilterSelect>
          <FilterSelect label="Category" name="category" value={category}><option value="">All Categories</option>{result.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</FilterSelect>
          <FilterSelect label="Supplier" name="supplier" value={supplier}><option value="">All Suppliers</option>{result.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</FilterSelect>
          <FilterSelect label="Stock Status" name="status" value={status}><option value="all">All Status</option>{STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</FilterSelect>
          <label className="relative block md:col-span-3 2xl:col-span-1"><span className="sr-only">Search</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search SKU, item name" autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" /></label>
          <Link href={tab !== "sku" ? `/reports/valuation?tab=${tab}` : "/reports/valuation"} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong"><Search size={16} aria-hidden /> Apply</button>
        </form>
        <p className="mt-2 text-xs text-muted">Only Average Cost is available (weighted average of posted goods receipts). The value is as of now; a past date and FIFO are not built. Stock Status works on the SKU-wise tab.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Value by Category</h2>
          {catSegs.length === 0 ? <p className="py-8 text-center text-sm text-muted">No stock value yet.</p> : <DonutChart segments={catSegs} centerValue={compactInr(kpi.value)} centerLabel="Total Value" ariaLabel="Stock value by category" />}
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Value by Warehouse</h2>
          <ColumnChart data={result.value_by_place.slice(0, 6).map((p) => ({ key: p.name, label: p.name, value: Number(p.value) }))} money ariaLabel="Stock value in each warehouse" tableLabel="Value by warehouse" valueLabel="Stock value" emptyText="No stock value yet." />
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Ageing Value</h2>
          {ageSegs.length === 0 ? <p className="py-8 text-center text-sm text-muted">No stock value yet.</p> : <DonutChart segments={ageSegs} centerValue={compactInr(kpi.value)} centerLabel="Total Value" ariaLabel="Stock value by age" />}
        </section>
      </div>

      <section className={`${cardClass} min-w-0 !p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Report tabs" className="flex flex-wrap gap-1 border-b border-line text-sm print:hidden">
            {TABS.map((t) => (
              <Link key={t} href={keep({ tab: t === "sku" ? undefined : t, page: undefined })} role="tab" aria-selected={t === tab}
                className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 py-2.5 font-semibold ${t === tab ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{TAB_LABEL[t]}</Link>
            ))}
          </div>
          <a href={`/reports/valuation/export?${exportQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-brand-strong print:hidden"><ArrowDownToLine size={16} aria-hidden /> Download Excel (CSV)</a>
        </div>
        <h2 className="mb-2 hidden text-base font-bold print:block">{TAB_LABEL[tab]}</h2>

        {result.rows.length === 0 ? (
          <EmptyState icon={Layers} title="Nothing to show" text={filtersOn ? "Try a different word, or press Clear." : "Nothing matches this tab yet."} />
        ) : <div className="overflow-x-auto"><ReportTable tab={tab} rows={result.rows} offset={(page - 1) * size} grand={kpi.value} /></div>}

        {!["category", "warehouse", "supplier", "ageing"].includes(tab) || total > size ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} {["sku", "movers", "low", "out"].includes(tab) ? "stock lines" : "rows"}</span>
            <nav aria-label="Pagination" className="flex items-center gap-1.5">
              {page > 1 ? <PageLink href={keep({ page: page - 1 })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
              {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : <PageLink key={p} href={keep({ page: p })} active={p === page} label={`Page ${p}`}>{p}</PageLink>)}
              {page < lastPage ? <PageLink href={keep({ page: page + 1 })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
            </nav>
            <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Status Value</h2>
          {statusTotal === 0 ? <p className="py-8 text-center text-sm text-muted">No stock value yet.</p> : <DonutChart segments={statusSegs} centerValue={compactInr(statusTotal)} centerLabel="Total Value" ariaLabel="Stock value by status" />}
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Top 5 High Value Items</h2>
          <BarList rows={result.top_items.map((t) => ({ key: t.code, label: t.code, sub: t.item_name, value: Number(t.value), display: inr(t.value) }))} emptyText="No stock value yet." />
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-3 text-base font-bold">Top 5 Low Stock Value Items</h2>
          {result.low_top.length === 0 ? <p className="py-6 text-center text-sm text-muted">No low stock items.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Item Name</th><th className="py-1 pr-2 text-right">Current</th><th className="py-1 text-right">Stock Value</th></tr></thead>
              <tbody>{result.low_top.map((l, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2 font-semibold">{l.code}</td><td className="max-w-28 truncate py-1.5 pr-2">{l.item_name}</td><td className="py-1.5 pr-2 text-right font-mono">{n(l.qty)}</td><td className="py-1.5 text-right font-mono">{inr(l.value)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Recent Stock Valuation Activity</h2><Link href="/stock/movements" className="text-xs font-semibold">View All</Link></div>
          {result.recent.length === 0 ? <p className="py-6 text-center text-sm text-muted">No stock activity yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">Date</th><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Activity</th><th className="py-1 pr-2 text-right">Value</th><th className="py-1">User</th></tr></thead>
              <tbody>{result.recent.map((r, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2">{time(r.created_at)}</td><td className="py-1.5 pr-2 font-semibold">{r.code}</td><td className="py-1.5 pr-2">{MOVE_LABEL[r.typ] ?? r.typ} {Number(r.delta) > 0 ? "+" : ""}{n(r.delta)}</td><td className="py-1.5 pr-2 text-right font-mono">{inr(r.value)}</td><td className="py-1.5">{r.by_name ?? "-"}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportTable({ tab, rows, offset, grand }: { tab: Tab; rows: Row[]; offset: number; grand: number }) {
  const num = "text-right font-mono";
  const idx = (i: number) => <td className="text-muted">{offset + i + 1}</td>;
  const share = (v: unknown) => <td className={num}>{grand > 0 ? `${((Number(v) / grand) * 100).toFixed(1)}%` : "-"}</td>;
  if (tab === "category" || tab === "warehouse" || tab === "supplier") {
    const key = tab === "category" ? "category_name" : tab === "warehouse" ? "place_name" : "supplier_name";
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>{tab === "category" ? "Category" : tab === "warehouse" ? "Warehouse" : "Supplier (last receipt)"}</th><th className="text-right">Items</th><th className="text-right">Quantity</th><th className="text-right">Stock Value</th><th className="text-right">Share</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r[key])}>{idx(i)}<td className="font-semibold">{String(r[key])}</td><td className={num}>{n(r.items)}</td><td className={num}>{n(r.qty)}</td><td className={num}>{inr(r.value)}</td>{share(r.value)}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "ageing") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Age Group</th><th className="text-right">Stock Lines</th><th className="text-right">Quantity</th><th className="text-right">Stock Value</th><th className="text-right">Share</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.bucket)}>{idx(i)}<td className="font-semibold">{String(r.bucket)}</td><td className={num}>{n(r.lines)}</td><td className={num}>{n(r.qty)}</td><td className={num}>{inr(r.value)}</td>{share(r.value)}</tr>)}</tbody>
      </table>
    );
  }
  const out = tab === "out";
  return (
    <table className="dash-table w-full text-left text-sm">
      <thead><tr><th>#</th><th>SKU Code</th><th>Item Name</th><th>Category</th><th>Warehouse</th><th className="text-right">Current Stock</th><th className="text-right">Unit Cost</th><th className="text-right">{out ? "Refill Value" : "Stock Value"}</th><th className="text-right">Age (Days)</th><th>Movement</th><th>Stock Status</th><th>Last Updated</th><th className="print:hidden">Action</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={`${r.item_id}-${r.place_name}`}>{idx(i)}<td className="whitespace-nowrap text-[13px] font-semibold"><Link href={`/items/${r.item_id}`}>{String(r.code)}</Link></td><td className="min-w-32">{String(r.item_name)}</td><td>{String(r.category_name)}</td><td className="whitespace-nowrap">{String(r.place_name)}</td>
          <td className={num}>{n(r.qty)} <span className="text-xs text-muted">{String(r.unit)}</span></td><td className={num}>{inr2(r.avg_cost)}</td><td className={num}>{inr(out ? r.refill_value : r.value)}</td><td className={num}>{r.age_days ?? "-"}</td>
          <td><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${MOVEMENT_STYLE[String(r.movement)]}`}>{MOVEMENT_LABEL[String(r.movement)]}</span></td>
          <td><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[String(r.status)]}`}>{STATUS_LABEL[String(r.status)]}</span></td>
          <td className="whitespace-nowrap">{day(r.last_move as string)}</td>
          <td className="print:hidden"><Link href={`/items/${r.item_id}`} aria-label={`View ${r.code}`} title="View item" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link></td></tr>
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
