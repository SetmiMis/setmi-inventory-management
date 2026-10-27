import Link from "next/link";
import { ArrowDownToLine, Boxes, ChevronLeft, ChevronRight, Eye, Layers, PackageX, Search, TrendingDown, Turtle, Wallet, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { BarList, ColumnChart, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { MOVE_LABEL, MOVE_TYPES, STATUS_FILTERS, STATUS_LABEL, TABS, TAB_LABEL, type Tab } from "@/lib/validation/inventory-report";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../../items/item-controls";
import { PrintButton } from "../../stock/movements/ledger-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_STYLE: Record<string, string> = {
  IN: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  OVER: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  LOW: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  OUT: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const CAT_COLORS = ["#2a63d6", "#16a05f", "#e8b21a", "#7a55d6", "#d6402f", "#8b95a5"];

type StockRow = {
  item_id: string; code: string; item_name: string; category_name: string | null; unit: string; place_name: string; rack: string | null; qty: number; reserved: number; available: number;
  min_qty: number | null; max_qty: number | null; avg_cost: number | null; value: number | null; status: string; sold_qty: number; last_sale: string | null; last_in: string | null; last_move: string | null; age_days: number | null;
};
type MoveRow = { id: number; created_at: string; typ: string; reference: string | null; reason: string | null; code: string; item_name: string; unit: string; place_name: string; delta: number; by_name: string | null };
type LocRow = { location_id: string; place_name: string; items: number; qty: number; value: number | null; low: number; out: number };
type PageData = {
  tab: Tab; total: number; rows: (StockRow | MoveRow | LocRow)[]; categories: { id: string; name: string }[]; places: { id: string; name: string }[];
  kpi: { items: number; qty: number; value: number | null; low: number; out: number; slow: number };
  value_by_category: { name: string; value: number }[]; qty_by_place: { name: string; qty: number }[]; movement_trend: { day: string; in: number; out: number }[];
  status_dist: { out: number; low: number; slow: number; in: number; inactive: number };
  top_items: { code: string; item_name: string; qty: number; value: number | null }[]; low_top: { code: string; item_name: string; place_name: string; qty: number; min_qty: number | null }[];
  recent: { created_at: string; code: string; typ: string; delta: number; by_name: string | null }[];
};
const EMPTY: PageData = {
  tab: "current", total: 0, rows: [], categories: [], places: [], kpi: { items: 0, qty: 0, value: null, low: 0, out: 0, slow: 0 }, value_by_category: [], qty_by_place: [], movement_trend: [],
  status_dist: { out: 0, low: 0, slow: 0, in: 0, inactive: 0 }, top_items: [], low_top: [], recent: [],
};

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inr = (v: number | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }));
const compactInr = (v: number) => (v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` : `₹${Math.round(v)}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
const bucket = (d: number | null) => (d === null ? "No stock-in" : d <= 30 ? "0-30 days" : d <= 60 ? "31-60 days" : d <= 90 ? "61-90 days" : "91+ days");

export default async function InventoryReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? "") ? (first(sp.tab) as Tab) : "current";
  const q = sanitizeSearch(first(sp.q));
  const category = z.uuid().safeParse(first(sp.category)).data ?? "";
  const location = z.uuid().safeParse(first(sp.location)).data ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const type = (MOVE_TYPES as readonly string[]).includes(first(sp.type) ?? "") ? first(sp.type)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("inventory_report", {
    p_tab: tab, p_q: q || null, p_category: category || null, p_location: location || null, p_status: status === "all" ? null : status, p_type: type === "all" ? null : type,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const showValue = kpi.value !== null;

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      tab: tab !== "current" ? tab : undefined, q: q || undefined, category: category || undefined, location: location || undefined, status: status !== "all" ? status : undefined,
      type: type !== "all" ? type : undefined, from: from || undefined, to: to || undefined, size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/reports/inventory?${s}` : "/reports/inventory";
  };
  const exportQuery = new URLSearchParams(Object.entries({ tab, q, category, location, status: status !== "all" ? status : "", type: type !== "all" ? type : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  // Stock value by category: five biggest and the rest as "Others".
  const catTotal = result.value_by_category.reduce((a, c) => a + Number(c.value), 0);
  const catSorted = [...result.value_by_category].sort((a, b) => Number(b.value) - Number(a.value));
  const catTop = catSorted.slice(0, 5);
  const catOthers = catSorted.slice(5).reduce((a, c) => a + Number(c.value), 0);
  const catSegs = [...catTop.map((c, i) => ({ key: c.name, label: c.name, value: Number(c.value), color: CAT_COLORS[i] })), ...(catOthers > 0 ? [{ key: "others", label: "Others", value: catOthers, color: CAT_COLORS[5] }] : [])];
  const placePoints = result.qty_by_place.slice(0, 6).map((p) => ({ key: p.name, label: p.name, value: Number(p.qty) }));
  const sd = result.status_dist;
  const sdTotal = sd.in + sd.low + sd.out + sd.slow + sd.inactive;
  const sdSegs = [
    { key: "in", label: "In Stock", value: sd.in, color: "#16a05f" }, { key: "low", label: "Low Stock", value: sd.low, color: "#e8b21a" }, { key: "out", label: "Out of Stock", value: sd.out, color: "#d6402f" },
    { key: "slow", label: "Slow Moving", value: sd.slow, color: "#2a63d6" }, { key: "inactive", label: "Inactive (with stock)", value: sd.inactive, color: "#8b95a5" },
  ];
  const filtersOn = !!(q || category || location || from || to || status !== "all" || type !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <Link href="/reports">Reports</Link> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Inventory Reports</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Inventory Reports</h1>
          <p className="mt-1 text-sm text-muted">View stock position, movement, ageing, fast and slow moving items and inventory analytics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/reports/inventory/export?${exportQuery}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Boxes} tint="blue" label="Total Items (SKU)" value={n(kpi.items)} href={keep({ tab: undefined, page: undefined })} />
        <Kpi icon={Layers} tint="green" label="Total Stock Quantity" value={n(kpi.qty)} href={keep({ tab: "location", page: undefined })} />
        <Kpi icon={Wallet} tint="violet" label="Total Stock Value" value={kpi.value === null ? "-" : inr(kpi.value)} href={keep({ tab: "location", page: undefined })} sub={kpi.value === null ? "Needs the cost permission" : undefined} />
        <Kpi icon={TrendingDown} tint="amber" label="Low Stock Items" value={n(kpi.low)} href={keep({ tab: "low", page: undefined })} />
        <Kpi icon={PackageX} tint="red" label="Out of Stock Items" value={n(kpi.out)} href={keep({ tab: "out", page: undefined })} />
        <Kpi icon={Turtle} tint="amber" label="Slow Moving Items" value={n(kpi.slow)} href={keep({ tab: "slow", page: undefined })} />
      </section>

      <section className={`${cardClass} !p-4 print:hidden`}>
        <form method="get" className="grid gap-3 md:grid-cols-3 2xl:grid-cols-[repeat(2,minmax(0,1fr))_repeat(4,minmax(0,1fr))_minmax(10rem,1.5fr)_auto_auto] 2xl:items-end">
          {tab !== "current" && <input type="hidden" name="tab" value={tab} />}
          <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
            <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
            <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
          <FilterSelect label="Warehouse" name="location" value={location}><option value="">All Warehouses</option>{result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FilterSelect>
          <FilterSelect label="Category" name="category" value={category}><option value="">All Categories</option>{result.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</FilterSelect>
          <FilterSelect label="Stock Status" name="status" value={status}><option value="all">All Items</option>{STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</FilterSelect>
          <FilterSelect label="Movement Type" name="type" value={type}><option value="all">All Types</option>{MOVE_TYPES.map((t) => <option key={t} value={t}>{MOVE_LABEL[t]}</option>)}</FilterSelect>
          <label className="relative block md:col-span-3 2xl:col-span-1"><span className="sr-only">Search</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search SKU, item name" autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" /></label>
          <Link href={tab !== "current" ? `/reports/inventory?tab=${tab}` : "/reports/inventory"} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong"><Search size={16} aria-hidden /> Apply</button>
        </form>
        <p className="mt-2 text-xs text-muted">Date range: used for the sold quantity (Slow / Fast Moving) and the Stock Movement tab; empty means the last 30 days. Stock Status works on the Current Stock tab; Movement Type on the Stock Movement tab.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">{showValue ? "Stock Value by Category" : "Stock Quantity by Category"}</h2>
          {catTotal === 0 ? <p className="py-8 text-center text-sm text-muted">No stock yet.</p> : (
            <DonutChart segments={catSegs} centerValue={showValue ? compactInr(catTotal) : n(catTotal)} centerLabel={showValue ? "Total Value" : "Total Quantity"} ariaLabel="Stock by category" />
          )}
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Quantity by Warehouse</h2>
          <ColumnChart data={placePoints} ariaLabel="Stock quantity in each warehouse" tableLabel="Quantity by warehouse" valueLabel="Quantity" emptyText="No stock yet." />
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Movement (Last 30 Days)</h2>
          <MovementTrend points={result.movement_trend} />
        </section>
      </div>

      <section className={`${cardClass} min-w-0 !p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Report tabs" className="flex flex-wrap gap-1 border-b border-line text-sm print:hidden">
            {TABS.map((t) => (
              <Link key={t} href={keep({ tab: t === "current" ? undefined : t, page: undefined, })} role="tab" aria-selected={t === tab}
                className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 py-2.5 font-semibold ${t === tab ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{TAB_LABEL[t]}</Link>
            ))}
          </div>
          <a href={`/reports/inventory/export?${exportQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-brand-strong print:hidden"><ArrowDownToLine size={16} aria-hidden /> Download Excel (CSV)</a>
        </div>
        <h2 className="mb-2 hidden text-base font-bold print:block">{TAB_LABEL[tab]}</h2>

        {result.rows.length === 0 ? (
          <EmptyState icon={Boxes} title="Nothing to show" text={filtersOn ? "Try a different word, or press Clear." : tab === "movement" ? "No stock moved in this date range." : "Nothing matches this tab yet."} />
        ) : (
          <div className="overflow-x-auto">
            <ReportTable tab={tab} rows={result.rows} offset={(page - 1) * size} showValue={showValue} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
          <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} {tab === "movement" ? "movements" : tab === "location" ? "warehouses" : "stock lines"}</span>
          <nav aria-label="Pagination" className="flex items-center gap-1.5">
            {page > 1 ? <PageLink href={keep({ page: page - 1 })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
            {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : <PageLink key={p} href={keep({ page: p })} active={p === page} label={`Page ${p}`}>{p}</PageLink>)}
            {page < lastPage ? <PageLink href={keep({ page: page + 1 })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
          </nav>
          <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Stock Status Distribution</h2>
          {sdTotal === 0 ? <p className="py-8 text-center text-sm text-muted">No stock yet.</p> : <DonutChart segments={sdSegs} centerValue={n(sdTotal)} centerLabel="Total" ariaLabel="Stock lines by status" />}
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">{showValue ? "Top 5 High Value Items" : "Top 5 Items by Quantity"}</h2>
          <BarList rows={result.top_items.map((t) => ({ key: t.code, label: t.code, sub: t.item_name, value: showValue ? Number(t.value ?? 0) : Number(t.qty), display: showValue ? inr(t.value) : n(Number(t.qty)) }))} emptyText="No stock yet." />
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-3 text-base font-bold">Low Stock Items (Top 5)</h2>
          {result.low_top.length === 0 ? <p className="py-6 text-center text-sm text-muted">No low stock items.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Item Name</th><th className="py-1 pr-2 text-right">Current</th><th className="py-1 text-right">Min</th></tr></thead>
              <tbody>{result.low_top.map((l, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2 font-semibold">{l.code}</td><td className="max-w-28 truncate py-1.5 pr-2">{l.item_name}</td><td className="py-1.5 pr-2 text-right font-mono">{n(l.qty)}</td><td className="py-1.5 text-right font-mono">{l.min_qty === null ? "-" : n(l.min_qty)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Recent Stock Activity</h2><Link href="/stock/movements" className="text-xs font-semibold">View All</Link></div>
          {result.recent.length === 0 ? <p className="py-6 text-center text-sm text-muted">No stock activity yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">Time</th><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Type</th><th className="py-1 pr-2 text-right">Qty</th><th className="py-1">User</th></tr></thead>
              <tbody>{result.recent.map((r, i) => (
                <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2">{time(r.created_at)}</td><td className="py-1.5 pr-2 font-semibold">{r.code}</td><td className="py-1.5 pr-2">{MOVE_LABEL[r.typ] ?? r.typ}</td>
                  <td className={`py-1.5 pr-2 text-right font-mono ${Number(r.delta) < 0 ? "text-[var(--danger)]" : "text-green-700 dark:text-green-400"}`}>{Number(r.delta) > 0 ? "+" : ""}{n(r.delta)}</td><td className="py-1.5">{r.by_name ?? "-"}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportTable({ tab, rows, offset, showValue }: { tab: Tab; rows: PageData["rows"]; offset: number; showValue: boolean }) {
  const num = "text-right font-mono";
  if (tab === "movement") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Date &amp; Time</th><th>SKU Code</th><th>Item Name</th><th>Warehouse</th><th>Type</th><th className="text-right">Quantity</th><th>Reference</th><th>By</th></tr></thead>
        <tbody>{(rows as MoveRow[]).map((r, i) => (
          <tr key={r.id}><td className="text-muted">{offset + i + 1}</td><td className="whitespace-nowrap">{time(r.created_at)}</td><td className="whitespace-nowrap font-semibold">{r.code}</td><td className="min-w-32">{r.item_name}</td><td>{r.place_name}</td>
            <td>{MOVE_LABEL[r.typ] ?? r.typ}</td><td className={`${num} ${Number(r.delta) < 0 ? "text-[var(--danger)]" : "text-green-700 dark:text-green-400"}`}>{Number(r.delta) > 0 ? "+" : ""}{n(r.delta)} {r.unit}</td><td>{r.reference ?? "-"}</td><td>{r.by_name ?? "-"}</td></tr>
        ))}</tbody>
      </table>
    );
  }
  if (tab === "location") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Warehouse</th><th className="text-right">Items</th><th className="text-right">Quantity</th>{showValue && <th className="text-right">Stock Value</th>}<th className="text-right">Low Stock</th><th className="text-right">Out of Stock</th></tr></thead>
        <tbody>{(rows as LocRow[]).map((r, i) => (
          <tr key={r.location_id}><td className="text-muted">{offset + i + 1}</td><td className="font-semibold">{r.place_name}</td><td className={num}>{n(r.items)}</td><td className={num}>{n(r.qty)}</td>{showValue && <td className={num}>{inr(r.value)}</td>}<td className={num}>{n(r.low)}</td><td className={num}>{n(r.out)}</td></tr>
        ))}</tbody>
      </table>
    );
  }
  const list = rows as StockRow[];
  const moving = tab === "slow" || tab === "fast";
  return (
    <table className="dash-table w-full text-left text-sm">
      <thead>
        <tr><th>#</th><th>SKU Code</th><th>Item Name</th><th>Category</th><th>Warehouse</th><th className="text-right">Current Stock</th>
          {tab === "ageing" ? <><th>Last Stock In</th><th className="text-right">Age (days)</th><th>Age Group</th></> : moving ? <><th className="text-right">Sold</th><th>Last Sale</th></> : <><th className="text-right">Reserved</th><th className="text-right">Available</th><th>Rack</th></>}
          <th>Unit</th>{showValue && <th className="text-right">Stock Value</th>}{tab === "ageing" || moving ? null : <><th>Status</th><th>Last Updated</th></>}<th className="print:hidden">Action</th></tr>
      </thead>
      <tbody>
        {list.map((r, i) => (
          <tr key={`${r.item_id}-${r.place_name}`}>
            <td className="text-muted">{offset + i + 1}</td>
            <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={`/items/${r.item_id}`}>{r.code}</Link></td>
            <td className="min-w-32">{r.item_name}</td><td>{r.category_name ?? "-"}</td><td className="whitespace-nowrap">{r.place_name}</td>
            <td className={`${num} ${r.status === "OUT" ? "text-[var(--danger)]" : ""}`}>{n(r.qty)}</td>
            {tab === "ageing" ? <><td className="whitespace-nowrap">{day(r.last_in)}</td><td className={num}>{r.age_days ?? "-"}</td><td className="whitespace-nowrap">{bucket(r.age_days)}</td></>
              : moving ? <><td className={num}>{n(r.sold_qty)}</td><td className="whitespace-nowrap">{day(r.last_sale)}</td></>
              : <><td className={num}>{n(r.reserved)}</td><td className={num}>{n(r.available)}</td><td className="whitespace-nowrap">{r.rack ?? "-"}</td></>}
            <td>{r.unit}</td>{showValue && <td className={num}>{inr(r.value)}</td>}
            {tab === "ageing" || moving ? null : <><td><StatusPill status={r.status} /></td><td className="whitespace-nowrap">{day(r.last_move)}</td></>}
            <td className="print:hidden"><Link href={`/items/${r.item_id}`} aria-label={`View ${r.code}`} title="View item" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link></td>
          </tr>
        ))}
      </tbody>
    </table>
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", red: "bg-[#fde8e8] text-[#c8302f]", amber: "bg-[#fdf0e1] text-[#b45f08]", violet: "bg-[#ece8fb] text-[#5b3fc0]" } as const;

function Kpi({ icon: Icon, tint, label, value, href, sub }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; href: string; sub?: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-2xl font-bold leading-9 tracking-tight">{value}</span>
        {sub && <span className="block text-xs leading-tight text-muted">{sub}</span>}
      </span>
    </Link>
  );
}

// Stock In (columns) and Stock Out (line) per day, last 30 days.
function MovementTrend({ points }: { points: { day: string; in: number; out: number }[] }) {
  const W = 400, H = 230, L = 34, R = 8, T = 10, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const max = Math.max(1, ...points.map((p) => Math.max(Number(p.in), Number(p.out))));
  const step = plotW / Math.max(points.length, 1);
  const bw = Math.min(7, step * 0.55);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [...new Set([0, Math.round(max / 2), Math.round(max)])];
  if (points.every((p) => Number(p.in) === 0 && Number(p.out) === 0)) return <p className="py-10 text-center text-sm text-muted">No stock moved in the last 30 days.</p>;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(L + i * step + step / 2).toFixed(1)},${y(Number(p.out)).toFixed(1)}`).join(" ");
  const label = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#16a05f]" /> Stock In</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#2a63d6]" /> Stock Out</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Stock in and stock out per day, last 30 days" className="h-auto w-full">
        {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />)}
        {ticks.map((t) => <text key={`n${t}`} x={L - 5} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{t}</text>)}
        {points.map((p, i) => {
          const x = L + i * step + step / 2;
          return (
            <g key={p.day}>
              <title>{`${label(p.day)}: in ${n(Number(p.in))}, out ${n(Number(p.out))}`}</title>
              {Number(p.in) > 0 && <rect x={x - bw / 2} y={y(Number(p.in))} width={bw} height={T + plotH - y(Number(p.in))} rx="1.5" fill="#16a05f" />}
              {i % 7 === 0 && <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{label(p.day)}</text>}
            </g>
          );
        })}
        <path d={line} fill="none" stroke="#2a63d6" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div className="sr-only"><ul>{points.map((p) => <li key={p.day}>{label(p.day)}: in {n(Number(p.in))}, out {n(Number(p.out))}</li>)}</ul></div>
    </div>
  );
}

export const metadata = { title: "Inventory Reports" };
