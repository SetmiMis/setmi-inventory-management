import Link from "next/link";
import {
  ArrowDownToLine, ArrowLeftRight, ChevronLeft, ChevronRight, Eye, FileBarChart, Layers, PackageMinus, PackagePlus, Package, Repeat, Search, Shuffle, Undo2, X, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../../items/item-controls";
import { LedgerRowMenu, PrintButton } from "./ledger-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [15, 25, 50, 100];
const TABS = [["overview", "Overview"], ["ledger", "Stock Ledger"], ["places", "Warehouse Stock"]] as const;
const TYPES = ["RECEIPT", "SALE", "SALE_RETURN", "TRANSFER", "TRANSFER_SHORTAGE", "ADJUSTMENT", "OPENING", "STOCK_OUT"] as const;
const TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Inward", SALE: "Sale", SALE_RETURN: "Return", TRANSFER: "Transfer", TRANSFER_SHORTAGE: "Lost in transit", ADJUSTMENT: "Adjustment", OPENING: "Opening", STOCK_OUT: "Stock out",
};
const TYPE_STYLE: Record<string, string> = {
  RECEIPT: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  SALE: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  SALE_RETURN: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  TRANSFER: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  TRANSFER_SHORTAGE: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  ADJUSTMENT: "bg-[#efe9fb] text-[#6d4fd8] dark:bg-[#3a2a66] dark:text-[#c7b4ff]",
  OPENING: "bg-[#eceff3] text-[#5b6b7c] dark:bg-[#25394a] dark:text-[#b7c6d3]",
  STOCK_OUT: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: number; created_at: string; typ: string; reference: string | null; reason: string | null; item_id: string; location_id: string; place_name: string;
  in_qty: number | null; out_qty: number | null; balance: number; user_name: string | null; code: string; item_name: string; unit: string;
};
type PageData = {
  total: number; rows: Row[]; categories: { id: string; name: string }[]; places: { id: string; name: string }[];
  kpi: { total: number; in: number; out: number; transfer: number; adjust: number; return: number };
};
const EMPTY: PageData = { total: 0, rows: [], categories: [], places: [], kpi: { total: 0, in: 0, out: 0, transfer: 0, adjust: 0, return: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const TypePill = ({ type }: { type: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[type] ?? TYPE_STYLE.OPENING}`}>{TYPE_LABEL[type] ?? type}</span>;

// The stock ledger: every movement of every product in the places the person works in, newest first.
// The ledger is append-only: nothing on this page can be changed. The balance is the quantity in that place right after the line.
export default async function StockLedgerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("stock.view");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const category = z.uuid().safeParse(first(sp.category)).data ?? "";
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const type = (TYPES as readonly string[]).includes(first(sp.type) ?? "") ? first(sp.type)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 15;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_ledger_page", {
    p_q: q || null, p_category: category || null, p_location: place || null, p_type: type === "all" ? null : type,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selItem = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.item_id ?? null);
  const atParam = z.uuid().safeParse(first(sp.at)).data;
  const selRow = selItem ? (rows.find((r) => r.item_id === selItem && (!atParam || r.location_id === atParam)) ?? rows.find((r) => r.item_id === selItem)) : undefined;
  // The product may not be on this page of the list (opened from a link): then the address says which place.
  const panelTarget = selRow ? { itemId: selRow.item_id, locationId: selRow.location_id } : selItem && atParam ? { itemId: selItem, locationId: atParam } : null;

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, category: category || undefined, place: place || undefined, type: type !== "all" ? type : undefined, from: from || undefined, to: to || undefined,
      size: size !== 15 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, at: first(sp.at), tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/stock/movements?${s}` : "/stock/movements";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, category, place, type: type !== "all" ? type : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || category || place || from || to || type !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Inventory</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Stock Ledger</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Stock Ledger</h1>
          <p className="mt-1 text-sm text-muted">Complete history of stock movements for all products in the warehouses and shops you work in. Nothing here can be changed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/stock/movements/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
          <Link href="/reports" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
            <FileBarChart size={18} aria-hidden /> Stock Ledger Report
          </Link>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Layers} tint="blue" label="Total Transactions" value={n(kpi.total)} href={keep({ type: undefined, page: undefined, sel: undefined })} sub={<span className="text-muted">All lines</span>} />
        <Kpi icon={PackagePlus} tint="green" label="Stock In (Qty)" value={n(kpi.in)} href={keep({ type: "RECEIPT", page: undefined, sel: undefined })} sub={<span className="text-muted">All additions</span>} />
        <Kpi icon={PackageMinus} tint="red" label="Stock Out (Qty)" value={n(kpi.out)} href={keep({ type: "SALE", page: undefined, sel: undefined })} sub={<span className="text-muted">All removals</span>} />
        <Kpi icon={ArrowLeftRight} tint="blue" label="Transfer (Qty)" value={n(kpi.transfer)} href={keep({ type: "TRANSFER", page: undefined, sel: undefined })} sub={<span className="text-muted">Sent between places</span>} />
        <Kpi icon={Shuffle} tint="orange" label="Adjustment (Qty)" value={n(kpi.adjust)} href={keep({ type: "ADJUSTMENT", page: undefined, sel: undefined })} sub={<span className="text-muted">Counts and corrections</span>} />
        <Kpi icon={Undo2} tint="violet" label="Return (Qty)" value={n(kpi.return)} href={keep({ type: "SALE_RETURN", page: undefined, sel: undefined })} sub={<span className="text-muted">Voided bills back to stock</span>} />
      </section>

      <div className={`grid gap-5 ${panelTarget ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
            <label className="relative block md:col-span-3 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search SKU, item name, reference no" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Item Category" name="category" value={category}>
              <option value="">All Categories</option>
              {result.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Warehouse" name="place" value={place}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Transaction Type" name="type" value={type}>
              <option value="all">All Types</option>
              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </FilterSelect>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
              <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
              <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <Link href="/stock/movements" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Repeat} title="No stock movements found" text={filtersOn ? "Try a different word, or press Clear." : "Every receipt, sale, transfer and count writes a line here. Nothing has moved yet."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>Date &amp; Time</th><th>Type</th><th>Reference No.</th><th>Item (SKU)</th><th>Item Name</th><th>Warehouse</th><th className="text-right">In Qty</th><th className="text-right">Out Qty</th><th className="text-right">Balance</th><th>User</th><th>Remarks</th><th className="print:hidden">Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = panelTarget?.itemId === r.item_id && panelTarget?.locationId === r.location_id;
                    const viewHref = keep({ sel: r.item_id, at: r.location_id, tab: undefined });
                    return (
                      <tr key={`${r.id}-${r.location_id}`} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap">{day(r.created_at)}<span className="block text-xs text-muted">{time(r.created_at)}</span></td>
                        <td><TypePill type={r.typ} /></td>
                        <td className="whitespace-nowrap text-[13px]">{r.reference ?? ""}</td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.code}</Link></td>
                        <td className="min-w-32">{r.item_name}</td>
                        <td className="min-w-24">{r.place_name}</td>
                        <td className="text-right font-mono">{r.in_qty === null ? "-" : n(r.in_qty)}</td>
                        <td className={`text-right font-mono ${r.out_qty !== null && r.typ === "ADJUSTMENT" ? "text-[var(--danger)]" : ""}`}>{r.out_qty === null ? "-" : n(r.out_qty)}</td>
                        <td className="text-right font-mono">{n(r.balance)}</td>
                        <td className="whitespace-nowrap">{r.user_name ?? ""}</td>
                        <td className="min-w-28 text-[13px]">{r.reason ?? ""}</td>
                        <td className="print:hidden">
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.code}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            <LedgerRowMenu viewHref={viewHref} itemId={r.item_id} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} transactions</span>
            <nav aria-label="Pagination" className="flex items-center gap-1.5">
              {page > 1 ? <PageLink href={keep({ page: page - 1, sel: undefined, at: undefined })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
              {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : (
                <PageLink key={p} href={keep({ page: p, sel: undefined, at: undefined })} active={p === page} label={`Page ${p}`}>{p}</PageLink>
              ))}
              {page < lastPage ? <PageLink href={keep({ page: page + 1, sel: undefined, at: undefined })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
            </nav>
            <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined, sel: undefined, at: undefined })} />
          </div>
        </section>

        {panelTarget && <Panel itemId={panelTarget.itemId} locationId={panelTarget.locationId} tab={tab} keep={keep} />}
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
        <span className="block text-2xl font-bold leading-9 tracking-tight">{value}</span>
        <span className="block text-xs leading-tight">{sub}</span>
      </span>
    </Link>
  );
}

type Move = { id: number; quantity: number; movement_type: string; reference: string | null; reason: string | null; created_at: string; from_location_id: string | null; to_location_id: string | null };

// The balance of one product in one place at the end of each of the last 30 days, as a line.
function TrendChart({ points }: { points: { label: string; value: number }[] }) {
  const w = 300; const h = 110; const padL = 28; const padB = 16;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => padL + (i / Math.max(points.length - 1, 1)) * (w - padL - 4);
  const y = (v: number) => h - padB - (v / max) * (h - padB - 6);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h - padB} L${x(0).toFixed(1)},${h - padB} Z`;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Balance over the last 30 days, from ${n(points[0].value)} to ${n(points[points.length - 1].value)}`} className="w-full">
        {ticks.map((t) => (
          <g key={t}><line x1={padL} x2={w - 4} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="0.5" /><text x={padL - 3} y={y(t) + 3} textAnchor="end" fontSize="7" fill="var(--muted)">{n(Math.round(t))}</text></g>
        ))}
        <path d={area} fill="var(--brand)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="1.5" strokeLinejoin="round" />
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
          <text key={i} x={x(i)} y={h - 4} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="7" fill="var(--muted)">{points[i].label}</text>
        ))}
      </svg>
      <figcaption className="sr-only">Balance at the end of each day for the last 30 days.</figcaption>
    </figure>
  );
}

// Side panel: one product in one place with its trend, its other places and its last lines. Row rules apply.
async function Panel({ itemId, locationId, tab, keep }: { itemId: string; locationId: string; tab: string; keep: (extra: Record<string, string | number | undefined>) => string }) {
  const closeHref = keep({ sel: "none", at: undefined, tab: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";
  const supabase = await createClient();

  const [{ data: item }, { data: balances }, { data: moves }, { data: level }] = await Promise.all([
    supabase.from("items").select("internal_item_code, item_name, unit, is_active, categories(name)").eq("id", itemId).maybeSingle(),
    supabase.from("stock_balances").select("quantity, locations(id, name)").eq("item_id", itemId),
    supabase.from("stock_movements").select("id, quantity, movement_type, reference, reason, created_at, from_location_id, to_location_id")
      .eq("item_id", itemId).or(`from_location_id.eq.${locationId},to_location_id.eq.${locationId}`).order("id", { ascending: false }).limit(300),
    supabase.from("reorder_levels").select("min_qty, max_qty").eq("item_id", itemId).eq("location_id", locationId).maybeSingle(),
  ]);
  if (!item) return null;

  const places = ((balances ?? []) as unknown as { quantity: number; locations: { id: string; name: string } }[])
    .map((b) => ({ id: b.locations.id, name: b.locations.name, qty: Number(b.quantity) })).filter((b) => b.qty > 0 || b.id === locationId).sort((a, b) => b.qty - a.qty);
  const here = places.find((p) => p.id === locationId);
  const current = here?.qty ?? 0;
  const placeName = here?.name ?? "";
  const placesTotal = places.reduce((a, b) => a + b.qty, 0);

  const deltas = ((moves ?? []) as Move[]).map((m) => ({
    ...m,
    delta: (m.to_location_id === locationId ? Number(m.quantity) : 0) - (m.from_location_id === locationId ? Number(m.quantity) : 0),
  }));
  const history = deltas.map((m, i) => ({ ...m, after: current - deltas.slice(0, i).reduce((a, d) => a + d.delta, 0) }));

  // End-of-day balance for the last 30 days, worked backwards from today's quantity.
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const net = new Map<string, number>();
  for (const m of deltas) net.set(dayKey(m.created_at), (net.get(dayKey(m.created_at)) ?? 0) + m.delta);
  const todayMs = Date.now();
  const points: { label: string; value: number }[] = [];
  let bal = current;
  for (let d = 0; d <= 29; d++) {
    const date = new Date(todayMs - d * 86400000);
    const key = date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    points.unshift({ label: date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }), value: bal });
    bal -= net.get(key) ?? 0;
  }

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const table = (list: typeof history) => (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-left text-xs">
        <thead><tr className="text-muted"><th className="py-1 pr-1">Date</th><th className="py-1 pr-1">Type</th><th className="py-1 pr-1">Ref.</th><th className="py-1 pr-1 text-right">Qty</th><th className="py-1 text-right">Balance</th></tr></thead>
        <tbody>
          {list.map((m) => (
            <tr key={m.id} className="border-t border-line align-top">
              <td className="py-1 pr-1">{shortDay(m.created_at)}</td>
              <td className="py-1 pr-1">{TYPE_LABEL[m.movement_type] ?? m.movement_type}</td>
              <td className="py-1 pr-1">{m.reference ?? ""}</td>
              <td className={`py-1 pr-1 text-right font-mono ${m.delta < 0 ? "text-[var(--danger)]" : "text-green-700 dark:text-green-400"}`}>{m.delta > 0 ? "+" : ""}{n(m.delta)}</td>
              <td className="py-1 text-right font-mono">{n(m.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const cat = (item.categories as unknown as { name: string } | null)?.name ?? "";

  return (
    <aside aria-label="Product ledger" className={`${cardClass} ${shell} print:hidden`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{item.internal_item_code}</h2>
          <p className="truncate text-sm text-muted">{item.item_name}</p>
          <p className="truncate text-xs text-muted">{[cat, placeName].filter(Boolean).join("  ·  ")}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${item.is_active ? STATUS_ACTIVE : "bg-[#eceff3] text-[#5b6b7c]"}`}>{item.is_active ? "Active" : "Archived"}</span>
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>

      <div role="tablist" aria-label="Ledger sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: itemId, at: locationId, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{label}</Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            <dl>
              {field("SKU Code", item.internal_item_code)}
              {field("Item Name", item.item_name)}
              {field("Category", cat)}
              {field("Warehouse", placeName)}
              {field("Unit", item.unit)}
              {field("Min Stock", level?.min_qty == null ? "" : n(Number(level.min_qty)))}
              {field("Max Stock", level?.max_qty == null ? "" : n(Number(level.max_qty)))}
              {field("Current Stock", n(current))}
            </dl>
            <h3 className="mb-1 mt-4 text-sm font-bold">Stock Balance Trend (Last 30 Days)</h3>
            <TrendChart points={points} />
            <div className="mb-1 mt-3 flex items-center justify-between"><h3 className="text-sm font-bold">Recent Transactions (This Item)</h3><Link href={keep({ sel: itemId, at: locationId, tab: "ledger" })} className="text-xs font-semibold">View All</Link></div>
            {history.length === 0 ? <p className="text-xs text-muted">No transaction yet.</p> : table(history.slice(0, 5))}
          </>
        )}
        {tab === "ledger" && (history.length === 0 ? <p className="py-6 text-center text-sm text-muted">No transaction yet in {placeName}.</p> : (
          <>{table(history.slice(0, 40))}{history.length > 40 && <p className="mt-2 text-xs text-muted">The latest 40 lines are shown. Use the search above for older ones.</p>}</>
        ))}
        {tab === "places" && (
          <ul className="space-y-1.5 text-xs">
            {places.map((p) => (
              <li key={p.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem_2.5rem] items-center gap-2">
                <span className="truncate">{p.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-[var(--line-strong)]"><span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${placesTotal > 0 ? (p.qty / placesTotal) * 100 : 0}%` }} /></span>
                <span className="text-right font-mono">{n(p.qty)}</span>
                <span className="text-right text-muted">{placesTotal > 0 ? `${Math.round((p.qty / placesTotal) * 100)}%` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/items/${itemId}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><Package size={16} aria-hidden /> Open Product</Link>
        <Link href="/stock" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--brand)] bg-surface text-sm font-semibold text-[var(--brand-text)] hover:bg-brand-soft">Current Stock</Link>
      </div>
    </aside>
  );
}

const STATUS_ACTIVE = "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]";
