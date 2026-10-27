import Link from "next/link";
import { ArrowDownToLine, ChevronLeft, ChevronRight, Eye, Package, RotateCcw, Search, ShoppingCart, User, Wallet, Banknote, type LucideIcon } from "lucide-react";
import { z } from "zod";
import { BarList, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from "@/lib/validation/customer";
import { STATUS_LABEL as DISPATCH_LABEL } from "@/lib/validation/dispatch";
import { sanitizeSearch } from "@/lib/validation/item";
import { CHANNELS, CHANNEL_BADGE, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { TABS, TAB_LABEL, type Tab } from "@/lib/validation/sales-report";
import { RowsPerPage } from "../../items/item-controls";
import { PrintButton } from "../../stock/movements/ledger-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CAT_COLORS = ["#2a63d6", "#16a05f", "#e8b21a", "#7a55d6", "#d6402f", "#8b95a5"];
const DISPATCH_STYLE: Record<string, string> = {
  DISPATCHED: "bg-[#ece8fb] text-[#5b3fc0] dark:bg-[#2c2556] dark:text-[#c3b5ff]",
  IN_TRANSIT: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  OUT_FOR_DELIVERY: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  DELIVERED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  DELIVERY_FAILED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  RTO: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};

type Row = Record<string, string | number | null>;
type PageData = {
  tab: Tab; total: number; rows: Row[]; categories: { id: string; name: string }[];
  compare_range: { cur_from: string; cur_to: string; prev_from: string; prev_to: string };
  kpi: { orders: number; sales: number; items_sold: number; avg: number | null; customers: number; return_orders: number };
  trend: { day: string; orders: number; value: number }[]; channels: { channel: string; value: number }[]; categories_value: { name: string; value: number }[];
  top_products: { code: string; item_name: string; qty: number; value: number }[]; top_customers: { cname: string; orders: number; value: number }[]; top_cities: { city: string; orders: number; value: number }[];
};
const EMPTY: PageData = {
  tab: "orders", total: 0, rows: [], categories: [], compare_range: { cur_from: "", cur_to: "", prev_from: "", prev_to: "" },
  kpi: { orders: 0, sales: 0, items_sold: 0, avg: null, customers: 0, return_orders: 0 }, trend: [], channels: [], categories_value: [], top_products: [], top_customers: [], top_cities: [],
};

const n = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 }));
const inr = (v: number | string | null) => (v === null || v === undefined ? "-" : Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }));
const compactInr = (v: number) => (v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` : `₹${Math.round(v)}`);
const day = (iso: string | null | undefined) => (iso ? new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "2-digit" });
const ChannelCell = ({ channel }: { channel: string }) => {
  const b = CHANNEL_BADGE[channel] ?? CHANNEL_BADGE.OTHER;
  return <span className="flex items-center gap-2"><span aria-hidden className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: b.bg }}>{b.letter}</span><span>{CHANNEL_LABEL[channel] ?? channel}</span></span>;
};

export default async function SalesReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAnyPermission("reports.view");
  const sp = await searchParams;

  const tab: Tab = (TABS as readonly string[]).includes(first(sp.tab) ?? "") ? (first(sp.tab) as Tab) : "orders";
  const q = sanitizeSearch(first(sp.q));
  const channel = (CHANNELS as readonly string[]).includes(first(sp.channel) ?? "") ? first(sp.channel)! : "all";
  const category = z.uuid().safeParse(first(sp.category)).data ?? "";
  const ctype = (CUSTOMER_TYPES as readonly string[]).includes(first(sp.ctype) ?? "") ? first(sp.ctype)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_report", {
    p_tab: tab, p_q: q || null, p_channel: channel === "all" ? null : channel, p_category: category || null, p_ctype: ctype === "all" ? null : ctype,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      tab: tab !== "orders" ? tab : undefined, q: q || undefined, channel: channel !== "all" ? channel : undefined, category: category || undefined, ctype: ctype !== "all" ? ctype : undefined,
      from: from || undefined, to: to || undefined, size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/reports/sales?${s}` : "/reports/sales";
  };
  const exportQuery = new URLSearchParams(Object.entries({ tab, q, channel: channel !== "all" ? channel : "", category, ctype: ctype !== "all" ? ctype : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const chTotal = result.channels.reduce((a, c) => a + Number(c.value), 0);
  const chSegs = result.channels.slice(0, 6).map((c, i) => ({ key: c.channel, label: CHANNEL_LABEL[c.channel] ?? c.channel, value: Number(c.value), color: CAT_COLORS[i] }));
  const catSorted = [...result.categories_value].sort((a, b) => Number(b.value) - Number(a.value));
  const catRows = [...catSorted.slice(0, 5), ...(catSorted.length > 5 ? [{ name: "Others", value: catSorted.slice(5).reduce((a, c) => a + Number(c.value), 0) }] : [])];
  const filtersOn = !!(q || category || from || to || channel !== "all" || ctype !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <Link href="/reports">Reports</Link> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Sales Reports</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Sales Reports</h1>
          <p className="mt-1 text-sm text-muted">View sales performance, channel-wise sales, product-wise sales and customer analytics. A sale is a dispatched sales order.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/reports/sales/export?${exportQuery}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted"><ArrowDownToLine size={18} aria-hidden /> Export</a>
          <PrintButton />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ShoppingCart} tint="blue" label="Total Orders" value={n(kpi.orders)} href={keep({ tab: undefined, page: undefined })} />
        <Kpi icon={Wallet} tint="violet" label="Total Sales (₹)" value={inr(kpi.sales)} href={keep({ tab: "monthly", page: undefined })} sub="Order value - discount + shipping" />
        <Kpi icon={Package} tint="blue" label="Total Items Sold" value={n(kpi.items_sold)} href={keep({ tab: "product", page: undefined })} />
        <Kpi icon={Banknote} tint="amber" label="Average Order Value" value={inr(kpi.avg)} href={keep({ tab: "channel", page: undefined })} />
        <Kpi icon={User} tint="green" label="Total Customers" value={n(kpi.customers)} href={keep({ tab: "customer", page: undefined })} />
        <Kpi icon={RotateCcw} tint="red" label="Return Orders" value={n(kpi.return_orders)} href="/returns" sub="Orders with a return" />
      </section>

      <section className={`${cardClass} !p-4 print:hidden`}>
        <form method="get" className="grid gap-3 md:grid-cols-3 2xl:grid-cols-[repeat(2,minmax(0,1fr))_repeat(3,minmax(0,1fr))_minmax(10rem,1.5fr)_auto_auto] 2xl:items-end">
          {tab !== "orders" && <input type="hidden" name="tab" value={tab} />}
          <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span><input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span><input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
          <FilterSelect label="Sales Channel" name="channel" value={channel}><option value="all">All Channels</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</FilterSelect>
          <FilterSelect label="Category" name="category" value={category}><option value="">All Categories</option>{result.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</FilterSelect>
          <FilterSelect label="Customer Type" name="ctype" value={ctype}><option value="all">All Customers</option>{CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>)}</FilterSelect>
          <label className="relative block md:col-span-3 2xl:col-span-1"><span className="sr-only">Search</span>
            <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search order, customer, city, SKU" autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" /></label>
          <Link href={tab !== "orders" ? `/reports/sales?tab=${tab}` : "/reports/sales"} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong"><Search size={16} aria-hidden /> Apply</button>
        </form>
        <p className="mt-2 text-xs text-muted">Date range works on the order date. In Comparison, the range (default this month so far) is compared with the period of the same length just before it. Payment status is not shown: the system has no customer payments yet.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Sales Trend (Last 30 Days)</h2>
          <SalesTrend points={result.trend} />
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Channel-wise Sales</h2>
          {chTotal === 0 ? <p className="py-8 text-center text-sm text-muted">No sales yet.</p> : <DonutChart segments={chSegs} centerValue={compactInr(chTotal)} centerLabel="Total Sales" ariaLabel="Sales by channel" />}
        </section>
        <section className={`${cardClass} !p-4`}>
          <h2 className="mb-3 text-base font-bold">Category-wise Sales</h2>
          <BarList rows={catRows.map((c) => ({ key: c.name, label: c.name, value: Number(c.value), display: inr(c.value) }))} emptyText="No sales yet." />
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-3 text-base font-bold">Top 5 Products by Sales Value</h2>
          {result.top_products.length === 0 ? <p className="py-6 text-center text-sm text-muted">No sales yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">SKU</th><th className="py-1 pr-2">Item Name</th><th className="py-1 pr-2 text-right">Qty Sold</th><th className="py-1 text-right">Sales Value</th></tr></thead>
              <tbody>{result.top_products.map((t, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2">{i + 1}</td><td className="py-1.5 pr-2 font-semibold">{t.code}</td><td className="max-w-28 truncate py-1.5 pr-2">{t.item_name}</td><td className="py-1.5 pr-2 text-right font-mono">{n(t.qty)}</td><td className="py-1.5 text-right font-mono">{inr(t.value)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-3 text-base font-bold">Top 5 Customers by Sales Value</h2>
          {result.top_customers.length === 0 ? <p className="py-6 text-center text-sm text-muted">No sales yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">Customer Name</th><th className="py-1 pr-2 text-right">Orders</th><th className="py-1 text-right">Sales Value</th></tr></thead>
              <tbody>{result.top_customers.map((t, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2">{i + 1}</td><td className="max-w-36 truncate py-1.5 pr-2 font-semibold">{t.cname}</td><td className="py-1.5 pr-2 text-right font-mono">{n(t.orders)}</td><td className="py-1.5 text-right font-mono">{inr(t.value)}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <h2 className="mb-3 text-base font-bold">City-wise Sales (Top 5)</h2>
          {result.top_cities.length === 0 ? <p className="py-6 text-center text-sm text-muted">No sales yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs">
              <thead><tr className="text-muted"><th className="py-1 pr-2">#</th><th className="py-1 pr-2">City</th><th className="py-1 pr-2 text-right">Orders</th><th className="py-1 text-right">Sales Value</th></tr></thead>
              <tbody>{result.top_cities.map((t, i) => <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2">{i + 1}</td><td className="py-1.5 pr-2 font-semibold">{t.city}</td><td className="py-1.5 pr-2 text-right font-mono">{n(t.orders)}</td><td className="py-1.5 text-right font-mono">{inr(t.value)}</td></tr>)}</tbody>
            </table></div>
          )}
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
          <a href={`/reports/sales/export?${exportQuery}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-brand-strong print:hidden"><ArrowDownToLine size={16} aria-hidden /> Download Excel (CSV)</a>
        </div>
        <h2 className="mb-2 hidden text-base font-bold print:block">{TAB_LABEL[tab]}</h2>
        {tab === "comparison" && <p className="mb-2 text-xs text-muted">This period: {day(result.compare_range.cur_from)} to {day(result.compare_range.cur_to)}. Previous period: {day(result.compare_range.prev_from)} to {day(result.compare_range.prev_to)}.</p>}

        {result.rows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="Nothing to show" text={filtersOn ? "Try a different word, or press Clear." : "A sale appears here once a sales order is dispatched."} />
        ) : <div className="overflow-x-auto"><ReportTable tab={tab} rows={result.rows} offset={(page - 1) * size} /></div>}

        {tab !== "comparison" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} {tab === "orders" ? "orders" : "lines"}</span>
            <nav aria-label="Pagination" className="flex items-center gap-1.5">
              {page > 1 ? <PageLink href={keep({ page: page - 1 })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
              {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : <PageLink key={p} href={keep({ page: p })} active={p === page} label={`Page ${p}`}>{p}</PageLink>)}
              {page < lastPage ? <PageLink href={keep({ page: page + 1 })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
            </nav>
            <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
          </div>
        )}
      </section>
    </main>
  );
}

function ReportTable({ tab, rows, offset }: { tab: Tab; rows: Row[]; offset: number }) {
  const num = "text-right font-mono";
  const money = (v: unknown) => <td className={num}>{inr(v as number | null)}</td>;
  const idx = (i: number) => <td className="text-muted">{offset + i + 1}</td>;
  if (tab === "comparison") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>Measure</th><th className="text-right">This Period</th><th className="text-right">Previous Period</th><th className="text-right">Change</th></tr></thead>
        <tbody>{rows.map((r) => {
          const isMoney = /value/i.test(String(r.metric));
          const cur = r.current === null ? null : Number(r.current), prev = r.previous === null ? null : Number(r.previous);
          const pct = cur !== null && prev !== null && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
          const bad = String(r.metric) === "Returns";
          const f = (v: number | null) => (v === null ? "-" : isMoney ? inr(v) : n(v));
          const good = pct === null ? "" : (pct >= 0) !== bad ? "text-green-700 dark:text-green-400" : "text-[var(--danger)]";
          return <tr key={String(r.metric)}><td className="font-medium">{String(r.metric)}</td><td className={num}>{f(cur)}</td><td className={num}>{f(prev)}</td><td className={`${num} ${good}`}>{pct === null ? "-" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}</td></tr>;
        })}</tbody>
      </table>
    );
  }
  if (tab === "product") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>SKU Code</th><th>Item Name</th><th>Category</th><th className="text-right">Orders</th><th className="text-right">Qty Sold</th><th>Unit</th><th className="text-right">Avg Rate</th><th className="text-right">Sales Value</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.code)}>{idx(i)}<td className="whitespace-nowrap text-[13px] font-semibold">{String(r.code)}</td><td className="min-w-32">{String(r.item_name)}</td><td>{String(r.category_name)}</td><td className={num}>{n(r.orders)}</td><td className={num}>{n(r.qty)}</td><td>{String(r.unit)}</td>{money(r.avg_rate)}{money(r.value)}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "channel") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Channel</th><th className="text-right">Orders</th><th className="text-right">Customers</th><th className="text-right">Items Sold</th><th className="text-right">Order Value</th><th className="text-right">Discount</th><th className="text-right">Net Sales</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.channel)}>{idx(i)}<td><ChannelCell channel={String(r.channel)} /></td><td className={num}>{n(r.orders)}</td><td className={num}>{n(r.customers)}</td><td className={num}>{n(r.qty)}</td>{money(r.value)}{money(r.discount)}{money(r.net)}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "customer") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Customer Name</th><th>Type</th><th>City</th><th className="text-right">Orders</th><th className="text-right">Items Sold</th><th className="text-right">Net Sales</th><th>Last Order</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.customer_id)}>{idx(i)}<td className="min-w-32 font-semibold">{String(r.cname)}</td><td>{CUSTOMER_TYPE_LABEL[r.ctype as keyof typeof CUSTOMER_TYPE_LABEL] ?? String(r.ctype)}</td><td>{String(r.city)}</td><td className={num}>{n(r.orders)}</td><td className={num}>{n(r.qty)}</td>{money(r.net)}<td className="whitespace-nowrap">{day(r.last_order as string)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (tab === "city") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>City</th><th className="text-right">Orders</th><th className="text-right">Customers</th><th className="text-right">Items Sold</th><th className="text-right">Net Sales</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.city)}>{idx(i)}<td className="font-semibold">{String(r.city)}</td><td className={num}>{n(r.orders)}</td><td className={num}>{n(r.customers)}</td><td className={num}>{n(r.qty)}</td>{money(r.net)}</tr>)}</tbody>
      </table>
    );
  }
  if (tab === "monthly") {
    return (
      <table className="dash-table w-full text-left text-sm">
        <thead><tr><th>#</th><th>Month</th><th className="text-right">Orders</th><th className="text-right">Customers</th><th className="text-right">Items Sold</th><th className="text-right">Order Value</th><th className="text-right">Discount</th><th className="text-right">Net Sales</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={String(r.month)}>{idx(i)}<td className="font-semibold">{monthLabel(String(r.month))}</td><td className={num}>{n(r.orders)}</td><td className={num}>{n(r.customers)}</td><td className={num}>{n(r.qty)}</td>{money(r.value)}{money(r.discount)}{money(r.net)}</tr>)}</tbody>
      </table>
    );
  }
  return (
    <table className="dash-table w-full text-left text-sm">
      <thead><tr><th>#</th><th>Order ID</th><th>Order Date</th><th>Customer Name</th><th>Channel</th><th className="text-right">Items</th><th className="text-right">Order Value</th><th className="text-right">Discount</th><th className="text-right">Net Value</th><th>Dispatch Status</th><th className="text-right">Return</th><th className="print:hidden">Action</th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={String(r.order_id)}>{idx(i)}<td className="whitespace-nowrap text-[13px] font-semibold"><Link href={`/sales-orders?sel=${r.order_id}&p=details`}>{String(r.order_no)}</Link></td><td className="whitespace-nowrap">{day(r.order_date as string)}</td>
          <td className="min-w-32 font-medium">{String(r.cname)}</td><td className="whitespace-nowrap"><ChannelCell channel={String(r.channel)} /></td><td className={num}>{n(r.items)}</td>{money(r.value)}{money(r.discount)}{money(r.net)}
          <td><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${DISPATCH_STYLE[String(r.dispatch_status)] ?? ""}`}>{DISPATCH_LABEL[String(r.dispatch_status)] ?? String(r.dispatch_status)}</span></td>
          <td className={`${num} ${Number(r.returns) > 0 ? "text-[var(--danger)]" : ""}`}>{n(r.returns)}</td>
          <td className="print:hidden"><Link href={`/sales-orders?sel=${r.order_id}&p=details`} aria-label={`View ${r.order_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link></td></tr>
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

// Orders per day (columns) and sales value per day (line), last 30 days.
function SalesTrend({ points }: { points: { day: string; orders: number; value: number }[] }) {
  const W = 520, H = 230, L = 30, R = 44, T = 10, B = 24;
  const plotW = W - L - R, plotH = H - T - B;
  const maxN = Math.max(1, ...points.map((p) => Number(p.orders)));
  const maxV = Math.max(1, ...points.map((p) => Number(p.value)));
  const step = plotW / Math.max(points.length, 1);
  const bw = Math.min(8, step * 0.55);
  const yN = (v: number) => T + plotH - (v / maxN) * plotH;
  const yV = (v: number) => T + plotH - (v / maxV) * plotH;
  if (points.every((p) => Number(p.orders) === 0)) return <p className="py-10 text-center text-sm text-muted">No sales in the last 30 days.</p>;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${(L + i * step + step / 2).toFixed(1)},${yV(Number(p.value)).toFixed(1)}`).join(" ");
  const label = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
  return (
    <div>
      <div className="mb-1 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#2a63d6]" /> Orders</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[#16a05f]" /> Sales Value (₹)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Orders and sales value per day, last 30 days" className="h-auto w-full">
        {[0, 0.5, 1].map((f) => <line key={f} x1={L} x2={W - R} y1={T + plotH - f * plotH} y2={T + plotH - f * plotH} stroke="var(--line)" strokeWidth="1" />)}
        {[0, 0.5, 1].map((f) => <text key={`n${f}`} x={L - 5} y={T + plotH - f * plotH + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{Math.round(f * maxN)}</text>)}
        {[0, 0.5, 1].map((f) => <text key={`v${f}`} x={W - R + 5} y={T + plotH - f * plotH + 4} className="fill-[var(--muted)] text-[10px]">{compactInr(f * maxV)}</text>)}
        {points.map((p, i) => {
          const x = L + i * step + step / 2;
          return (
            <g key={p.day}>
              <title>{`${label(p.day)}: ${p.orders} orders, ${inr(p.value)}`}</title>
              {Number(p.orders) > 0 && <rect x={x - bw / 2} y={yN(Number(p.orders))} width={bw} height={T + plotH - yN(Number(p.orders))} rx="1.5" fill="#2a63d6" />}
              {i % 7 === 0 && <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{label(p.day)}</text>}
            </g>
          );
        })}
        <path d={line} fill="none" stroke="#16a05f" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div className="sr-only"><ul>{points.map((p) => <li key={p.day}>{label(p.day)}: {p.orders} orders, {inr(p.value)}</li>)}</ul></div>
    </div>
  );
}
