import Link from "next/link";
import {
  Archive, ArrowDownToLine, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Eye, IndianRupee, Mail, MapPin, Phone, Power, Search, ShoppingCart, SquarePen,
  Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from "@/lib/validation/customer";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { toggleCustomerActive } from "./actions";
import { AddCustomerMenu, CustomerForm, CustomerRowMenu } from "./customer-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["contact", "Contact"], ["address", "Address"], ["orders", "Orders"], ["notes", "Notes"]] as const;

type Type = (typeof CUSTOMER_TYPES)[number];
type Row = { id: string; code: string; name: string; type: Type; city: string | null; state: string | null; contact_person: string | null; phone: string | null; email: string | null; gstin: string | null; active: boolean; created_at: string; orders: number; sales: number; last_order: string | null };
type PageData = { total: number; rows: Row[]; cities: string[]; kpi: { total: number; active: number; inactive: number; orders: number; sales: number; new_month: number } };
const EMPTY: PageData = { total: 0, rows: [], cities: [], kpi: { total: 0, active: 0, inactive: 0, orders: 0, sales: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN");
const inr = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const TYPE_STYLE: Record<Type, string> = {
  DEALER: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  DISTRIBUTOR: "bg-[#efe9fb] text-[#6d4fd8] dark:bg-[#3a2a66] dark:text-[#c7b4ff]",
  RETAILER: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  OEM: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
  PROJECT: "bg-[#e0f5f0] text-[#0b7d70] dark:bg-[#123a3a] dark:text-[#5fd3c3]",
  GOVERNMENT: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  OTHER: "bg-[#eceff3] text-[#5b6b7c] dark:bg-[#25394a] dark:text-[#b7c6d3]",
};
const AVATAR_COLORS = ["#e5586f", "#35c0e0", "#7ac05a", "#6b7fe0", "#f39a3d", "#9a5fd6", "#2fa58f"];
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const clean = name.replace(/^(DEMO|TEST)\s+/i, "");
  const letters = clean.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "C";
  const color = AVATAR_COLORS[[...clean].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: color, width: size, height: size, fontSize: size * 0.36 }}>{letters}</span>;
}
const TypeBadge = ({ type }: { type: Type }) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[type]}`}>{CUSTOMER_TYPE_LABEL[type]}</span>;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("customers.view", "customers.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const type = (CUSTOMER_TYPES as readonly string[]).includes(first(sp.type) ?? "") ? first(sp.type)! : "";
  const status = ["active", "inactive"].includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const city = (first(sp.city) ?? "").slice(0, 60);
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";
  const mode = first(sp.new) === "1" ? "new" : first(sp.edit) ? "edit" : "view";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customers_page", {
    p_q: q || null, p_type: type || null, p_status: status === "all" ? null : status, p_city: city || null, p_limit: size, p_offset: (page - 1) * size,
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
      q: q || undefined, type: type || undefined, status: status !== "all" ? status : undefined, city: city || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/customers?${s}` : "/customers";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, type, status: status !== "all" ? status : "", city }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canManage = can(user, "customers.manage");
  const pct = (v: number) => (kpi.total > 0 ? `${((v / kpi.total) * 100).toFixed(1)}%` : "0.0%");
  const filtersOn = !!(q || type || city || status !== "all");
  const showPanel = mode !== "view" || !!selId;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Master Data</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Customers</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Customers</h1>
          <p className="mt-1 text-sm text-muted">Manage your customers, dealers and business partners. Keep contact details, addresses and order history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/customers/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canManage && <AddCustomerMenu addHref={keep({ new: "1", sel: undefined, edit: undefined })} />}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi icon={Users} tint="blue" label="Total Customers" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Active Customers" value={n(kpi.active)} href={keep({ status: "active", page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">{pct(kpi.active)}</span>} />
        <Kpi icon={Archive} tint="gray" label="Inactive Customers" value={n(kpi.inactive)} href={keep({ status: "inactive", page: undefined, sel: undefined })} sub={<span className="font-medium text-red-600">{pct(kpi.inactive)}</span>} />
        <Kpi icon={ShoppingCart} tint="blue" label="Total Orders" value={n(kpi.orders)} href="/bills" sub={<span className="text-muted">Bills made to listed customers</span>} />
        <Kpi icon={IndianRupee} tint="violet" label="Total Sales Value" value={inr(kpi.sales)} href="/bills" sub={<span className="text-muted">Voided bills not counted</span>} />
      </section>

      <div className={`grid gap-5 ${showPanel ? "xl:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))_auto_auto] md:items-end">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search name, code, contact, GST, city" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Customer Type" name="type" value={type}>
              <option value="">All Types</option>
              {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>)}
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </FilterSelect>
            <FilterSelect label="City" name="city" value={city}>
              <option value="">All</option>
              {result.cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </FilterSelect>
            <Link href="/customers" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Users} title="No customers found" text={filtersOn ? "Try a different word, or press Clear." : "A customer is who you sell to. Add the first one, then pick them when you make a bill."} actionHref={canManage ? keep({ new: "1" }) : undefined} actionLabel="Add Customer" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>Customer Code</th><th>Customer Name</th><th>Type</th><th>City</th><th>Contact Person</th><th>Status</th><th className="text-right">Orders</th><th className="text-right">Total Sales</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const selected = r.id === selId && mode !== "new";
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={keep({ sel: r.id, tab: undefined, new: undefined, edit: undefined })}>{r.code}</Link></td>
                        <td className="min-w-40"><span className="flex items-center gap-2.5"><Avatar name={r.name} size={32} /><span className="font-medium">{r.name}</span></span></td>
                        <td><TypeBadge type={r.type} /></td>
                        <td>{r.city ?? ""}{r.state && <span className="block text-xs text-muted">{r.state}</span>}</td>
                        <td className="min-w-32">{r.contact_person ?? ""}{r.phone && <span className="block whitespace-nowrap text-xs text-muted">{r.phone}</span>}</td>
                        <td><Badge tone={r.active ? "green" : "red"}>{r.active ? "Active" : "Inactive"}</Badge></td>
                        <td className="text-right font-mono">{n(r.orders)}</td>
                        <td className="text-right font-mono">{inr(r.sales)}</td>
                        <td>
                          <span className="flex items-center gap-1">
                            <Link href={keep({ sel: r.id, tab: undefined, new: undefined, edit: undefined })} aria-label={`View ${r.name}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            {canManage && <Link href={keep({ edit: r.id, new: undefined })} aria-label={`Edit ${r.name}`} title="Edit" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <CustomerRowMenu id={r.id} active={r.active} canManage={canManage} viewHref={keep({ sel: r.id, tab: undefined })} editHref={keep({ edit: r.id, new: undefined })} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} customers</span>
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

        {showPanel && <Panel mode={mode} selId={selId} tab={tab} keep={keep} canManage={canManage} />}
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", gray: "bg-[#eceff3] text-[#5b6b7c]", violet: "bg-[#ece8fb] text-[#6d4fd8]" } as const;

function Kpi({ icon: Icon, tint, label, value, sub, href }: { icon: LucideIcon; tint: keyof typeof TINTS; label: string; value: string; sub: React.ReactNode; href: string }) {
  return (
    <Link href={href} className={`${cardClass} flex items-center gap-4 !p-4 transition hover:border-[var(--brand)] hover:shadow-md`}>
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${TINTS[tint]}`}><Icon size={26} aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className="block text-3xl font-bold leading-9 tracking-tight">{value}</span>
        <span className="block text-xs leading-tight">{sub}</span>
      </span>
    </Link>
  );
}

// Side panel: details of the chosen customer, or the add / edit form. Row rules apply.
async function Panel({ mode, selId, tab, keep, canManage }: { mode: "view" | "new" | "edit"; selId: string | null; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; canManage: boolean }) {
  const closeHref = keep({ sel: "none", new: undefined, edit: undefined, tab: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";

  if (mode === "new" && canManage) {
    return (
      <aside aria-label="Add customer" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Add Customer</h2>
          <Link href={closeHref} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <CustomerForm cancelHref={closeHref} />
      </aside>
    );
  }
  if (!selId) return null;

  const supabase = await createClient();
  const { data: c } = await supabase.from("customers").select("*").eq("id", selId).maybeSingle();
  if (!c) return null;

  if (mode === "edit" && canManage) {
    return (
      <aside aria-label="Edit customer" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Edit Customer</h2>
          <Link href={keep({ sel: c.id, edit: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <p className="mb-3 font-mono text-sm font-semibold">{c.code}</p>
        <CustomerForm
          customer={{ id: c.id, name: c.name, customerType: c.customer_type, gstin: c.gstin, contactPerson: c.contact_person, phone: c.phone, email: c.email, address: c.address, city: c.city, state: c.state, creditLimit: c.credit_limit === null ? null : Number(c.credit_limit), paymentTerms: c.payment_terms, notes: c.notes, isActive: c.is_active }}
          cancelHref={keep({ sel: c.id, edit: undefined })}
        />
      </aside>
    );
  }

  // Bills of this customer (only the bills the person may see), newest first.
  const { data: bills } = await supabase.from("bills").select("id, bill_no, created_at, status, total").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(50);
  const done = (bills ?? []).filter((b) => b.status === "COMPLETED");
  const orders = done.length;
  const sales = done.reduce((a, b) => a + Number(b.total), 0);
  const last = done[0]?.created_at;

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const type = c.customer_type as Type;

  return (
    <aside aria-label="Customer details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{c.code}</h2>
        <div className="flex items-center gap-1">
          <Badge tone={c.is_active ? "green" : "red"}>{c.is_active ? "Active" : "Inactive"}</Badge>
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Avatar name={c.name} size={56} />
        <div className="min-w-0">
          <p className="text-base font-bold">{c.name}</p>
          <p className="text-xs text-muted">{CUSTOMER_TYPE_LABEL[type]}</p>
          <p className="text-xs text-muted">Since {day(c.created_at)}</p>
        </div>
      </div>

      <div role="tablist" aria-label="Customer sections" className="mt-3 flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: c.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>{label}</Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <dl>
            {field("Customer Code", c.code)}
            {field("Company Name", c.name)}
            {field("Customer Type", <TypeBadge type={type} />)}
            {field("GST Number", c.gstin)}
            {field("Contact Person", c.contact_person)}
            {field("Phone", c.phone && <span className="inline-flex items-center gap-1.5"><Phone size={13} aria-hidden /> {c.phone}</span>)}
            {field("Email", c.email && <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-start gap-1.5 break-all"><Mail size={13} aria-hidden className="mt-0.5 shrink-0" /> {c.email}</a>)}
            {field("City", c.city)}
            {field("State", c.state)}
            {field("Credit Limit", c.credit_limit === null ? "" : inr(Number(c.credit_limit)))}
            {field("Payment Terms", c.payment_terms)}
            {field("Status", <Badge tone={c.is_active ? "green" : "red"}>{c.is_active ? "Active" : "Inactive"}</Badge>)}
            {field("Created On", dateTime(c.created_at))}
            {field("Last Updated", dateTime(c.updated_at))}
          </dl>
        )}
        {tab === "contact" && (
          <dl>
            {field("Contact Person", c.contact_person)}
            {field("Phone", c.phone)}
            {field("Email", c.email)}
          </dl>
        )}
        {tab === "address" && (
          <dl>
            {field("Address", c.address && <span className="inline-flex gap-1.5"><MapPin size={13} aria-hidden className="mt-0.5 shrink-0" /> {c.address}</span>)}
            {field("City", c.city)}
            {field("State", c.state)}
          </dl>
        )}
        {tab === "orders" && (
          (bills ?? []).length === 0 ? <p className="py-6 text-center text-sm text-muted">No bill for this customer yet. Pick the customer when you make a bill.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(bills ?? []).slice(0, 10).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><Link href={`/bills/${b.id}`} className="block font-semibold">{b.bill_no}</Link><span className="block text-xs text-muted">{dateTime(b.created_at)}</span></span>
                  <span className="shrink-0 text-right"><span className="block font-mono">{inr(Number(b.total))}</span>{b.status === "VOIDED" && <Badge tone="red">Voided</Badge>}</span>
                </li>
              ))}
            </ul>
          )
        )}
        {tab === "notes" && <p className="whitespace-pre-wrap text-sm">{c.notes || <span className="text-muted">No notes.</span>}</p>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat icon={ShoppingCart} label="Total Orders" value={n(orders)} />
        <Stat icon={IndianRupee} label="Total Sales" value={inr(sales)} />
        <Stat icon={Wallet} label="Credit Limit" value={c.credit_limit === null ? "-" : inr(Number(c.credit_limit))} />
        <Stat icon={CalendarDays} label="Last Order" value={last ? day(last) : "-"} />
      </div>

      {canManage && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href={keep({ edit: c.id, new: undefined })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">
            <SquarePen size={16} aria-hidden /> Edit Customer
          </Link>
          {/* Customers are never deleted (bills point at them); they are switched off instead. */}
          <form action={toggleCustomerActive}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="active" value={c.is_active ? "0" : "1"} />
            <button type="submit" className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${c.is_active ? "border-[var(--danger)] text-[var(--danger)] hover:bg-red-500/10" : "border-[var(--brand)] text-[var(--brand-text)] hover:bg-brand-soft"}`}>
              <Power size={16} aria-hidden /> {c.is_active ? "Deactivate" : "Activate"}
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-2.5">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-base font-bold"><Icon size={17} aria-hidden className="shrink-0 text-[var(--brand-text)]" /> <span className="min-w-0 break-words">{value}</span></p>
    </div>
  );
}

export const metadata = { title: "Customers" };
