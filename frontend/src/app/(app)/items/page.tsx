import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, cache } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, ChevronLeft, ChevronRight, Copy, FileText, Package, PackageX, Printer, SquarePen,
  TriangleAlert, X, Archive, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { can, requirePermission } from "@/lib/auth";
import { isValidEan13 } from "@/lib/barcode/ean13";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { BUCKET } from "@/lib/validation/files";
import { sanitizeSearch } from "@/lib/validation/item";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";
import { AddMenu, ItemFilters, RowsPerPage } from "./item-controls";
import { BulkForm } from "./bulk-bar";
import { ItemsEmpty, ItemsTable, KpiSkeleton, TableSkeleton, qtyText, type Row } from "./items-table";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_OPTIONS = [
  ["all", "All"], ["in", "In Stock"], ["low", "Low Stock"], ["out", "Out of Stock"], ["inactive", "Inactive"],
] as const;
const SORTS = ["code", "name", "category", "qty", "price", "status"];
const TABS = [["details", "Details"], ["stock", "Stock"], ["documents", "Documents"], ["history", "History"]] as const;

type PageData = { total: number; rows: Row[]; kpi: { total: number; active: number; inactive: number; low: number; out: number } };
const EMPTY_PAGE: PageData = { total: 0, rows: [], kpi: { total: 0, active: 0, inactive: 0, low: 0, out: 0 } };

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const day = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

// Everything from the URL is untrusted: parse it into safe values.
type P = {
  q: string; status: string; source: string; categoryId: string; size: number; page: number; tab: string; sort: string; dir: "asc" | "desc";
  sel: string | undefined;
};
function parseParams(sp: SearchParams): P {
  return {
    q: sanitizeSearch(first(sp.q)),
    status: STATUS_OPTIONS.some(([v]) => v === first(sp.status)) ? first(sp.status)! : "all",
    source: ["LOCAL", "IMPORT"].includes(first(sp.source) ?? "") ? first(sp.source)! : "",
    categoryId: z.uuid().safeParse(first(sp.category)).data ?? "",
    size: SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10,
    page: Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000),
    tab: TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "details",
    sort: SORTS.includes(first(sp.sort) ?? "") ? first(sp.sort)! : "code",
    dir: first(sp.dir) === "desc" ? "desc" : "asc",
    sel: first(sp.sel),
  };
}

// One database call per request: the header numbers, the table and the side panel all read this same result.
const getItemsPage = cache(async (q: string, categoryId: string, source: string, status: string, size: number, page: number, sort: string, dir: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("items_page", {
    p_q: q || null, p_category: categoryId || null, p_source: source || null, p_status: status === "all" ? null : status,
    p_limit: size, p_offset: (page - 1) * size,
    // Only sent when a column is chosen, so the plain list keeps working on a database without the sort migration (58).
    ...(sort !== "code" || dir !== "asc" ? { p_sort: sort, p_dir: dir } : {}),
  });
  return { result: (data ?? EMPTY_PAGE) as PageData, error };
});
const loadPage = (p: P) => getItemsPage(p.q, p.categoryId, p.source, p.status, p.size, p.page, p.sort, p.dir);

// The product open in the side panel: the one in the address, else the first row. sel=none closes it.
const selectedId = (p: P, rows: Row[]) => (p.sel === "none" ? null : (z.uuid().safeParse(p.sel).data ?? rows[0]?.id ?? null));

// Builds addresses that keep the current filters and change only what is asked for.
function makeKeep(p: P) {
  return (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: p.q || undefined, status: p.status !== "all" ? p.status : undefined, source: p.source || undefined, category: p.categoryId || undefined,
      size: p.size !== 10 ? p.size : undefined, page: p.page > 1 ? p.page : undefined, sel: p.sel, tab: p.tab !== "details" ? p.tab : undefined,
      sort: p.sort !== "code" ? p.sort : undefined, dir: p.dir !== "asc" ? p.dir : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/items?${s}` : "/items";
  };
}

// The title is static, so it shows at once; the buttons and the list stream in behind it.
export default function ItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Products / SKU</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Product / SKU Master</h1>
          <p className="mt-1 text-sm text-muted">Manage all your products, SKUs and specifications. Add, edit, view stock, pricing and related details.</p>
        </div>
        <Suspense fallback={null}>
          <HeaderActions searchParams={searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<><KpiSkeleton /><TableSkeleton /></>}>
        <ItemsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function HeaderActions({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("items.view");
  const p = parseParams(await searchParams);
  const filterOnly = new URLSearchParams(
    Object.entries({ q: p.q, status: p.status !== "all" ? p.status : "", source: p.source, category: p.categoryId }).filter(([, v]) => v) as [string, string][],
  ).toString();
  return (
    <div className="flex flex-wrap items-center gap-3">
      {can(user, "items.import") && (
        <Link href="/items/import" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
          <ArrowUpFromLine size={18} aria-hidden /> Import Products
        </Link>
      )}
      <a href={`/items/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
        <ArrowDownToLine size={18} aria-hidden /> Export CSV
      </a>
      <AddMenu canCreate={can(user, "items.create")} canImport={can(user, "items.import")} canCategories={can(user, "categories.manage")} />
    </div>
  );
}

async function ItemsContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("items.view");
  const p = parseParams(await searchParams);
  const supabase = await createClient();

  // Scanner support: a USB scanner types the digits and presses Enter. If the text is exactly
  // one item's barcode, go straight to that item.
  if (p.q) {
    const { data: exact } = await supabase.from("item_barcodes").select("item_id").eq("barcode", p.q).maybeSingle();
    if (exact) redirect(`/items/${exact.item_id}`);
  }

  const { data: categories } = await supabase.from("categories").select("id, name").order("name");
  const cats = categories ?? [];
  const keep = makeKeep(p);
  const keepStatus = (s: string) => keep({ status: s === "all" ? undefined : s, page: undefined, sel: undefined });
  const canEdit = can(user, "items.edit");
  const canCreate = can(user, "items.create");
  const canArchive = can(user, "items.archive");
  const canCost = can(user, "receipts.cost");

  return (
    <>
      <Suspense fallback={<KpiSkeleton />}>
        <Kpis p={p} hrefFor={keepStatus} />
      </Suspense>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className={`${cardClass} min-w-0 !p-4`}>
          <ItemFilters
            q={p.q} category={p.categoryId} source={p.source} status={p.status}
            categories={[{ value: "", label: "All Categories" }, ...cats.map((c) => ({ value: c.id, label: c.name }))]}
            sources={[{ value: "", label: "All Sources" }, { value: "LOCAL", label: "LOCAL" }, { value: "IMPORT", label: "IMPORT" }]}
            statuses={STATUS_OPTIONS.map(([value, label]) => ({ value, label }))}
          />
          <Suspense fallback={<TableSkeleton />}>
            <TableSection p={p} keep={keep} categories={cats} canEdit={canEdit} canCreate={canCreate} canArchive={canArchive} canCost={canCost} />
          </Suspense>
        </section>

        <Suspense fallback={null}>
          <SelectedPanel p={p} keep={keep} canEdit={canEdit} canCreate={canCreate} />
        </Suspense>
      </div>
    </>
  );
}

async function Kpis({ p, hrefFor }: { p: P; hrefFor: (s: string) => string }) {
  await connection(); // the "30 days" date below must not be fixed at build time
  const supabase = await createClient();
  const [{ result }, { count: newThisMonth }] = await Promise.all([
    loadPage(p),
    supabase.from("items").select("id", { count: "exact", head: true }).gte("created_at", daysAgoIso(30)),
  ]);
  const kpi = result.kpi;
  const pct = (n: number) => (kpi.total > 0 ? `${((n / kpi.total) * 100).toFixed(1)}%` : "0.0%");
  return (
    <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      <Kpi icon={Package} tint="teal" label="Total Products" value={kpi.total} href="/items" sub={<span className="font-medium text-green-700 dark:text-green-400">+{newThisMonth ?? 0} in 30 days</span>} />
      <Kpi icon={Boxes} tint="green" label="Active Products" value={kpi.active} href={hrefFor("all")} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.active)}</span>} />
      <Kpi icon={TriangleAlert} tint="orange" label="Low Stock Items" value={kpi.low} href={hrefFor("low")} sub={<span className="font-medium text-amber-700 dark:text-amber-400">{pct(kpi.low)}</span>} />
      <Kpi icon={PackageX} tint="red" label="Out of Stock" value={kpi.out} href={hrefFor("out")} sub={<span className="font-medium text-red-600">{pct(kpi.out)}</span>} />
      <Kpi icon={Archive} tint="gray" label="Inactive Products" value={kpi.inactive} href={hrefFor("inactive")} sub={<span className="text-muted">{pct(kpi.inactive)}</span>} />
    </section>
  );
}

async function TableSection({ p, keep, categories, canEdit, canCreate, canArchive, canCost }: {
  p: P; keep: ReturnType<typeof makeKeep>; categories: { id: string; name: string }[];
  canEdit: boolean; canCreate: boolean; canArchive: boolean; canCost: boolean;
}) {
  const { result, error } = await loadPage(p);
  const rows = result.rows;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / p.size));
  const filtersOn = !!(p.q || p.source || p.categoryId || p.status !== "all");

  // Pictures: the bucket is private, so each thumbnail uses a link that expires after one hour.
  const thumbPaths = rows.map((r) => r.image).filter((x): x is string => !!x);
  const thumbs = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const supabase = await createClient();
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(thumbPaths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
  }

  // Page numbers: 1 2 3 4 5 ... last
  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, p.page + 2));
  for (let n = Math.max(1, windowEnd - 4); n <= windowEnd; n++) pages.push(n);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const sortHref = (col: string) => keep({ sort: col === "code" ? undefined : col, dir: p.sort === col && p.dir === "asc" ? "desc" : undefined, page: undefined, sel: undefined });
  const showCost = canCost && rows.some((r) => "cost" in r);

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      {rows.length === 0 ? (
        <ItemsEmpty hasProducts={result.kpi.total > 0} q={p.q} filtersOn={filtersOn} canCreate={canCreate} />
      ) : (
        <BulkForm categories={categories} canArchive={canArchive} canEdit={canEdit}>
          <ItemsTable
            rows={rows} thumbs={thumbs} selId={selectedId(p, rows)} sort={p.sort} dir={p.dir} sortHref={sortHref}
            rowHref={(id) => keep({ sel: id })} canEdit={canEdit} canCreate={canCreate} showCost={showCost}
          />
        </BulkForm>
      )}

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">Showing {total === 0 ? 0 : (p.page - 1) * p.size + 1} to {Math.min(p.page * p.size, total)} of {total.toLocaleString("en-IN")} products</span>
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          {p.page > 1 ? <PageLink href={keep({ page: p.page - 1, sel: undefined })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
          {pages.map((n, i) => n === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : (
            <PageLink key={n} href={keep({ page: n, sel: undefined })} active={n === p.page} label={`Page ${n}`}>{n}</PageLink>
          ))}
          {p.page < lastPage ? <PageLink href={keep({ page: p.page + 1, sel: undefined })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
        </nav>
        <RowsPerPage size={p.size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined, sel: undefined })} />
      </div>
    </>
  );
}

async function SelectedPanel({ p, keep, canEdit, canCreate }: { p: P; keep: ReturnType<typeof makeKeep>; canEdit: boolean; canCreate: boolean }) {
  const { result } = await loadPage(p);
  const selId = selectedId(p, result.rows);
  if (!selId) return null;
  return <Panel itemId={selId} tab={p.tab} tabHref={(t) => keep({ tab: t === "details" ? undefined : t, sel: selId })} closeHref={keep({ sel: "none", tab: undefined })} canEdit={canEdit} canCreate={canCreate} />;
}

function PageLink({ href, label, active, disabled, children }: { href?: string; label: string; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const cls = `inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-medium ${
    active ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-line bg-surface hover:bg-surface-muted"
  } ${disabled ? "pointer-events-none opacity-40" : ""}`;
  if (disabled || !href) return <span aria-label={label} aria-disabled="true" className={cls}>{children}</span>;
  return <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={cls}>{children}</Link>;
}

const TINTS = {
  teal: "bg-[#e0f5f0] text-[#0b7d70]", green: "bg-[#e3f6ec] text-[#16824f]", orange: "bg-[#fdf0e1] text-[#c2670a]",
  red: "bg-[#fde8e8] text-[#c8302f]", gray: "bg-[#eceff3] text-[#5b6b7c]",
} as const;

function Kpi({ icon: Icon, tint, label, value, sub, href }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: number; sub: React.ReactNode; href: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-3xl font-bold leading-9 tracking-tight">{value.toLocaleString("en-IN")}</span>
        <span className="block text-xs">{sub}</span>
      </span>
    </Link>
  );
}

// The side panel with the details of the chosen product. Loaded by the id in the address; row rules still apply.
async function Panel({ itemId, tab, tabHref, closeHref, canEdit, canCreate }: { itemId: string; tab: string; tabHref: (t: string) => string; closeHref: string; canEdit: boolean; canCreate: boolean }) {
  const supabase = await createClient();
  const [{ data: item }, { data: places }, { data: moves }] = await Promise.all([
    supabase.from("items").select("id, internal_item_code, import_item_code, item_name, selling_item_name, remarks, unit, purchase_source, selling_price, is_active, image_paths, datasheet_path, created_at, updated_at, categories(name), item_barcodes(barcode, is_generated)").eq("id", itemId).maybeSingle(),
    supabase.from("stock_overview").select("location_id, quantity, min_qty, is_low").eq("item_id", itemId),
    supabase.from("stock_movements").select("id, quantity, movement_type, created_at, from_location_id, to_location_id, from_loc:locations!stock_movements_from_location_id_fkey(code), to_loc:locations!stock_movements_to_location_id_fkey(code)")
      .eq("item_id", itemId).order("id", { ascending: false }).limit(8),
  ]);
  if (!item) return null;

  const paths: string[] = [...(item.image_paths ?? []), ...(item.datasheet_path ? [item.datasheet_path as string] : [])];
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const images = (item.image_paths ?? []).map((p: string) => urls.get(p)).filter((u: string | undefined): u is string => !!u);
  const category = (item.categories as unknown as { name: string } | null)?.name ?? "-";
  const barcodes = (item.item_barcodes ?? []) as { barcode: string; is_generated: boolean }[];
  const drawable = barcodes.find((b) => b.is_generated && isValidEan13(b.barcode)) ?? barcodes.find((b) => isValidEan13(b.barcode));
  // stock_overview is a view, so the place names are looked up separately.
  const placeIds = (places ?? []).map((p) => p.location_id);
  const { data: placeNames } = placeIds.length > 0 ? await supabase.from("locations").select("id, code, name").in("id", placeIds) : { data: [] };
  const nameById = new Map((placeNames ?? []).map((l) => [l.id, { code: l.code, name: l.name }]));
  const stockRows = (places ?? []).map((p) => ({ ...p, locations: nameById.get(p.location_id) ?? null }));
  const totalQty = stockRows.reduce((a, s) => a + Number(s.quantity), 0);
  const totalMin = stockRows.reduce((a, s) => a + Number(s.min_qty ?? 0), 0);

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <aside aria-label="Product details" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{item.internal_item_code}</h2>
          <Badge tone={item.is_active ? "green" : "gray"}>{item.is_active ? "Active" : "Inactive"}</Badge>
        </div>
        <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
          {images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- private signed link
            <img src={images[0]} alt={item.item_name} className="h-full w-full object-contain" />
          ) : (
            <Package size={56} aria-hidden className="text-muted" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          {images.slice(0, 3).map((u: string) => (
            // eslint-disable-next-line @next/next/no-img-element -- private signed link
            <img key={u} src={u} alt="" className="h-[3.5rem] w-14 rounded-lg border border-line bg-white object-contain" />
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm font-bold">{item.item_name}</p>
      {item.remarks && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{item.remarks}</p>}

      <div role="tablist" aria-label="Product sections" className="mt-3 flex gap-1 border-b border-line text-sm">
        {TABS.map(([v, l]) => (
          <Link key={v} href={tabHref(v)} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2.5 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{l}</Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "details" && (
          <dl>
            {field("SKU Code", item.internal_item_code)}
            {field("Product Name", item.item_name)}
            {field("Selling Name", item.selling_item_name)}
            {field("Category", category)}
            {field("Unit", item.unit)}
            {field("Source", item.purchase_source)}
            {field("Import Code", item.import_item_code)}
            {field("Selling Price", item.selling_price === null ? "" : `₹${Number(item.selling_price).toLocaleString("en-IN")}`)}
            {field("Barcode", drawable ? (
              <span className="block">
                <span className="block h-14 w-44 overflow-hidden rounded bg-white"><Ean13Barcode code={drawable.barcode} barHeight={34} fill /></span>
              </span>
            ) : barcodes[0]?.barcode)}
            {field("Reorder Level", `${qtyText(totalMin)} ${item.unit}`)}
            {field("Current Stock", `${qtyText(totalQty)} ${item.unit}`)}
            {field("Status", <Badge tone={item.is_active ? "green" : "gray"}>{item.is_active ? "Active" : "Inactive"}</Badge>)}
            {field("Created On", day(item.created_at))}
            {field("Last Updated", day(item.updated_at))}
          </dl>
        )}
        {tab === "stock" && (
          stockRows.length === 0 ? <p className="py-6 text-center text-sm text-muted">No stock record yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {stockRows.map((s) => (
                <li key={s.location_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{s.locations?.name}</span><span className="block text-xs text-muted">{s.locations?.code}{s.min_qty !== null ? ` · reorder at ${qtyText(Number(s.min_qty))}` : ""}</span></span>
                  <span className={`shrink-0 font-mono font-semibold ${s.is_low ? "text-amber-600" : ""}`}>{qtyText(Number(s.quantity))} {item.unit}</span>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "documents" && (
          <ul className="space-y-2 text-sm">
            {item.datasheet_path && urls.get(item.datasheet_path as string) ? (
              <li><a href={urls.get(item.datasheet_path as string)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 font-medium"><FileText size={18} aria-hidden /> Datasheet (PDF)</a></li>
            ) : <li className="py-4 text-center text-muted">No document uploaded.</li>}
            <li className="text-xs text-muted">{images.length} picture{images.length === 1 ? "" : "s"} uploaded.</li>
          </ul>
        )}
        {tab === "history" && (
          (moves ?? []).length === 0 ? <p className="py-6 text-center text-sm text-muted">No stock movement yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {((moves ?? []) as unknown as { id: number; quantity: number; movement_type: string; created_at: string; from_loc: { code: string } | null; to_loc: { code: string } | null }[]).map((m) => (
                <li key={m.id} className="py-2">
                  <span className="flex justify-between gap-2"><span className="font-medium">{MOVEMENT_LABELS[m.movement_type] ?? m.movement_type}</span><span className="font-mono">{qtyText(Number(m.quantity))} {item.unit}</span></span>
                  <span className="block text-xs text-muted">{m.from_loc?.code ?? "·"} → {m.to_loc?.code ?? "·"} · {day(m.created_at)}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {canCreate && (
        <Link href={`/items/new?from=${item.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-muted">
          <Copy size={16} aria-hidden /> Duplicate this product
        </Link>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link href={`/items/${item.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface-muted px-3 text-sm font-semibold hover:bg-brand-soft">
          <SquarePen size={16} aria-hidden /> {canEdit ? "Edit Product" : "Open"}
        </Link>
        <Link href={`/items/${item.id}/labels`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-brand-strong">
          <Printer size={16} aria-hidden /> Print Barcode
        </Link>
      </div>
    </aside>
  );
}

export const metadata = { title: "Products / SKU" };
