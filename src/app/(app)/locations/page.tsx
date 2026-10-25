import Link from "next/link";
import {
  Building2, CheckCircle2, ChevronLeft, ChevronRight, Eye, Mail, MapPin, PackageCheck, Phone, PieChart, Power, Search, SquarePen, Store, User, Warehouse, X,
  Package, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { ColoredColumns, DonutChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { can, requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { toggleLocationActive } from "./actions";
import { AddPlaceMenu, PlaceRowMenu } from "./location-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["stock", "Stock"], ["team", "Team"]] as const;
const BAR_COLORS = ["#1677ff", "#17a589", "#f5b301", "#7c3aed", "#e5484d", "#06b6d4"];

type Row = {
  id: string; code: string; name: string; type: "WAREHOUSE" | "SHOP"; address: string | null; city: string | null; capacity: number | null;
  contact_person: string | null; phone: string | null; email: string | null; active: boolean; created_at: string; products: number; utilization: number | null;
};
type PageData = {
  total: number; rows: Row[]; cities: string[]; by_place: { code: string; name: string; products: number }[];
  kpi: { total: number; warehouses: number; shops: number; active: number; capacity: number; products: number; products_with_capacity: number; avg_utilization: number | null; new_month: number };
};
const EMPTY: PageData = { total: 0, rows: [], cities: [], by_place: [], kpi: { total: 0, warehouses: 0, shops: 0, active: 0, capacity: 0, products: 0, products_with_capacity: 0, avg_utilization: null, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN");
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const TYPE_LABEL = { WAREHOUSE: "Warehouse", SHOP: "Shop" } as const;
const barTone = (u: number) => (u >= 90 ? "bg-red-500" : u >= 70 ? "bg-amber-400" : "bg-[var(--brand)]");

// Everyone signed in may open this page; the database returns only the places the person may see
// (their own, or all for admins and location managers).
export default async function LocationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const type = ["WAREHOUSE", "SHOP"].includes(first(sp.type) ?? "") ? first(sp.type)! : "";
  const status = ["active", "inactive"].includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const city = (first(sp.city) ?? "").slice(0, 60);
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("locations_page", {
    p_q: q || null, p_type: type || null, p_status: status === "all" ? null : status, p_city: city || null,
    p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const current = await getCurrentLocation(user);

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, type: type || undefined, status: status !== "all" ? status : undefined, city: city || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/locations?${s}` : "/locations";
  };

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canManage = can(user, "locations.manage");
  const filtersOn = !!(q || type || city || status !== "all");
  const occupied = kpi.products_with_capacity;
  const available = Math.max(0, kpi.capacity - occupied);
  const overall = kpi.capacity > 0 ? Math.round((occupied * 100) / kpi.capacity) : 0;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Warehouses</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Warehouses</h1>
          <p className="mt-1 text-sm text-muted">Manage your warehouses, shops, storage capacity and what is in stock there. Add, edit and view details, addresses and occupancy.</p>
        </div>
        {canManage && <AddPlaceMenu />}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Building2} tint="blue" label="Total Places" value={n(kpi.total)} sub={<span className="text-muted">{kpi.warehouses} warehouse{kpi.warehouses === 1 ? "" : "s"}, {kpi.shops} shop{kpi.shops === 1 ? "" : "s"}</span>} />
        <Kpi icon={Package} tint="green" label="Total Capacity" value={n(kpi.capacity)} sub={<span className="text-muted">Product slots (bins)</span>} />
        <Kpi icon={PackageCheck} tint="orange" label="Products in Stock" value={n(kpi.products)} sub={<span className="text-muted">Each product counted once per place</span>} />
        <section className={`${cardClass} flex items-center gap-4 !p-4`}>
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ece8fb] text-[#6d4fd8]"><PieChart size={26} aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted">Average Utilization</span>
            <span className="block text-3xl font-bold leading-9 tracking-tight">{kpi.avg_utilization === null ? "-" : `${kpi.avg_utilization}%`}</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full rounded-full bg-[#7c3aed]" style={{ width: `${Math.min(kpi.avg_utilization ?? 0, 100)}%` }} /></span>
              <span className="text-xs text-muted">{kpi.avg_utilization === null ? "set a capacity" : `${kpi.avg_utilization}%`}</span>
            </span>
          </span>
        </section>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section className={`${cardClass} min-w-0 !p-4`}>
            <form method="get" className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))_auto_auto] md:items-end">
              <label className="relative block">
                <span className="sr-only">Search</span>
                <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={q} placeholder="Search name, code, city, address" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
              </label>
              <FilterSelect label="Type" name="type" value={type}>
                <option value="">All</option><option value="WAREHOUSE">Warehouses</option><option value="SHOP">Shops</option>
              </FilterSelect>
              <FilterSelect label="Status" name="status" value={status}>
                <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
              </FilterSelect>
              <FilterSelect label="City" name="city" value={city}>
                <option value="">All</option>
                {result.cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </FilterSelect>
              <Link href="/locations" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
              <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
                <Search size={16} aria-hidden /> Filter
              </button>
            </form>

            {rows.length === 0 ? (
              <EmptyState icon={Warehouse} title="No warehouses or shops found" text={filtersOn ? "Try a different word, or press Clear." : canManage ? "Create your first warehouse or shop." : "No place is assigned to you yet. Ask an administrator."} actionHref={canManage ? "/locations/new" : undefined} actionLabel="Add Warehouse" />
            ) : (
              <div className="overflow-x-auto">
                <table className="dash-table w-full text-left text-sm">
                  <thead>
                    <tr><th>#</th><th>Code</th><th>Name</th><th>Address</th><th>City</th><th className="text-right">Capacity</th><th className="text-right">Products in Stock</th><th>Use</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const selected = r.id === selId;
                      return (
                        <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                          <td className="text-muted">{(page - 1) * size + i + 1}</td>
                          <td className="whitespace-nowrap font-semibold"><Link href={keep({ sel: r.id, tab: undefined })}>{r.code}</Link></td>
                          <td className="min-w-32">
                            <span className="block font-medium">{r.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted">{r.type === "SHOP" ? <Store size={12} aria-hidden /> : <Warehouse size={12} aria-hidden />} {TYPE_LABEL[r.type]}{current?.id === r.id ? " · you work here" : ""}</span>
                          </td>
                          <td className="max-w-28 truncate text-muted" title={r.address ?? undefined}>{r.address ?? ""}</td>
                          <td>{r.city ?? ""}</td>
                          <td className="text-right font-mono">{r.capacity === null ? "-" : n(r.capacity)}</td>
                          <td className="text-right font-mono font-semibold">{n(r.products)}</td>
                          <td className="w-24">
                            {r.utilization === null ? <span className="text-muted">-</span> : (
                              <span className="block"><span className="text-xs font-semibold">{r.utilization}%</span>
                                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-muted"><span className={`block h-full rounded-full ${barTone(r.utilization)}`} style={{ width: `${Math.min(r.utilization, 100)}%` }} /></span></span>
                            )}
                          </td>
                          <td><Badge tone={r.active ? "green" : "red"}>{r.active ? "Active" : "Inactive"}</Badge></td>
                          <td>
                            <span className="flex items-center gap-1.5">
                              <Link href={keep({ sel: r.id, tab: undefined })} aria-label={`View ${r.name}`} title="View" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                              <Link href={`/locations/${r.id}`} aria-label={`${canManage ? "Edit" : "Open"} ${r.name}`} title={canManage ? "Edit" : "Open"} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>
                              <PlaceRowMenu id={r.id} active={r.active} canManage={canManage} viewHref={keep({ sel: r.id, tab: undefined })} />
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
              <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} places</span>
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

          <div className="grid gap-5 lg:grid-cols-2">
            <section className={cardClass}>
              <h2 className="mb-3 text-lg font-bold">Stock by Warehouse</h2>
              <p className="-mt-2 mb-2 text-xs text-muted">Number of products in stock at each place</p>
              <ColoredColumns
                data={result.by_place.map((p, i) => ({ key: p.code, label: p.code, value: Number(p.products), color: BAR_COLORS[i % BAR_COLORS.length] }))}
                ariaLabel="Products in stock by place" emptyText="No stock in any place yet."
              />
            </section>
            <section className={cardClass}>
              <h2 className="mb-3 text-lg font-bold">Warehouse Utilization</h2>
              {kpi.capacity === 0 ? (
                <p className="py-10 text-center text-sm text-muted">Set a capacity on a warehouse or shop to see how full it is.</p>
              ) : (
                <DonutChart
                  segments={[
                    { key: "occ", label: "Occupied Slots", value: occupied, color: "#17a589" },
                    { key: "avail", label: "Available Slots", value: available, color: "#93c5fd" },
                  ]}
                  centerValue={`${overall}%`} centerLabel="Overall Utilization" ariaLabel="Warehouse utilization"
                />
              )}
            </section>
          </div>
        </div>

        {selId && <Panel id={selId} tab={tab} keep={keep} canManage={canManage} isAdmin={user.isActive && user.isAdmin} />}
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", orange: "bg-[#fdf0e1] text-[#c2670a]" } as const;

function Kpi({ icon: Icon, tint, label, value, sub }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; sub: React.ReactNode }) {
  return (
    <section className={`${cardClass} flex items-center gap-4 !p-4`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-3xl font-bold leading-9 tracking-tight">{value}</span>
        <span className="block text-xs">{sub}</span>
      </span>
    </section>
  );
}

// Side panel for the chosen place. Row rules apply: a place the person may not see simply is not found.
async function Panel({ id, tab, keep, canManage, isAdmin }: { id: string; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; canManage: boolean; isAdmin: boolean }) {
  const supabase = await createClient();
  const [{ data: l }, { data: stock }] = await Promise.all([
    supabase.from("locations").select("*").eq("id", id).maybeSingle(),
    supabase.from("stock_overview").select("item_id, internal_item_code, item_name, unit, quantity, min_qty, is_low").eq("location_id", id).order("internal_item_code"),
  ]);
  if (!l || l.type === "TRANSIT") return null;
  const closeHref = keep({ sel: "none", tab: undefined });

  let team: { id: string; email: string; full_name: string | null }[] = [];
  if (isAdmin && tab === "team") {
    const { data } = await supabase.from("user_locations").select("profiles(id, email, full_name)").eq("location_id", l.id);
    team = (data ?? []).map((r) => r.profiles as unknown as { id: string; email: string; full_name: string | null } | null).filter((p): p is { id: string; email: string; full_name: string | null } => !!p);
  }
  const inStock = (stock ?? []).filter((s) => Number(s.quantity) > 0);
  const slots = l.capacity as number | null;
  const used = inStock.length;
  const util = slots && slots > 0 ? Math.round((used * 100) / slots) : null;

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <aside aria-label="Place details" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{l.code}</h2>
        <div className="flex items-center gap-1">
          <Badge tone={l.is_active ? "green" : "red"}>{l.is_active ? "Active" : "Inactive"}</Badge>
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>
      <div className="flex aspect-[16/7] items-center justify-center rounded-xl border border-line bg-gradient-to-br from-brand-soft to-surface-muted text-[var(--brand-text)]">
        {l.type === "SHOP" ? <Store size={56} aria-hidden /> : <Warehouse size={56} aria-hidden />}
      </div>
      <p className="mt-3 text-base font-bold">{l.name}</p>
      <p className="text-xs text-muted">{TYPE_LABEL[l.type as "WAREHOUSE" | "SHOP"]}{l.city ? ` · ${l.city}` : ""}</p>

      <div role="tablist" aria-label="Place sections" className="mt-3 flex gap-1 border-b border-line text-sm">
        {TABS.filter(([v]) => v !== "team" || isAdmin).map(([v, label]) => (
          <Link key={v} href={keep({ sel: l.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2.5 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{label}</Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <dl>
            {field("Code", l.code)}
            {field("Name", l.name)}
            {field("Type", TYPE_LABEL[l.type as "WAREHOUSE" | "SHOP"])}
            {field("Address", l.address && <span className="inline-flex gap-1.5"><MapPin size={13} aria-hidden className="mt-0.5 shrink-0" /> {l.address}</span>)}
            {field("City", l.city)}
            {field("Contact Person", l.contact_person && <span className="inline-flex items-center gap-1.5"><User size={13} aria-hidden /> {l.contact_person}</span>)}
            {field("Phone", l.phone && <span className="inline-flex items-center gap-1.5"><Phone size={13} aria-hidden /> {l.phone}</span>)}
            {field("Email", l.email && <a href={`mailto:${l.email}`} className="inline-flex min-w-0 items-start gap-1.5 break-all"><Mail size={13} aria-hidden className="mt-0.5 shrink-0" /> {l.email}</a>)}
            {field("Status", <Badge tone={l.is_active ? "green" : "red"}>{l.is_active ? "Active" : "Inactive"}</Badge>)}
            {field("Created On", dateTime(l.created_at))}
            {field("Last Updated", dateTime(l.updated_at))}
          </dl>
        )}
        {tab === "stock" && (
          inStock.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing in stock here yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {inStock.slice(0, 12).map((s) => (
                <li key={s.item_id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><Link href={`/items?sel=${s.item_id}`} className="block font-semibold">{s.internal_item_code}</Link><span className="block truncate text-xs text-muted">{s.item_name}</span></span>
                  <span className={`shrink-0 font-mono font-semibold ${s.is_low ? "text-amber-600" : ""}`}>{Number(s.quantity).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {s.unit}</span>
                </li>
              ))}
              {inStock.length > 12 && <li className="py-2 text-xs text-muted">Showing 12 of {inStock.length}. <Link href="/stock">See all stock</Link></li>}
            </ul>
          )
        )}
        {tab === "team" && isAdmin && (
          team.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nobody is assigned yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {team.map((m) => <li key={m.id} className="py-2"><span className="block font-medium">{m.full_name ?? m.email}</span>{m.full_name && <span className="block text-xs text-muted">{m.email}</span>}</li>)}
              <li className="py-2 text-xs text-muted">Change this on the <Link href="/admin/users">Users &amp; Roles</Link> page.</li>
            </ul>
          )
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat icon={Package} label="Product slots" value={slots === null ? "-" : n(slots)} />
        <Stat icon={CheckCircle2} label="Occupied" value={n(used)} />
        <Stat icon={Warehouse} label="Available" value={slots === null ? "-" : n(Math.max(0, slots - used))} />
        <Stat icon={PieChart} label="Utilization" value={util === null ? "-" : `${util}%`} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/locations/${l.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">
          <SquarePen size={16} aria-hidden /> {canManage ? "Edit Warehouse" : "Open"}
        </Link>
        {canManage ? (
          // Places are never deleted (the stock history points at them); they are archived instead.
          <form action={toggleLocationActive}>
            <input type="hidden" name="id" value={l.id} />
            <input type="hidden" name="active" value={l.is_active ? "0" : "1"} />
            <button type="submit" className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${l.is_active ? "border-[var(--danger)] text-[var(--danger)] hover:bg-red-500/10" : "border-[var(--brand)] text-[var(--brand-text)] hover:bg-brand-soft"}`}>
              <Power size={16} aria-hidden /> {l.is_active ? "Archive" : "Restore"}
            </button>
          </form>
        ) : <Link href="/stock" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line text-sm font-semibold hover:bg-surface-muted">Current stock</Link>}
      </div>
    </aside>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-2.5">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-bold"><Icon size={18} aria-hidden className="text-[var(--brand-text)]" /> {value}</p>
    </div>
  );
}
