import Link from "next/link";
import {
  Archive, ChevronLeft, ChevronRight, Eye, Layers, Package, Power, Search, SquarePen, Tag, X, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { EmptyState } from "@/components/empty-state";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { BUCKET } from "@/lib/validation/files";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../item-controls";
import { setCategoryActive } from "./actions";
import { AddCategoryMenu, CategoryRowMenu } from "./category-controls";
import { CategoryForm } from "./category-form";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const SORTS = [["name_asc", "Name (A - Z)"], ["name_desc", "Name (Z - A)"], ["newest", "Newest first"], ["products", "Most products"]] as const;
const TABS = [["overview", "Overview"], ["products", "Products"]] as const;

type Row = { id: string; code: string | null; name: string; description: string | null; active: boolean; created_at: string; updated_at: string; products: number; image: string | null };
type PageData = { total: number; rows: Row[]; kpi: { total: number; active: number; inactive: number; products: number; new_categories: number; new_products: number } };

const date = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const n = (v: number) => Number(v).toLocaleString("en-IN");

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("categories.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const status = ["active", "inactive"].includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const sort = SORTS.some(([v]) => v === first(sp.sort)) ? first(sp.sort)! : "name_asc";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";
  const mode = first(sp.new) === "1" ? "new" : first(sp.edit) ? "edit" : "view";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("categories_page", {
    p_q: q || null, p_status: status === "all" ? null : status, p_sort: sort, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? { total: 0, rows: [], kpi: { total: 0, active: 0, inactive: 0, products: 0, new_categories: 0, new_products: 0 } }) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  // Which category is open in the side panel: the one in the address, else the first row. sel=none closes it.
  const selParam = first(sp.sel);
  const editId = z.uuid().safeParse(first(sp.edit)).data;
  const selId = mode === "edit" && editId ? editId : selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const thumbPaths = rows.map((r) => r.image).filter((p): p is string => !!p);
  const thumbs = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(thumbPaths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) thumbs.set(s.path, s.signedUrl);
  }

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, status: status !== "all" ? status : undefined, sort: sort !== "name_asc" ? sort : undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/items/categories?${s}` : "/items/categories";
  };

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const pct = (v: number) => (kpi.total > 0 ? `${((v / kpi.total) * 100).toFixed(1)}%` : "0.0%");
  const filtersOn = !!(q || status !== "all");
  const showPanel = mode !== "view" || !!selId;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Categories</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Product Categories</h1>
          <p className="mt-1 text-sm text-muted">Manage product categories to organize your inventory. Categories help in better search, reporting and product classification.</p>
        </div>
        <AddCategoryMenu addHref={keep({ new: "1", sel: undefined })} />
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Layers} tint="blue" label="Total Categories" value={kpi.total} href={keep({ status: undefined, page: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_categories} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Active Categories" value={kpi.active} href={keep({ status: "active", page: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.active)}</span>} />
        <Kpi icon={Archive} tint="orange" label="Inactive Categories" value={kpi.inactive} href={keep({ status: "inactive", page: undefined })} sub={<span className="font-medium text-red-600">{pct(kpi.inactive)}</span>} />
        <Kpi icon={Tag} tint="red" label="Total Products" value={kpi.products} href="/items" sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_products} this month</span>} />
      </section>

      <div className={`grid gap-5 ${showPanel ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(2,minmax(0,1fr))_auto_auto] md:items-end">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search name, code or description" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Status</span>
              <select name="status" defaultValue={status} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">
                <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Sort By</span>
              <select name="sort" defaultValue={sort} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <Link href="/items/categories" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Layers} title="No categories found" text={filtersOn ? "Try a different word, or press Clear." : "Categories group your products. Add the first one."} actionHref={keep({ new: "1" })} actionLabel="Add Category" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>Image</th><th>Category Code</th><th>Category Name</th><th>Description</th><th className="text-right">Products</th><th>Status</th><th>Created On</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId && mode !== "new";
                    const thumb = r.image ? thumbs.get(r.image) : undefined;
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td>
                          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element -- private signed link, size is fixed
                              <img src={thumb} alt="" width={44} height={44} className="h-full w-full object-contain" loading="lazy" />
                            ) : <Layers size={20} aria-hidden className="text-muted" />}
                          </span>
                        </td>
                        <td className="whitespace-nowrap font-semibold">{r.code ? <Link href={keep({ sel: r.id, tab: undefined })}>{r.code}</Link> : <span className="text-muted">-</span>}</td>
                        <td className="min-w-32"><Link href={keep({ sel: r.id, tab: undefined })} className="font-medium">{r.name}</Link></td>
                        <td className="max-w-56 truncate text-muted" title={r.description ?? undefined}>{r.description ?? ""}</td>
                        <td className="text-right font-mono font-semibold">{n(r.products)}</td>
                        <td><Badge tone={r.active ? "green" : "red"}>{r.active ? "Active" : "Inactive"}</Badge></td>
                        <td className="whitespace-nowrap">{date(r.created_at)}</td>
                        <td>
                          <span className="flex items-center gap-1.5">
                            <Link href={keep({ sel: r.id, tab: undefined })} aria-label={`View ${r.name}`} title="View" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            <Link href={keep({ edit: r.id })} aria-label={`Edit ${r.name}`} title="Edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>
                            <CategoryRowMenu id={r.id} active={r.active} viewHref={keep({ sel: r.id })} editHref={keep({ edit: r.id })} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} categories</span>
            <nav aria-label="Pagination" className="flex items-center gap-1.5">
              {page > 1 ? <PageLink href={keep({ page: page - 1 })} label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink> : <PageLink disabled label="Previous page"><ChevronLeft size={16} aria-hidden /></PageLink>}
              {pages.map((p, i) => p === "gap" ? <span key={`g${i}`} className="px-1 text-muted">...</span> : (
                <PageLink key={p} href={keep({ page: p })} active={p === page} label={`Page ${p}`}>{p}</PageLink>
              ))}
              {page < lastPage ? <PageLink href={keep({ page: page + 1 })} label="Next page"><ChevronRight size={16} aria-hidden /></PageLink> : <PageLink disabled label="Next page"><ChevronRight size={16} aria-hidden /></PageLink>}
            </nav>
            <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
          </div>
        </section>

        {showPanel && (
          <Panel mode={mode} selId={selId} tab={tab} keep={keep} />
        )}
      </div>
    </main>
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
  blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", orange: "bg-[#fdf0e1] text-[#c2670a]", red: "bg-[#fde8e8] text-[#c8302f]",
} as const;

function Kpi({ icon: Icon, tint, label, value, sub, href }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: number; sub: React.ReactNode; href: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-3xl font-bold leading-9 tracking-tight">{n(value)}</span>
        <span className="block text-xs">{sub}</span>
      </span>
    </Link>
  );
}

// Side panel: "Category Details" for a chosen category, or the add / edit form.
async function Panel({ mode, selId, tab, keep }: { mode: "view" | "new" | "edit"; selId: string | null; tab: string; keep: (extra: Record<string, string | number | undefined>) => string }) {
  const closeHref = keep({ sel: "none", new: undefined, edit: undefined, tab: undefined });

  if (mode === "new") {
    return (
      <aside aria-label="Add category" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Add Category</h2>
          <Link href={closeHref} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <CategoryForm cancelHref={closeHref} />
      </aside>
    );
  }
  if (!selId) return null;

  const supabase = await createClient();
  const { data: c } = await supabase.from("categories").select("id, name, code, description, is_active, created_at, updated_at").eq("id", selId).maybeSingle();
  if (!c) return null;

  if (mode === "edit") {
    return (
      <aside aria-label="Edit category" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Edit Category</h2>
          <Link href={keep({ sel: c.id, edit: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <CategoryForm category={{ id: c.id, name: c.name, code: c.code, description: c.description, isActive: c.is_active }} cancelHref={keep({ sel: c.id, edit: undefined })} />
      </aside>
    );
  }

  const [{ data: items, count }, { data: withPicture }] = await Promise.all([
    supabase.from("items").select("id, internal_item_code, item_name, unit, is_active", { count: "exact" }).eq("category_id", c.id).order("internal_item_code").limit(8),
    supabase.from("items").select("image_paths").eq("category_id", c.id).not("image_paths", "eq", "{}").order("created_at").limit(1),
  ]);
  const imagePath = (withPicture?.[0]?.image_paths as string[] | undefined)?.[0];
  let imageUrl: string | null = null;
  if (imagePath) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(imagePath, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <aside aria-label="Category details" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20`}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Category Details</h2>
        <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
      </div>
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#e3f6ec] text-[#16824f]"><Package size={26} aria-hidden /></span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">{c.code ?? c.name} <Badge tone={c.is_active ? "green" : "red"}>{c.is_active ? "Active" : "Inactive"}</Badge></p>
          {c.code && <p className="text-sm">{c.name}</p>}
          {c.description && <p className="line-clamp-2 text-xs text-muted">{c.description}</p>}
        </div>
      </div>

      <div role="tablist" aria-label="Category sections" className="mt-3 flex gap-1 border-b border-line text-sm">
        {TABS.map(([v, l]) => (
          <Link key={v} href={keep({ sel: c.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2.5 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>
            {l}{v === "products" ? ` (${n(count ?? 0)})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            <dl>
              {field("Category Code", c.code)}
              {field("Category Name", c.name)}
              {field("Description", c.description)}
              {field("Status", <Badge tone={c.is_active ? "green" : "red"}>{c.is_active ? "Active" : "Inactive"}</Badge>)}
              {field("Created On", dateTime(c.created_at))}
              {field("Last Updated", dateTime(c.updated_at))}
            </dl>
            <h3 className="mb-2 mt-4 text-base font-bold">Category Image</h3>
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- private signed link
                <img src={imageUrl} alt={c.name} className="h-full w-full object-contain" />
              ) : <Layers size={48} aria-hidden className="text-muted" />}
            </div>
            <p className="mt-1 text-xs text-muted">The picture of the first product in this category that has one.</p>
          </>
        )}
        {tab === "products" && (
          (items ?? []).length === 0 ? <p className="py-6 text-center text-sm text-muted">No product in this category yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(items ?? []).map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><Link href={`/items?sel=${it.id}`} className="block font-semibold">{it.internal_item_code}</Link><span className="block truncate text-xs text-muted">{it.item_name}</span></span>
                  <Badge tone={it.is_active ? "green" : "gray"}>{it.is_active ? "Active" : "Inactive"}</Badge>
                </li>
              ))}
              {(count ?? 0) > 8 && <li className="py-2 text-xs text-muted">Showing 8 of {n(count ?? 0)}. <Link href="/items">See all products</Link></li>}
            </ul>
          )
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Link href={keep({ edit: c.id })} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold text-[var(--brand-text)] hover:bg-brand-soft">
          <SquarePen size={16} aria-hidden /> Edit Category
        </Link>
        {/* Categories are never deleted (products keep pointing at them); they are switched off instead. */}
        <form action={setCategoryActive}>
          <input type="hidden" name="id" value={c.id} />
          <input type="hidden" name="active" value={c.is_active ? "0" : "1"} />
          <button type="submit" className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${c.is_active ? "border-[var(--danger)] text-[var(--danger)] hover:bg-red-500/10" : "border-[var(--brand)] text-[var(--brand-text)] hover:bg-brand-soft"}`}>
            <Power size={16} aria-hidden /> {c.is_active ? "Deactivate Category" : "Activate Category"}
          </button>
        </form>
      </div>
    </aside>
  );
}

export const metadata = { title: "Categories" };
