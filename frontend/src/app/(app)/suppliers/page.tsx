import Link from "next/link";
import {
  Archive, ArrowDownToLine, Building2, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, Eye, Mail, MapPin, PackageCheck, Phone, Search,
  SquarePen, Truck, Users, X, Globe, Power, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "../purchase-orders/status";
import { toggleSupplierActive } from "./actions";
import { AddSupplierMenu, SupplierRowMenu } from "./supplier-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["contact", "Contact"], ["orders", "Orders"]] as const;

type Row = { id: string; code: string; name: string; type: "LOCAL" | "IMPORT"; country: string | null; city: string | null; contact_person: string | null; phone: string | null; email: string | null; active: boolean; created_at: string };
type PageData = { total: number; rows: Row[]; countries: string[]; kpi: { total: number; active: number; inactive: number; with_orders: number; import: number; new_month: number } };

const TYPE_LABEL = { LOCAL: "Domestic", IMPORT: "Import" } as const;
const n = (v: number) => Number(v).toLocaleString("en-IN");
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

// Round letters in a colour that stays the same for the same supplier.
const AVATAR_COLORS = ["#0b7d70", "#1d62c9", "#7c5cd6", "#c2670a", "#c8302f", "#16824f", "#5b6b7c"];
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const clean = name.replace(/^DEMO\s+/i, "");
  const letters = clean.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "S";
  const color = AVATAR_COLORS[[...clean].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}>{letters}</span>;
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("suppliers.view", "suppliers.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const type = ["LOCAL", "IMPORT"].includes(first(sp.type) ?? "") ? first(sp.type)! : "";
  const status = ["active", "inactive"].includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const country = (first(sp.country) ?? "").slice(0, 60);
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suppliers_page", {
    p_q: q || null, p_type: type || null, p_status: status === "all" ? null : status, p_country: country || null,
    p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? { total: 0, rows: [], countries: [], kpi: { total: 0, active: 0, inactive: 0, with_orders: 0, import: 0, new_month: 0 } }) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, type: type || undefined, status: status !== "all" ? status : undefined, country: country || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/suppliers?${s}` : "/suppliers";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, type, status: status !== "all" ? status : "", country }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canManage = can(user, "suppliers.manage");
  const pct = (v: number) => (kpi.total > 0 ? `${((v / kpi.total) * 100).toFixed(1)}%` : "0.0%");
  const filtersOn = !!(q || type || country || status !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Suppliers</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Suppliers</h1>
          <p className="mt-1 text-sm text-muted">Manage your suppliers, manufacturers and vendors. Keep all supplier information, contact details and transaction history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/suppliers/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canManage && <AddSupplierMenu />}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi icon={Users} tint="blue" label="Total Suppliers" value={kpi.total} href="/suppliers" sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Active Suppliers" value={kpi.active} href={keep({ status: "active", page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.active)}</span>} />
        <Kpi icon={Archive} tint="red" label="Inactive Suppliers" value={kpi.inactive} href={keep({ status: "inactive", page: undefined, sel: undefined })} sub={<span className="font-medium text-red-600">{pct(kpi.inactive)}</span>} />
        <Kpi icon={ClipboardList} tint="orange" label="Suppliers with Orders" value={kpi.with_orders} href="/purchase-orders" sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.with_orders)}</span>} />
        <Kpi icon={Truck} tint="blue" label="Import Suppliers" value={kpi.import} href={keep({ type: "IMPORT", page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.import)}</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))_auto_auto] md:items-end">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search name, code, contact, email" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Supplier Type" name="type" value={type}>
              <option value="">All Types</option><option value="LOCAL">Domestic</option><option value="IMPORT">Import</option>
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </FilterSelect>
            <FilterSelect label="Country" name="country" value={country}>
              <option value="">All</option>
              {result.countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <Link href="/suppliers" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Truck} title="No suppliers found" text={filtersOn ? "Try a different word, or press Clear." : "A supplier is who you buy from. Add the first one."} actionHref={canManage ? "/suppliers/new" : undefined} actionLabel="Add Supplier" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>Supplier Code</th><th>Supplier Name</th><th>Type</th><th>Country</th><th>City</th><th>Contact Person</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId;
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap font-semibold"><Link href={keep({ sel: r.id, tab: undefined })}>{r.code}</Link></td>
                        <td className="min-w-44">
                          <span className="flex items-center gap-2.5"><Avatar name={r.name} /><span className="font-medium">{r.name}</span></span>
                        </td>
                        <td><Badge tone={r.type === "IMPORT" ? "brand" : "amber"}>{TYPE_LABEL[r.type]}</Badge></td>
                        <td>{r.country ?? ""}</td>
                        <td>{r.city ?? ""}</td>
                        <td className="min-w-36">
                          {r.contact_person ?? ""}
                          {r.phone && <span className="block text-xs text-muted">{r.phone}</span>}
                        </td>
                        <td><Badge tone={r.active ? "green" : "red"}>{r.active ? "Active" : "Inactive"}</Badge></td>
                        <td>
                          <span className="flex items-center gap-1.5">
                            <Link href={keep({ sel: r.id, tab: undefined })} aria-label={`View ${r.name}`} title="View" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            <Link href={`/suppliers/${r.id}`} aria-label={`${canManage ? "Edit" : "Open"} ${r.name}`} title={canManage ? "Edit" : "Open"} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>
                            <SupplierRowMenu id={r.id} active={r.active} canManage={canManage} viewHref={keep({ sel: r.id, tab: undefined })} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} suppliers</span>
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

        {selId && <Panel id={selId} tab={tab} keep={keep} canManage={canManage} />}
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

// Side panel with the chosen supplier. Row rules apply: a supplier the person may not see simply is not found.
async function Panel({ id, tab, keep, canManage }: { id: string; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; canManage: boolean }) {
  const supabase = await createClient();
  const [{ data: s }, orders, pending, received, { data: recent }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).maybeSingle(),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id),
    supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id).in("status", ["SENT", "PARTIAL"]),
    supabase.from("goods_receipts").select("id", { count: "exact", head: true }).eq("supplier_id", id).eq("status", "POSTED"),
    supabase.from("purchase_orders").select("id, po_no, order_date, status, expected_date").eq("supplier_id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  if (!s) return null;
  const closeHref = keep({ sel: "none", tab: undefined });

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const site = s.website ? (s.website.startsWith("http") ? s.website : `https://${s.website}`) : null;

  return (
    <aside aria-label="Supplier details" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{s.code}</h2>
        <div className="flex items-center gap-1">
          <Badge tone={s.is_active ? "green" : "red"}>{s.is_active ? "Active" : "Inactive"}</Badge>
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Avatar name={s.name} size={56} />
        <div className="min-w-0">
          <p className="text-base font-bold">{s.name}</p>
          <p className="mt-1"><Badge tone={s.supplier_type === "IMPORT" ? "brand" : "amber"}>{TYPE_LABEL[s.supplier_type as "LOCAL" | "IMPORT"]}</Badge></p>
        </div>
      </div>

      <div role="tablist" aria-label="Supplier sections" className="mt-3 flex gap-1 border-b border-line text-sm">
        {TABS.map(([v, l]) => (
          <Link key={v} href={keep({ sel: s.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2.5 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{l}</Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <dl>
            {field("Supplier Code", s.code)}
            {field("Company Name", s.name)}
            {field("Supplier Type", TYPE_LABEL[s.supplier_type as "LOCAL" | "IMPORT"])}
            {field("Country", s.country)}
            {field("City", s.city)}
            {field("Contact Person", s.contact_person)}
            {field("Phone", s.phone && <span className="inline-flex items-center gap-1.5"><Phone size={13} aria-hidden /> {s.phone}</span>)}
            {field("Email", s.email && <a href={`mailto:${s.email}`} className="inline-flex min-w-0 items-start gap-1.5 break-all"><Mail size={13} aria-hidden className="mt-0.5 shrink-0" /> {s.email}</a>)}
            {field("Website", site && <a href={site} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-start gap-1.5 break-all"><Globe size={13} aria-hidden className="mt-0.5 shrink-0" /> {s.website}</a>)}
            {field("GST / Tax ID", s.gstin)}
            {field("Payment Terms", s.payment_terms)}
            {field("Currency", s.currency)}
            {field("Status", <Badge tone={s.is_active ? "green" : "red"}>{s.is_active ? "Active" : "Inactive"}</Badge>)}
            {field("Created On", dateTime(s.created_at))}
            {field("Last Updated", dateTime(s.updated_at))}
          </dl>
        )}
        {tab === "contact" && (
          <dl>
            {field("Contact Person", s.contact_person)}
            {field("Phone", s.phone)}
            {field("Email", s.email)}
            {field("Website", s.website)}
            {field("Address", s.address && <span className="inline-flex gap-1.5"><MapPin size={13} aria-hidden className="mt-0.5 shrink-0" /> {s.address}</span>)}
            {field("Notes", s.notes)}
          </dl>
        )}
        {tab === "orders" && (
          (recent ?? []).length === 0 ? <p className="py-6 text-center text-sm text-muted">No purchase order for this supplier yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(recent ?? []).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><Link href={`/purchase-orders/${o.id}`} className="block font-semibold">{o.po_no}</Link><span className="block text-xs text-muted">{o.order_date}{o.expected_date ? ` · due ${o.expected_date}` : ""}</span></span>
                  <Badge tone={PO_STATUS_TONE[o.status] ?? "gray"}>{PO_STATUS_LABEL[o.status] ?? o.status}</Badge>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat icon={ClipboardList} label="Total Orders" value={orders.count ?? 0} />
        <Stat icon={PackageCheck} label="Receipts Posted" value={received.count ?? 0} />
        <Stat icon={Clock} label="Pending Orders" value={pending.count ?? 0} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href={`/suppliers/${s.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface-muted px-2 text-sm font-semibold hover:bg-brand-soft">
          <SquarePen size={16} aria-hidden /> {canManage ? "Edit Supplier" : "Open"}
        </Link>
        <Link href="/purchase-orders" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface-muted px-2 text-sm font-semibold hover:bg-brand-soft">
          <Building2 size={16} aria-hidden /> View Orders
        </Link>
      </div>
      {canManage && (
        // Suppliers are never deleted (receipts and orders keep pointing at them); they are archived instead.
        <form action={toggleSupplierActive} className="mt-2">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="active" value={s.is_active ? "0" : "1"} />
          <button type="submit" className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${s.is_active ? "border-[var(--danger)] text-[var(--danger)] hover:bg-red-500/10" : "border-[var(--brand)] text-[var(--brand-text)] hover:bg-brand-soft"}`}>
            <Power size={16} aria-hidden /> {s.is_active ? "Archive Supplier" : "Restore Supplier"}
          </button>
        </form>
      )}
    </aside>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-2">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-bold"><Icon size={18} aria-hidden className="text-[var(--brand-text)]" /> {n(value)}</p>
    </div>
  );
}

export const metadata = { title: "Suppliers" };
