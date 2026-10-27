import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, ChevronLeft, ChevronRight, IndianRupee, Layers, Package, PackageX, Search, SquarePen, X, Boxes, ClipboardList, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { can, requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { BUCKET } from "@/lib/validation/files";
import { sanitizeSearch } from "@/lib/validation/item";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";
import { RowsPerPage } from "../items/item-controls";
import { LevelForm } from "./level-form";
import { AddItemMenu, StockRowMenu } from "./stock-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["movement", "Stock Movement"], ["places", "Locations"]] as const;
const STATUS_FILTERS = ["IN", "LOW", "OUT", "OVER"] as const;
const STATUS_LABEL: Record<string, string> = { IN: "In Stock", LOW: "Low Stock", OUT: "Out of Stock", OVER: "Over Stocked" };

type Row = {
  item_id: string; code: string; item_name: string; unit: string; image: string | null; category_name: string | null; location_id: string; place_name: string;
  qty: number; min_qty: number | null; max_qty: number | null; rack: string | null; avg_cost: number | null; value: number | null; status: string;
};
type PageData = {
  total: number; rows: Row[]; categories: { id: string; name: string }[]; places: { id: string; name: string }[];
  kpi: { items: number; qty: number; value: number | null; low: number; out: number; over: number };
};
const EMPTY: PageData = { total: 0, rows: [], categories: [], places: [], kpi: { items: 0, qty: 0, value: null, low: 0, out: 0, over: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inr = (v: number, digits = 0) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: digits });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

const STATUS_STYLE: Record<string, string> = {
  IN: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  LOW: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  OUT: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  OVER: "bg-[#efe9fb] text-[#6d4fd8] dark:bg-[#3a2a66] dark:text-[#c7b4ff]",
};
const StatusPill = ({ status }: { status: string }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;

export default async function CurrentStockPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("stock.view");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const category = z.uuid().safeParse(first(sp.category)).data ?? "";
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_stock_page", {
    p_q: q || null, p_category: category || null, p_location: place || null, p_status: status === "all" ? null : status, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  // Pictures: the bucket is private, so each thumbnail uses a link that expires after one hour.
  const thumbPaths = rows.map((r) => r.image).filter((p): p is string => !!p);
  const thumbs = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(thumbPaths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
  }

  // Which line is open in the panel: sel = product and at = place (default the first row). sel=none closes it.
  const selParam = first(sp.sel);
  const selItem = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.item_id ?? null);
  const atParam = z.uuid().safeParse(first(sp.at)).data;
  const selRow = selItem ? (rows.find((r) => r.item_id === selItem && (!atParam || r.location_id === atParam)) ?? rows.find((r) => r.item_id === selItem)) : undefined;
  const selAt = selRow?.location_id ?? atParam ?? null;

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, category: category || undefined, place: place || undefined, status: status !== "all" ? status : undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, at: first(sp.at), tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/stock?${s}` : "/stock";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, category, place, status: status !== "all" ? status : "" }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canCost = can(user, "receipts.cost");
  const filtersOn = !!(q || category || place || status !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Inventory</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Current Stock</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Current Stock</h1>
          <p className="mt-1 text-sm text-muted">Real-time view of available stock across the warehouses and shops you work in.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/stock/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <AddItemMenu canAddItem={can(user, "items.create")} canEntry={can(user, "stock.entry")} canCount={can(user, "stock.adjust")} />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ClipboardList} tint="blue" label="Total Items (SKU)" value={n(kpi.items)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="text-muted">With stock or a level</span>} />
        <Kpi icon={Boxes} tint="blue" label="Total Stock Quantity" value={n(kpi.qty)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="text-muted">All units added up</span>} />
        <Kpi icon={IndianRupee} tint="green" label="Stock Value (INR)" value={kpi.value === null ? "-" : inr(kpi.value)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="text-muted">{canCost ? "Quantity x average cost" : "Needs permission"}</span>} />
        <Kpi icon={AlertTriangle} tint="orange" label="Low Stock Items" value={n(kpi.low)} href={keep({ status: "LOW", page: undefined, sel: undefined })} sub={<span className="text-muted">Below minimum</span>} />
        <Kpi icon={PackageX} tint="red" label="Out of Stock" value={n(kpi.out)} href={keep({ status: "OUT", page: undefined, sel: undefined })} sub={<span className="text-muted">Nothing left</span>} />
        <Kpi icon={Layers} tint="violet" label="Over Stocked" value={n(kpi.over)} href={keep({ status: "OVER", page: undefined, sel: undefined })} sub={<span className="text-muted">Above maximum</span>} />
      </section>

      <div className={`grid gap-5 ${selRow ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(0,1fr))_auto_auto] 2xl:items-end">
            <label className="relative block md:col-span-3 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search SKU, item name, barcode, rack" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Category" name="category" value={category}>
              <option value="">All Categories</option>
              {result.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Warehouse" name="place" value={place}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Stock Status" name="status" value={status}>
              <option value="all">All Status</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </FilterSelect>
            <Link href="/stock" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Boxes} title="No stock found" text={filtersOn ? "Try a different word, or press Clear." : "Stock appears here after the first goods receipt or count. Add items first, then receive or count stock."} actionHref={can(user, "stock.adjust") ? "/stock/count" : undefined} actionLabel="Count stock" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>Image</th><th>SKU Code</th><th>Item Name</th><th>Category</th><th>Warehouse</th><th>Rack</th><th className="text-right">Current Stock</th><th className="text-right">Min Stock</th><th className="text-right">Max Stock</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = selRow?.item_id === r.item_id && selRow?.location_id === r.location_id;
                    const viewHref = keep({ sel: r.item_id, at: r.location_id, tab: undefined });
                    const thumb = r.image ? thumbs.get(r.image) : undefined;
                    return (
                      <tr key={`${r.item_id}-${r.location_id}`} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td>
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="h-10 w-10 rounded-lg border border-line object-cover" />
                          ) : <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-muted text-muted"><Package size={18} /></span>}
                        </td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.code}</Link></td>
                        <td className="min-w-32 font-medium">{r.item_name}</td>
                        <td className="min-w-24">{r.category_name ?? ""}</td>
                        <td className="min-w-24">{r.place_name}</td>
                        <td className="whitespace-nowrap font-mono text-xs">{r.rack ?? ""}</td>
                        <td className={`text-right font-mono ${r.status === "OUT" ? "font-bold text-[var(--danger)]" : ""}`}>{n(r.qty)}</td>
                        <td className="text-right font-mono">{r.min_qty === null ? "" : n(r.min_qty)}</td>
                        <td className="text-right font-mono">{r.max_qty === null ? "" : n(r.max_qty)}</td>
                        <td><StatusPill status={r.status} /></td>
                        <td>
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.code}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Search size={18} aria-hidden /></Link>
                            {can(user, "items.edit") && <Link href={`/items/${r.item_id}`} aria-label={`Edit ${r.code}`} title="Edit product" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <StockRowMenu itemId={r.item_id} viewHref={viewHref} canEdit={can(user, "items.edit")} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} stock lines</span>
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

        {selRow && selAt && <Panel row={selRow} tab={tab} keep={keep} canCost={canCost} canLevels={can(user, "stock.min_levels")} />}
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

// Side panel: one product in one place, with its movements and its stock in every place. Row rules apply.
async function Panel({ row, tab, keep, canCost, canLevels }: { row: Row; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; canCost: boolean; canLevels: boolean }) {
  const closeHref = keep({ sel: "none", at: undefined, tab: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";
  const supabase = await createClient();
  const current = await getCurrentLocation(await requirePermission("stock.view"));

  const [{ data: item }, { data: balances }, { data: moves }] = await Promise.all([
    supabase.from("items").select("image_paths, unit, categories(name)").eq("id", row.item_id).maybeSingle(),
    supabase.from("stock_balances").select("quantity, locations(id, name)").eq("item_id", row.item_id),
    supabase.from("stock_movements").select("id, quantity, movement_type, reference, reason, created_at, from_location_id, to_location_id")
      .eq("item_id", row.item_id).or(`from_location_id.eq.${row.location_id},to_location_id.eq.${row.location_id}`).order("id", { ascending: false }).limit(20),
  ]);

  const paths: string[] = (item?.image_paths as string[] | null) ?? [];
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const images = paths.map((p) => urls.get(p)).filter((u): u is string => !!u);

  const places = ((balances ?? []) as unknown as { quantity: number; locations: { id: string; name: string } }[])
    .map((b) => ({ id: b.locations.id, name: b.locations.name, qty: Number(b.quantity) }))
    .filter((b) => b.qty > 0 || b.id === row.location_id).sort((a, b) => b.qty - a.qty);
  const placesTotal = places.reduce((a, b) => a + b.qty, 0);

  // Running balance of this place after each movement, worked backwards from today's quantity.
  const deltas = ((moves ?? []) as Move[]).map((m) => ({
    ...m,
    delta: (m.to_location_id === row.location_id ? Number(m.quantity) : 0) - (m.from_location_id === row.location_id ? Number(m.quantity) : 0),
  }));
  const history = deltas.map((m, i) => ({ ...m, after: Number(row.qty) - deltas.slice(0, i).reduce((a, d) => a + d.delta, 0) }));

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const moveRows = (list: typeof history) => (
    <div className="overflow-x-auto">
    <table className="w-full whitespace-nowrap text-left text-xs">
      <thead><tr className="text-muted"><th className="py-1 pr-1">Date</th><th className="py-1 pr-1">Type</th><th className="py-1 pr-1">Ref No.</th><th className="py-1 pr-1 text-right">Qty</th><th className="py-1 text-right">Balance</th></tr></thead>
      <tbody>
        {list.map((m) => (
          <tr key={m.id} className="border-t border-line align-top">
            <td className="py-1 pr-1 whitespace-nowrap">{day(m.created_at)}</td>
            <td className="py-1 pr-1">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</td>
            <td className="py-1 pr-1">{m.reference ?? ""}</td>
            <td className={`py-1 pr-1 text-right font-mono ${m.delta < 0 ? "text-[var(--danger)]" : "text-green-700 dark:text-green-400"}`}>{m.delta > 0 ? "+" : ""}{n(m.delta)}</td>
            <td className="py-1 text-right font-mono">{n(m.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );

  return (
    <aside aria-label="Stock details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{row.code}</h2>
          <p className="truncate text-sm text-muted">{row.item_name}</p>
        </div>
        <div className="flex items-center gap-1">
          <StatusPill status={row.status} />
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>

      <div role="tablist" aria-label="Stock sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: row.item_id, at: row.location_id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{label}</Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            {images[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[0]} alt={row.item_name} className="mb-3 h-36 w-full rounded-xl border border-line bg-white object-contain" />
            )}
            <dl>
              {field("SKU Code", row.code)}
              {field("Item Name", row.item_name)}
              {field("Category", row.category_name)}
              {field("Warehouse", row.place_name)}
              {field("Rack", row.rack)}
              {field("Unit", row.unit)}
              {field("Min Stock", row.min_qty === null ? "" : n(row.min_qty))}
              {field("Max Stock", row.max_qty === null ? "" : n(row.max_qty))}
              {field("Current Stock", n(row.qty))}
              {canCost && field("Average Cost", row.avg_cost === null ? "" : inr(row.avg_cost, 2))}
              {canCost && field("Stock Value (INR)", row.value === null ? "" : inr(row.value, 2))}
            </dl>
            {canLevels && (
              <div className="mt-2 rounded-xl border border-line bg-surface-muted p-3">
                <p className="mb-1 text-xs font-semibold text-muted">Min / max level in {current?.name ?? "your place"}</p>
                {current && current.id === row.location_id ? (
                  <LevelForm itemId={row.item_id} min={row.min_qty} max={row.max_qty} />
                ) : <p className="text-xs text-muted">To change the levels of {row.place_name}, switch your working place to it (top of the page).</p>}
              </div>
            )}
            <h3 className="mb-2 mt-4 text-sm font-bold">Stock by Warehouse</h3>
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
            <div className="mb-1 mt-4 flex items-center justify-between"><h3 className="text-sm font-bold">Recent Stock Movement</h3><Link href={keep({ sel: row.item_id, at: row.location_id, tab: "movement" })} className="text-xs font-semibold">View All</Link></div>
            {history.length === 0 ? <p className="text-xs text-muted">No movement yet.</p> : moveRows(history.slice(0, 5))}
          </>
        )}

        {tab === "movement" && (history.length === 0 ? <p className="py-6 text-center text-sm text-muted">No movement yet in {row.place_name}.</p> : moveRows(history))}

        {tab === "places" && (
          <ul className="divide-y divide-line text-sm">
            {places.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2"><span>{p.name}</span><span className="font-mono">{n(p.qty)} {row.unit}</span></li>
            ))}
            <li className="flex items-center justify-between gap-3 py-2 font-semibold"><span>Total</span><span className="font-mono">{n(placesTotal)} {row.unit}</span></li>
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/items/${row.item_id}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">Open Product</Link>
        <Link href="/stock/movements" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--brand)] bg-surface text-sm font-semibold text-[var(--brand-text)] hover:bg-brand-soft">Stock History</Link>
      </div>
      <p className="mt-2 text-xs text-muted">Stock changes only through receipts, bills, transfers, adjustments and counts. This page only shows it.</p>
    </aside>
  );
}

export const metadata = { title: "Current Stock" };
