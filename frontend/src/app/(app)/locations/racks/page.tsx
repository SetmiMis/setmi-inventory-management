import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronLeft, ChevronRight, Eye, Layers, Lock, LockOpen, PackageOpen, Search, SquarePen, X, MapPinned, X as XIcon, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { EmptyState } from "@/components/empty-state";
import { can, requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../../items/item-controls";
import { removeItemFromBin, toggleBinBlocked } from "./actions";
import { AddBinMenu, AssignForm, BinForm, BinRowMenu } from "./bin-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["items", "Items"], ["notes", "Notes"]] as const;
const STATUSES = ["occupied", "available", "blocked"] as const;

type Row = {
  id: string; code: string; location_id: string; place_code: string; place_name: string; city: string | null; rack: string; level: string; bin_no: string;
  type: "BIN" | "SHELF" | "PALLET"; capacity: number | null; blocked: boolean; items: number; qty: number; status: (typeof STATUSES)[number]; utilization: number | null;
};
type PageData = {
  total: number; rows: Row[]; racks: string[]; places: { id: string; code: string; name: string }[];
  kpi: { total: number; occupied: number; available: number; blocked: number; new_month: number };
};
const EMPTY: PageData = { total: 0, rows: [], racks: [], places: [], kpi: { total: 0, occupied: 0, available: 0, blocked: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const TYPE_LABEL = { BIN: "Bin", SHELF: "Shelf", PALLET: "Pallet" } as const;
const TYPE_STYLE = { BIN: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]", SHELF: "bg-[#efe9fb] text-[#6d4fd8] dark:bg-[#3a2a66] dark:text-[#c7b4ff]", PALLET: "bg-[#e0f5f0] text-[#0b7d70] dark:bg-[#123a3a] dark:text-[#5fd3c3]" } as const;
const STATUS_TONE = { occupied: "green", available: "brand", blocked: "red" } as const;
const STATUS_LABEL = { occupied: "Occupied", available: "Available", blocked: "Blocked" } as const;
const barTone = (u: number) => (u >= 90 ? "bg-red-500" : u >= 70 ? "bg-amber-400" : "bg-[var(--brand)]");

export default async function RacksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const rack = /^[A-Z0-9]{1,6}$/.test(first(sp.rack) ?? "") ? first(sp.rack)! : "";
  const status = (STATUSES as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "items";
  const mode = first(sp.new) === "1" ? "new" : first(sp.edit) ? "edit" : "view";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bins_page", {
    p_q: q || null, p_location: place || null, p_rack: rack || null, p_status: status === "all" ? null : status,
    p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const editId = z.uuid().safeParse(first(sp.edit)).data;
  const selId = mode === "edit" && editId ? editId : selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, place: place || undefined, rack: rack || undefined, status: status !== "all" ? status : undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "items" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/locations/racks?${s}` : "/locations/racks";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, place, rack, status: status !== "all" ? status : "" }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canManage = can(user, "locations.manage");
  const pct = (v: number) => (kpi.total > 0 ? `${((v / kpi.total) * 100).toFixed(1)}%` : "0.0%");
  const filtersOn = !!(q || place || rack || status !== "all");
  const showPanel = mode !== "view" || !!selId;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Locations (Racks)</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Locations (Racks)</h1>
          <p className="mt-1 text-sm text-muted">Manage storage locations, racks, shelves and bins. Organize your warehouse with unique location codes for better inventory tracking.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/locations/racks/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canManage && <AddBinMenu addHref={keep({ new: "1", sel: undefined, edit: undefined })} />}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Layers} tint="blue" label="Total Locations" value={kpi.total} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Occupied Locations" value={kpi.occupied} href={keep({ status: "occupied", page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.occupied)}</span>} />
        <Kpi icon={PackageOpen} tint="orange" label="Available Locations" value={kpi.available} href={keep({ status: "available", page: undefined, sel: undefined })} sub={<span className="font-medium text-[#1d62c9] dark:text-[#9ec5ff]">{pct(kpi.available)}</span>} />
        <Kpi icon={AlertTriangle} tint="red" label="Blocked / Reserved" value={kpi.blocked} href={keep({ status: "blocked", page: undefined, sel: undefined })} sub={<span className="font-medium text-red-600">{pct(kpi.blocked)}</span>} />
      </section>

      <div className={`grid gap-5 ${showPanel ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))_auto_auto] md:items-end">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search code, rack, product" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Warehouse" name="place" value={place}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Rack" name="rack" value={rack}>
              <option value="">All Racks</option>
              {result.racks.map((r) => <option key={r} value={r}>{r}</option>)}
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All</option><option value="occupied">Occupied</option><option value="available">Available</option><option value="blocked">Blocked</option>
            </FilterSelect>
            <Link href="/locations/racks" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={MapPinned} title="No rack or bin found" text={filtersOn ? "Try a different word, or press Clear." : canManage ? "Racks, shelves and bins tell your staff exactly where each product is kept. Add the first one." : "No rack or bin has been set up yet."} actionHref={canManage ? keep({ new: "1" }) : undefined} actionLabel="Add Location" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>Location Code</th><th>Warehouse</th><th>Rack</th><th>Level</th><th>Bin</th><th>Type</th><th>Status</th><th className="text-right">Current Stock</th><th className="text-right">Capacity</th><th>Use</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const selected = r.id === selId && mode !== "new";
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={keep({ sel: r.id, tab: undefined, new: undefined, edit: undefined })}>{r.code}</Link></td>
                        <td>{r.city ?? r.place_name}</td>
                        <td>{r.rack}</td><td>{r.level}</td><td>{r.bin_no}</td>
                        <td><span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[r.type]}`}>{TYPE_LABEL[r.type]}</span></td>
                        <td><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                        <td className="text-right font-mono">{n(r.qty)}</td>
                        <td className="text-right font-mono">{r.capacity === null ? "-" : n(r.capacity)}</td>
                        <td className="w-24">
                          {r.utilization === null ? <span className="text-muted">-</span> : (
                            <span className="block"><span className="text-xs font-semibold">{r.utilization}%</span>
                              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-muted"><span className={`block h-full rounded-full ${barTone(r.utilization)}`} style={{ width: `${Math.min(r.utilization, 100)}%` }} /></span></span>
                          )}
                        </td>
                        <td>
                          <span className="flex items-center gap-1.5">
                            <Link href={keep({ sel: r.id, tab: undefined, new: undefined, edit: undefined })} aria-label={`View ${r.code}`} title="View" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            {canManage && <Link href={keep({ edit: r.id, new: undefined })} aria-label={`Edit ${r.code}`} title="Edit" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            {canManage && <BinRowMenu id={r.id} blocked={r.blocked} viewHref={keep({ sel: r.id, tab: undefined })} editHref={keep({ edit: r.id, new: undefined })} />}
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} locations</span>
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

        {showPanel && <Panel mode={mode} selId={selId} tab={tab} keep={keep} places={result.places} canManage={canManage} defaultPlace={place || result.places[0]?.id || ""} />}
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", orange: "bg-[#fdf0e1] text-[#c2670a]", red: "bg-[#fde8e8] text-[#c8302f]" } as const;

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

// Side panel: details of the chosen rack/bin, or the add / edit form.
async function Panel({ mode, selId, tab, keep, places, canManage, defaultPlace }: {
  mode: "view" | "new" | "edit"; selId: string | null; tab: string; keep: (extra: Record<string, string | number | undefined>) => string;
  places: { id: string; code: string; name: string }[]; canManage: boolean; defaultPlace: string;
}) {
  const closeHref = keep({ sel: "none", new: undefined, edit: undefined, tab: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";

  if (mode === "new") {
    return (
      <aside aria-label="Add location" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Add Location</h2>
          <Link href={closeHref} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link></div>
        <BinForm places={places} defaultPlace={defaultPlace} cancelHref={closeHref} />
      </aside>
    );
  }
  if (!selId) return null;

  const supabase = await createClient();
  const [{ data: b }, { data: assigned }] = await Promise.all([
    supabase.from("storage_bins").select("id, code, location_id, rack, level, bin_no, bin_type, capacity, notes, is_blocked, block_reason, locations(name, code, city)").eq("id", selId).maybeSingle(),
    supabase.from("item_bins").select("id, item_id, items(internal_item_code, item_name, unit)").eq("bin_id", selId),
  ]);
  if (!b) return null;
  const place = b.locations as unknown as { name: string; code: string; city: string | null } | null;

  if (mode === "edit" && canManage) {
    return (
      <aside aria-label="Edit location" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Edit Location</h2>
          <Link href={keep({ sel: b.id, edit: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link></div>
        <p className="mb-3 font-mono text-sm font-semibold">{b.code}</p>
        <BinForm
          bin={{ id: b.id, locationId: b.location_id, rack: b.rack, level: b.level, binNo: b.bin_no, binType: b.bin_type, capacity: b.capacity === null ? null : Number(b.capacity), notes: b.notes, blocked: b.is_blocked, blockReason: b.block_reason }}
          places={places} defaultPlace={b.location_id} cancelHref={keep({ sel: b.id, edit: undefined })}
        />
      </aside>
    );
  }

  // quantity of each assigned product in this place
  const itemIds = (assigned ?? []).map((a) => a.item_id);
  const { data: stock } = itemIds.length > 0
    ? await supabase.from("stock_overview").select("item_id, quantity").eq("location_id", b.location_id).in("item_id", itemIds)
    : { data: [] as { item_id: string; quantity: number }[] };
  const qtyByItem = new Map((stock ?? []).map((s) => [s.item_id, Number(s.quantity)]));
  const lines = (assigned ?? []).map((a) => {
    const it = a.items as unknown as { internal_item_code: string; item_name: string; unit: string } | null;
    return { rowId: a.id, itemId: a.item_id, code: it?.internal_item_code ?? "", name: it?.item_name ?? "", unit: it?.unit ?? "", qty: qtyByItem.get(a.item_id) ?? 0 };
  });
  const qty = lines.reduce((acc, l) => acc + l.qty, 0);
  const capacity = b.capacity === null ? null : Number(b.capacity);
  const util = capacity && capacity > 0 ? Math.round((qty * 100) / capacity) : null;
  const status = b.is_blocked ? "blocked" : qty > 0 ? "occupied" : "available";

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <aside aria-label="Location details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold leading-tight">{b.code}</h2>
          <span className="mt-1 inline-block"><Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge></span>
        </div>
        <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
      </div>
      <dl>
        {field("Warehouse", place && `${place.name}${place.city ? ` (${place.city})` : ""}`)}
        {field("Rack", b.rack)}
        {field("Level", b.level)}
        {field("Bin", b.bin_no)}
        {field("Location Type", TYPE_LABEL[b.bin_type as keyof typeof TYPE_LABEL])}
        {field("Status", <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>)}
        {b.is_blocked && b.block_reason && field("Reason", b.block_reason)}
        {field("Current Stock", `${n(qty)} Units`)}
        {field("Capacity", capacity === null ? "" : `${n(capacity)} Units`)}
        {field("Utilization", util === null ? "" : (
          <span className="flex items-center gap-2"><span className="font-semibold">{util}%</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"><span className={`block h-full rounded-full ${barTone(util)}`} style={{ width: `${Math.min(util, 100)}%` }} /></span></span>
        ))}
      </dl>

      <div role="tablist" aria-label="Location sections" className="mt-3 flex gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: b.id, tab: v === "items" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2.5 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>
            {label}{v === "items" ? ` (${lines.length})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "items" && (
          <>
            {lines.length === 0 ? <p className="py-4 text-center text-sm text-muted">No product is kept here yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {lines.map((l) => (
                  <li key={l.rowId} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0"><Link href={`/items?sel=${l.itemId}`} className="block font-semibold">{l.code}</Link><span className="block truncate text-xs text-muted">{l.name}</span></span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-mono">{n(l.qty)} {l.unit}</span>
                      {canManage && (
                        <form action={removeItemFromBin}>
                          <input type="hidden" name="id" value={l.rowId} /><input type="hidden" name="binId" value={b.id} />
                          <button type="submit" aria-label={`Remove ${l.code} from this bin`} title="Remove from this bin" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"><XIcon size={16} aria-hidden /></button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && <AssignForm binId={b.id} />}
            <p className="mt-2 text-xs text-muted">The stock shown is the stock of that product in this warehouse. Where it is kept does not move stock.</p>
          </>
        )}
        {tab === "notes" && <p className="whitespace-pre-wrap text-sm">{b.notes || <span className="text-muted">No notes.</span>}</p>}
      </div>

      {canManage && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link href={keep({ edit: b.id, new: undefined })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">
            <SquarePen size={16} aria-hidden /> Edit Location
          </Link>
          {/* Racks are never deleted (the codes stay unique); they are blocked instead. */}
          <form action={toggleBinBlocked}>
            <input type="hidden" name="id" value={b.id} />
            <input type="hidden" name="block" value={b.is_blocked ? "0" : "1"} />
            <button type="submit" className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${b.is_blocked ? "border-[var(--brand)] text-[var(--brand-text)] hover:bg-brand-soft" : "border-[var(--danger)] text-[var(--danger)] hover:bg-red-500/10"}`}>
              {b.is_blocked ? <LockOpen size={16} aria-hidden /> : <Lock size={16} aria-hidden />} {b.is_blocked ? "Unblock Location" : "Block Location"}
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}

export const metadata = { title: "Locations (Racks)" };
