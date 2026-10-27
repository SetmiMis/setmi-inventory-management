import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownToLine, ArrowUpFromLine, Boxes, ChevronLeft, ChevronRight, ChevronsUpDown, Copy, FileText, Package, PackageX, Printer, Search, SquarePen,
  TriangleAlert, X, Archive, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { EmptyState } from "@/components/empty-state";
import { can, requirePermission } from "@/lib/auth";
import { isValidEan13 } from "@/lib/barcode/ean13";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { BUCKET } from "@/lib/validation/files";
import { sanitizeSearch } from "@/lib/validation/item";
import { MOVEMENT_LABELS } from "@/lib/validation/stock";
import { AddMenu, RowMenu, RowsPerPage } from "./item-controls";
import { BulkForm } from "./bulk-bar";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_OPTIONS = [
  ["all", "All"], ["in", "In Stock"], ["low", "Low Stock"], ["out", "Out of Stock"], ["inactive", "Inactive"],
] as const;
const SORTS = ["code", "name", "category", "qty", "price", "status"];
const TABS = [["details", "Details"], ["stock", "Stock"], ["documents", "Documents"], ["history", "History"]] as const;

type Row = {
  id: string; code: string; name: string; selling_item_name: string; category: string | null; unit: string; source: string;
  active: boolean; price: number | null; image: string | null; qty: number; reorder: number; status: "in" | "low" | "out" | "inactive";
};
type PageData = { total: number; rows: Row[]; kpi: { total: number; active: number; inactive: number; low: number; out: number } };

const STATUS_LABEL: Record<Row["status"], string> = { in: "In Stock", low: "Low Stock", out: "Out of Stock", inactive: "Inactive" };
const STATUS_TONE: Record<Row["status"], "green" | "amber" | "red" | "gray"> = { in: "green", low: "amber", out: "red", inactive: "gray" };
const qtyText = (n: number) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const day = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export default async function ItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("items.view");
  const sp = await searchParams;

  // Everything from the URL is untrusted: parse it into safe values.
  const q = sanitizeSearch(first(sp.q));
  const status = STATUS_OPTIONS.some(([v]) => v === first(sp.status)) ? first(sp.status)! : "all";
  const source = ["LOCAL", "IMPORT"].includes(first(sp.source) ?? "") ? first(sp.source)! : "";
  const categoryId = z.uuid().safeParse(first(sp.category)).data ?? "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "details";
  const sort = SORTS.includes(first(sp.sort) ?? "") ? first(sp.sort)! : "code";
  const dir = first(sp.dir) === "desc" ? "desc" : "asc";

  const supabase = await createClient();

  // Scanner support: a USB scanner types the digits and presses Enter. If the text is exactly
  // one item's barcode, go straight to that item.
  if (q) {
    const { data: exact } = await supabase.from("item_barcodes").select("item_id").eq("barcode", q).maybeSingle();
    if (exact) redirect(`/items/${exact.item_id}`);
  }

  const [{ data, error }, { data: categories }, { count: newThisMonth }] = await Promise.all([
    supabase.rpc("items_page", {
      p_q: q || null, p_category: categoryId || null, p_source: source || null, p_status: status === "all" ? null : status,
      p_limit: size, p_offset: (page - 1) * size,
      // Only sent when a column is chosen, so the plain list keeps working on a database without the sort migration (58).
      ...(sort !== "code" || dir !== "asc" ? { p_sort: sort, p_dir: dir } : {}),
    }),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("items").select("id", { count: "exact", head: true }).gte("created_at", daysAgoIso(30)),
  ]);
  const result = (data ?? { total: 0, rows: [], kpi: { total: 0, active: 0, inactive: 0, low: 0, out: 0 } }) as PageData;
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

  // Which product is open in the side panel: the one in the address, else the first row. sel=none closes it.
  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, status: status !== "all" ? status : undefined, source: source || undefined, category: categoryId || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "details" ? tab : undefined,
      sort: sort !== "code" ? sort : undefined, dir: dir !== "asc" ? dir : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/items?${s}` : "/items";
  };
  const filterOnly = new URLSearchParams(
    Object.entries({ q, status: status !== "all" ? status : "", source, category: categoryId }).filter(([, v]) => v) as [string, string][],
  ).toString();

  // Page numbers: 1 2 3 4 5 ... last
  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canEdit = can(user, "items.edit");
  const canCreate = can(user, "items.create");
  const canArchive = can(user, "items.archive");
  const sortLink = (col: string) => keep({ sort: col === "code" ? undefined : col, dir: sort === col && dir === "asc" ? "desc" : undefined, page: undefined, sel: undefined });
  const sortHead = (col: string, label: string, right?: boolean) => (
    <th key={col} className={right ? "text-right" : undefined} aria-sort={sort === col ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={sortLink(col)} className="inline-flex items-center gap-1 hover:underline">{label}<ChevronsUpDown size={12} aria-hidden className={sort === col ? "text-[var(--brand-text)]" : "opacity-50"} />{sort === col ? (dir === "asc" ? "↑" : "↓") : ""}</Link>
    </th>
  );
  const pct = (n: number) => (kpi.total > 0 ? `${((n / kpi.total) * 100).toFixed(1)}%` : "0.0%");
  const filtersOn = !!(q || source || categoryId || status !== "all");

  return (
    <main className="space-y-5">
      {/* Breadcrumb, title and the three buttons */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Products / SKU</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Product / SKU Master</h1>
          <p className="mt-1 text-sm text-muted">Manage all your products, SKUs and specifications. Add, edit, view stock, pricing and related details.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can(user, "items.import") && (
            <Link href="/items/import" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
              <ArrowUpFromLine size={18} aria-hidden /> Import
            </Link>
          )}
          <a href={`/items/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <AddMenu canCreate={can(user, "items.create")} canImport={can(user, "items.import")} canCategories={can(user, "categories.manage")} />
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      {/* The five numbers */}
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi icon={Package} tint="teal" label="Total Products" value={kpi.total} href="/items" sub={<span className="font-medium text-green-700 dark:text-green-400">+{newThisMonth ?? 0} in 30 days</span>} />
        <Kpi icon={Boxes} tint="green" label="Active Products" value={kpi.active} href={keepStatus("all")} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.active)}</span>} />
        <Kpi icon={TriangleAlert} tint="orange" label="Low Stock Items" value={kpi.low} href={keepStatus("low")} sub={<span className="font-medium text-amber-700 dark:text-amber-400">{pct(kpi.low)}</span>} />
        <Kpi icon={PackageX} tint="red" label="Out of Stock" value={kpi.out} href={keepStatus("out")} sub={<span className="font-medium text-red-600">{pct(kpi.out)}</span>} />
        <Kpi icon={Archive} tint="gray" label="Inactive Products" value={kpi.inactive} href={keepStatus("inactive")} sub={<span className="text-muted">{pct(kpi.inactive)}</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className={`${cardClass} min-w-0 !p-4`}>
          {/* Filters */}
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))_auto_auto] md:items-end">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search SKU, name, barcode" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Category" name="category" value={categoryId}>
              <option value="">All Categories</option>
              {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Source" name="source" value={source}>
              <option value="">All Sources</option><option value="LOCAL">LOCAL</option><option value="IMPORT">IMPORT</option>
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </FilterSelect>
            <Link href="/items" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Package} title="No products found" text={filtersOn ? "Try a different word, or press Clear. You can also scan the barcode." : "Products are what you buy and sell. Add the first one, or bring many at once from Excel."} actionHref={can(user, "items.create") ? "/items/new" : undefined} actionLabel="Add Product" />
          ) : (
            <BulkForm categories={categories ?? []} canArchive={canArchive} canEdit={canEdit}>
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr>
                    <th aria-label="Select"></th><th>Image</th>{sortHead("code", "SKU Code")}{sortHead("name", "Product Name")}{sortHead("category", "Category")}
                    <th>Unit</th>{sortHead("qty", "Current Stock", true)}<th className="text-right">Reorder Level</th>{sortHead("status", "Status")}<th>Source</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const selected = r.id === selId;
                    const thumb = r.image ? thumbs.get(r.image) : undefined;
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.code}`} /></td>
                        <td>
                          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element -- private signed link, size is fixed
                              <img src={thumb} alt="" width={44} height={44} className="h-full w-full object-contain" loading="lazy" />
                            ) : (
                              <Package size={20} aria-hidden className="text-muted" />
                            )}
                          </span>
                        </td>
                        <td className="whitespace-nowrap"><Link href={keepSel(r.id)} className="font-semibold">{r.code}</Link></td>
                        <td className="min-w-40 max-w-56">
                          <span className="line-clamp-2">{r.name}</span>
                        </td>
                        <td>{r.category ?? ""}</td>
                        <td>{r.unit}</td>
                        <td className={`text-right font-mono font-semibold ${r.status === "out" ? "text-red-600" : ""}`}>{qtyText(r.qty)}</td>
                        <td className="text-right font-mono">{qtyText(r.reorder)}</td>
                        <td title={r.status === "low" ? "Below its reorder level in at least one place" : undefined}><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                        <td>{r.source}</td>
                        <td>
                          <span className="flex items-center gap-1.5">
                            {canEdit && <Link href={`/items/${r.id}`} aria-label={`Edit ${r.code}`} title="Edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <RowMenu id={r.id} canEdit={canEdit} canCreate={canCreate} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </BulkForm>
          )}

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {total.toLocaleString("en-IN")} products</span>
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

        {selId && <Panel itemId={selId} tab={tab} tabHref={(t) => keep({ tab: t === "details" ? undefined : t, sel: selId })} closeHref={keep({ sel: "none", tab: undefined })} canEdit={canEdit} canCreate={canCreate} />}
      </div>
    </main>
  );

  function keepStatus(s: string) {
    return keep({ status: s === "all" ? undefined : s, page: undefined, sel: undefined });
  }
  function keepSel(id: string) {
    return keep({ sel: id });
  }
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
