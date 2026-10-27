import Link from "next/link";
import {
  AlarmClock, ArrowDownToLine, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Eye, PackagePlus, Printer, Search, SquarePen, Timer, Truck, X, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission, type CurrentUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { CreatePoMenu, PoMenu } from "./po-controls";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "./status";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["items", "Items"], ["receipts", "Receipts"]] as const;
const STATUS_FILTERS = ["DRAFT", "SENT", "PARTIAL", "COMPLETED", "CANCELLED", "OVERDUE"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; po_no: string; order_date: string; expected_date: string | null; status: string; overdue: boolean; place_code: string; place_name: string;
  supplier_id: string; supplier_name: string; supplier_country: string | null; supplier_type: string; items: number; qty: number; value: number | null;
};
type PageData = { total: number; rows: Row[]; suppliers: { id: string; name: string }[]; kpi: { total: number; open: number; sent: number; partial: number; completed: number; overdue: number; new_month: number } };
const EMPTY: PageData = { total: 0, rows: [], suppliers: [], kpi: { total: 0, open: 0, sent: 0, partial: 0, completed: 0, overdue: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN");
const inr = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const TYPE_STYLE = {
  IMPORT: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  LOCAL: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
} as const;
const TypeBadge = ({ type }: { type: string }) => (
  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${type === "IMPORT" ? TYPE_STYLE.IMPORT : TYPE_STYLE.LOCAL}`}>{type === "IMPORT" ? "Import" : "Domestic"}</span>
);
const StatusBadge = ({ status, overdue }: { status: string; overdue?: boolean }) => (
  <span className="inline-flex flex-wrap items-center gap-1"><Badge tone={PO_STATUS_TONE[status] ?? "gray"}>{PO_STATUS_LABEL[status] ?? status}</Badge>{overdue && <Badge tone="red">Overdue</Badge>}</span>
);

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("purchase.view", "purchase.create", "purchase.approve");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const supplier = z.uuid().safeParse(first(sp.supplier)).data ?? "";
  const type = ["IMPORT", "LOCAL"].includes(first(sp.type) ?? "") ? first(sp.type)! : "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_orders_page", {
    p_q: q || null, p_supplier: supplier || null, p_type: type || null, p_status: status === "all" ? null : status,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? rows[0]?.id ?? null);

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, supplier: supplier || undefined, type: type || undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/purchase-orders?${s}` : "/purchase-orders";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, supplier, type, status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canCreate = can(user, "purchase.create");
  const canApprove = can(user, "purchase.approve");
  const canCost = can(user, "receipts.cost");
  const filtersOn = !!(q || supplier || type || from || to || status !== "all");
  const showPanel = !!selId;

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Purchase &amp; Import</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Purchase Orders</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Purchase Orders</h1>
          <p className="mt-1 text-sm text-muted">Create and manage your orders to suppliers. Track what was ordered, what has arrived and what is still due.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/purchase-orders/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canCreate && <CreatePoMenu />}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={ClipboardList} tint="blue" label="Total Purchase Orders" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={Timer} tint="violet" label="Open Orders" value={n(kpi.open)} href={keep({ status: "SENT", page: undefined, sel: undefined })} sub={<span className="text-muted">Draft, sent and partly received</span>} />
        <Kpi icon={Truck} tint="orange" label="In Transit" value={n(kpi.sent)} href={keep({ status: "SENT", page: undefined, sel: undefined })} sub={<span className="text-muted">Sent, nothing received yet</span>} />
        <Kpi icon={PackagePlus} tint="amber" label="Received (Partial)" value={n(kpi.partial)} href={keep({ status: "PARTIAL", page: undefined, sel: undefined })} sub={<span className="text-muted">Part of the goods came</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Completed" value={n(kpi.completed)} href={keep({ status: "COMPLETED", page: undefined, sel: undefined })} sub={<span className="text-muted">Fully received or closed</span>} />
        <Kpi icon={AlarmClock} tint="red" label="Overdue" value={n(kpi.overdue)} href={keep({ status: "OVERDUE", page: undefined, sel: undefined })} sub={<span className="font-medium text-red-600">Past expected date</span>} />
      </section>

      <div className={`grid gap-5 ${showPanel ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(12rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end">
            <label className="relative block md:col-span-3 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search PO number, supplier, item" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Supplier" name="supplier" value={supplier}>
              <option value="">All Suppliers</option>
              {result.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Order Type" name="type" value={type}>
              <option value="">All Types</option><option value="IMPORT">Import</option><option value="LOCAL">Domestic</option>
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All Status</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "OVERDUE" ? "Overdue" : PO_STATUS_LABEL[s]}</option>)}
            </FilterSelect>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
              <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
              <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <Link href="/purchase-orders" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No purchase orders found" text={filtersOn ? "Try a different word, or press Clear." : "A purchase order is what you send a supplier. It also shows how much has arrived. You can also make one from the Reorder list."} actionHref={canCreate ? "/purchase-orders/new" : undefined} actionLabel="Create Purchase Order" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>PO Number</th><th>Date</th><th>Supplier</th><th>Order Type</th><th className="text-right">Total Items</th>{canCost && <th className="text-right">Order Value</th>}<th>Expected Delivery</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId;
                    const viewHref = keep({ sel: r.id, tab: undefined });
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.po_no}</Link></td>
                        <td className="whitespace-nowrap">{day(r.order_date)}</td>
                        <td className="min-w-36"><span className="font-medium">{r.supplier_name}</span>{r.supplier_country && <span className="block text-xs text-muted">{r.supplier_country}</span>}</td>
                        <td><TypeBadge type={r.supplier_type} /></td>
                        <td className="text-right font-mono">{n(r.items)}</td>
                        {canCost && <td className="text-right font-mono">{r.value === null ? "" : inr(r.value)}</td>}
                        <td className="whitespace-nowrap">{r.expected_date ? day(r.expected_date) : ""}</td>
                        <td><StatusBadge status={r.status} overdue={r.overdue} /></td>
                        <td>
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.po_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            {r.status === "DRAFT" && canCreate && <Link href={`/purchase-orders/${r.id}`} aria-label={`Edit ${r.po_no}`} title="Edit" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <PoMenu variant="row" id={r.id} status={r.status} canApprove={canApprove} canEdit={r.status === "DRAFT" && canCreate} viewHref={viewHref} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} purchase orders</span>
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

        {showPanel && <Panel selId={selId} tab={tab} keep={keep} user={user} canCost={canCost} canApprove={canApprove} canCreate={canCreate} />}
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
  orange: "bg-[#fdf0e1] text-[#b45f08]", amber: "bg-[#fdf3d0] text-[#8a6a00]", red: "bg-[#fde8e8] text-[#c8302f]",
} as const;

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

type Line = { id: number; quantity: number; received_qty: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

// Side panel: details of the chosen order. Row rules apply, so a person only sees orders they may see.
async function Panel({ selId, tab, keep, user, canCost, canApprove, canCreate }: {
  selId: string | null; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; user: CurrentUser; canCost: boolean; canApprove: boolean; canCreate: boolean;
}) {
  const closeHref = keep({ sel: "none", tab: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";
  if (!selId) return null;

  const supabase = await createClient();
  const { data: o } = await supabase
    .from("purchase_orders")
    .select("id, po_no, supplier_id, location_id, order_date, expected_date, notes, status, created_at, sent_at, closed_at, close_note, suppliers(id, name, country, supplier_type, contact_person, phone, email), locations(code, name)")
    .eq("id", selId).maybeSingle();
  if (!o) return null;

  const { data: lineData } = await supabase.from("purchase_order_lines").select("id, quantity, received_qty, items(internal_item_code, item_name, unit)").eq("po_id", o.id).order("id");
  const lines = (lineData ?? []) as unknown as Line[];
  const { data: costData } = lines.length ? await supabase.from("purchase_order_costs").select("line_id, unit_cost").in("line_id", lines.map((l) => l.id)) : { data: [] };
  const cost = new Map((costData ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  const { data: receiptData } = await supabase.from("goods_receipts").select("id, receipt_no, status, receipt_date").eq("purchase_order_id", o.id).order("created_at");
  const receipts = receiptData ?? [];

  const sup = o.suppliers as unknown as { id: string; name: string; country: string | null; supplier_type: string; contact_person: string | null; phone: string | null; email: string | null } | null;
  const place = o.locations as unknown as { code: string; name: string } | null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const open = o.status === "SENT" || o.status === "PARTIAL";
  const overdue = open && !!o.expected_date && o.expected_date < today;
  const current = await getCurrentLocation(user);
  const canReceiveHere = open && can(user, "receipts.create") && current?.id === o.location_id;

  const totalValue = lines.reduce((s, l) => s + Number(l.quantity) * (cost.get(l.id) ?? 0), 0);
  const receivedValue = lines.reduce((s, l) => s + Math.min(Number(l.received_qty), Number(l.quantity)) * (cost.get(l.id) ?? 0), 0);
  const outstanding = o.status === "CANCELLED" || o.status === "COMPLETED" ? 0 : Math.max(totalValue - receivedValue, 0);
  const anyReceived = lines.some((l) => Number(l.received_qty) > 0);

  // Order progress: what has happened so far.
  const cancelled = o.status === "CANCELLED";
  const steps: { label: string; when: string | null; done: boolean }[] = [
    { label: "Created", when: o.created_at, done: true },
    { label: "Sent to supplier", when: o.sent_at, done: !!o.sent_at },
    { label: "Receiving", when: null, done: o.status === "PARTIAL" || o.status === "COMPLETED" || anyReceived },
    cancelled ? { label: "Cancelled", when: o.closed_at, done: true } : { label: "Completed", when: o.status === "COMPLETED" ? o.closed_at : null, done: o.status === "COMPLETED" },
  ];

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const viewHref = keep({ sel: o.id, tab: undefined });

  return (
    <aside aria-label="Purchase order details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{o.po_no}</h2>
        <div className="flex items-center gap-1">
          <StatusBadge status={o.status} overdue={overdue} />
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>

      <div role="tablist" aria-label="Order sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: o.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>
            {label}{v === "items" ? ` (${lines.length})` : v === "receipts" ? ` (${receipts.length})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            {sup && (
              <div className="rounded-xl border border-line bg-surface-muted p-3">
                <p className="text-xs text-muted">Supplier</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-bold">{sup.name} <TypeBadge type={sup.supplier_type} /></p>
                <p className="text-xs text-muted">{[sup.country, sup.contact_person, sup.phone].filter(Boolean).join(" · ")}</p>
                <Link href={`/suppliers?sel=${sup.id}`} className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-xs font-semibold hover:bg-brand-soft">View Supplier</Link>
              </div>
            )}
            <dl className="mt-2">
              {field("PO Number", o.po_no)}
              {field("Order Date", day(o.order_date))}
              {field("Expected Delivery", o.expected_date ? day(o.expected_date) : "")}
              {field("Deliver To", place && `${place.name} (${place.code})`)}
              {field("Total Items", n(lines.length))}
              {o.close_note && field("Reason for closing", o.close_note)}
              {field("Notes", o.notes)}
            </dl>
            {canCost && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Total Value" value={inr(totalValue)} />
                <Stat label="Received Value" value={inr(receivedValue)} />
                <Stat label="Outstanding" value={inr(outstanding)} />
              </div>
            )}
            <h3 className="mb-2 mt-4 text-sm font-bold">Order Progress</h3>
            <ol className="space-y-0">
              {steps.map((s, i) => (
                <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
                  {i < steps.length - 1 && <span aria-hidden className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${steps[i + 1].done ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]"}`} />}
                  <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${s.done ? (cancelled && i === steps.length - 1 ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "border-2 border-[var(--line-strong)] bg-surface"}`}>
                    {s.done && <Check size={14} aria-hidden />}
                  </span>
                  <span className="min-w-0 text-[13px]"><span className={`block font-medium ${s.done ? "" : "text-muted"}`}>{s.label}</span>{s.when && <span className="block text-xs text-muted">{dateTime(s.when)}</span>}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === "items" && (
          lines.length === 0 ? <p className="py-6 text-center text-sm text-muted">No items on this order.</p> : (
            <ul className="divide-y divide-line text-sm">
              {lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block font-semibold">{l.items?.internal_item_code}</span><span className="block text-xs text-muted">{l.items?.item_name}</span></span>
                  <span className="shrink-0 text-right font-mono text-xs">
                    <span className="block">{n(Number(l.quantity))} {l.items?.unit}</span>
                    <span className="block text-muted">Received {n(Number(l.received_qty))}</span>
                    {canCost && cost.has(l.id) && <span className="block text-muted">@ {inr(cost.get(l.id)!)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "receipts" && (
          receipts.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing received against this order yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {receipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span><Link href={`/receipts/${r.id}`} className="block font-semibold">{r.receipt_no}</Link><span className="block text-xs text-muted">{day(r.receipt_date)}</span></span>
                  <Badge tone={r.status === "POSTED" ? "green" : r.status === "CANCELLED" ? "gray" : "amber"}>{r.status === "DRAFT" ? "Draft" : r.status === "POSTED" ? "Posted" : "Cancelled"}</Badge>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {o.status === "DRAFT" && canCreate ? (
          <Link href={`/purchase-orders/${o.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><SquarePen size={16} aria-hidden /> Edit PO</Link>
        ) : (
          <Link href={`/purchase-orders/${o.id}/print`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><Printer size={16} aria-hidden /> Print PO</Link>
        )}
        {canReceiveHere ? (
          <Link href={`/receipts/new?po=${o.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong"><PackagePlus size={16} aria-hidden /> Receive Items</Link>
        ) : (
          <PoMenu variant="panel" id={o.id} status={o.status} canApprove={canApprove} canEdit={o.status === "DRAFT" && canCreate} viewHref={viewHref} />
        )}
      </div>
      {canReceiveHere && <div className="mt-2"><PoMenu variant="panel" id={o.id} status={o.status} canApprove={canApprove} canEdit={o.status === "DRAFT" && canCreate} viewHref={viewHref} /></div>}
      {open && !canReceiveHere && can(user, "receipts.create") && (
        <p className="mt-2 text-xs text-muted">To receive items, switch your working place to {place?.name} ({place?.code}) first.</p>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-2.5">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-bold">{value}</p>
    </div>
  );
}

export const metadata = { title: "Purchase Orders" };
