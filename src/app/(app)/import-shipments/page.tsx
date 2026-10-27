import Link from "next/link";
import {
  AlarmClock, ArrowDownToLine, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Eye, Search, Ship, SquarePen, Trash2, Truck, X, Anchor, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { CHARGE_TYPES, STATUS_STEPS } from "@/lib/validation/shipment";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { removeShipmentCharge } from "./actions";
import { AddShipmentMenu, ChargeForm, ShipmentForm, ShipmentRowMenu, StatusForm, type FormLine } from "./shipment-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_FILTERS = ["BOOKED", "DISPATCHED", "IN_TRANSIT", "ARRIVED", "CUSTOMS", "DELIVERED", "CANCELLED", "DELAYED"] as const;
const SHORT: Record<string, string> = { ARRIVED: "Arrived", CUSTOMS: "Customs" };
const STATUS_LABEL: Record<string, string> = { ...Object.fromEntries(STATUS_STEPS), CANCELLED: "Cancelled", DELAYED: "Delayed" };

type Row = {
  id: string; shipment_no: string; container_no: string | null; port_loading: string | null; port_discharge: string | null; etd: string | null; eta: string | null;
  status: string; delayed: boolean; po_id: string; po_no: string; supplier_id: string; supplier_name: string; supplier_country: string | null; items: number; value: number | null;
};
type PageData = {
  total: number; rows: Row[]; suppliers: { id: string; name: string }[]; ports_loading: string[]; ports_discharge: string[];
  kpi: { total: number; in_transit: number; arrived: number; customs: number; delivered: number; delayed: number; new_month: number };
};
const EMPTY: PageData = { total: 0, rows: [], suppliers: [], ports_loading: [], ports_discharge: [], kpi: { total: 0, in_transit: 0, arrived: 0, customs: 0, delivered: 0, delayed: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN");
const inr = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const shortDay = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });

const STATUS_STYLE: Record<string, string> = {
  BOOKED: "bg-[#eceff3] text-[#5b6b7c] dark:bg-[#25394a] dark:text-[#b7c6d3]",
  DISPATCHED: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  IN_TRANSIT: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  ARRIVED: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  CUSTOMS: "bg-[#efe9fb] text-[#6d4fd8] dark:bg-[#3a2a66] dark:text-[#c7b4ff]",
  DELIVERED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  CANCELLED: "bg-[#eceff3] text-[#5b6b7c] dark:bg-[#25394a] dark:text-[#b7c6d3]",
  DELAYED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const StatusPill = ({ status, delayed }: { status: string; delayed?: boolean }) => {
  const key = delayed ? "DELAYED" : status;
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[key]}`}>{STATUS_LABEL[key]}</span>;
};

export default async function ImportShipmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("shipments.view", "shipments.manage");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const supplier = z.uuid().safeParse(first(sp.supplier)).data ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const pol = (first(sp.pol) ?? "").slice(0, 80);
  const pod = (first(sp.pod) ?? "").slice(0, 80);
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const TABS = can(user, "receipts.cost")
    ? ([["overview", "Overview"], ["items", "Items"], ["charges", "Charges"], ["history", "History"]] as const)
    : ([["overview", "Overview"], ["items", "Items"], ["history", "History"]] as const);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";
  const canManage = can(user, "shipments.manage");
  const mode = canManage && first(sp.new) === "1" ? "new" : canManage && first(sp.edit) ? "edit" : "view";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_shipments_page", {
    p_q: q || null, p_supplier: supplier || null, p_status: status === "all" ? null : status, p_pol: pol || null, p_pod: pod || null,
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
      q: q || undefined, supplier: supplier || undefined, status: status !== "all" ? status : undefined, pol: pol || undefined, pod: pod || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/import-shipments?${s}` : "/import-shipments";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, supplier, status: status !== "all" ? status : "", pol, pod }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canCost = can(user, "receipts.cost");
  const filtersOn = !!(q || supplier || pol || pod || status !== "all");
  const showPanel = mode !== "view" || !!selId;
  const addHref = keep({ new: "1", sel: undefined, edit: undefined, po: undefined });

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Purchase &amp; Import</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Import Shipments</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Import Shipments</h1>
          <p className="mt-1 text-sm text-muted">Track and manage all international shipments from suppliers. Monitor shipping status, customs clearance, charges and arrival.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/import-shipments/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canManage && <AddShipmentMenu addHref={addHref} />}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Ship} tint="blue" label="Total Shipments" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={Truck} tint="violet" label="In Transit" value={n(kpi.in_transit)} href={keep({ status: "IN_TRANSIT", page: undefined, sel: undefined })} sub={<span className="text-muted">Dispatched or on the way</span>} />
        <Kpi icon={Anchor} tint="orange" label="Arrived at Port" value={n(kpi.arrived)} href={keep({ status: "ARRIVED", page: undefined, sel: undefined })} sub={<span className="text-muted">Waiting for customs</span>} />
        <Kpi icon={ClipboardCheck} tint="green" label="Customs Clearance" value={n(kpi.customs)} href={keep({ status: "CUSTOMS", page: undefined, sel: undefined })} sub={<span className="text-muted">In clearance</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Delivered" value={n(kpi.delivered)} href={keep({ status: "DELIVERED", page: undefined, sel: undefined })} sub={<span className="text-muted">Reached the place</span>} />
        <Kpi icon={AlarmClock} tint="red" label="Delayed" value={n(kpi.delayed)} href={keep({ status: "DELAYED", page: undefined, sel: undefined })} sub={<span className="font-medium text-red-600">Past ETA</span>} />
      </section>

      <div className={`grid gap-5 ${showPanel ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(12rem,2fr)_repeat(4,minmax(0,1fr))_auto_auto] 2xl:items-end">
            <label className="relative block md:col-span-2 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search shipment no, PO, container, supplier, port" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Supplier" name="supplier" value={supplier}>
              <option value="">All Suppliers</option>
              {result.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All Status</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </FilterSelect>
            <FilterSelect label="Port of Loading" name="pol" value={pol}>
              <option value="">All Ports</option>
              {result.ports_loading.map((p) => <option key={p} value={p}>{p}</option>)}
            </FilterSelect>
            <FilterSelect label="Port of Discharge" name="pod" value={pod}>
              <option value="">All Ports</option>
              {result.ports_discharge.map((p) => <option key={p} value={p}>{p}</option>)}
            </FilterSelect>
            <Link href="/import-shipments" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={Ship} title="No import shipments found" text={filtersOn ? "Try a different word, or press Clear." : "A shipment is the goods of one purchase order on their way from an import supplier. Add the first one."} actionHref={canManage ? addHref : undefined} actionLabel="Add Import Shipment" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>Shipment No.</th><th>PO Number</th><th>Supplier</th><th>Container No.</th><th>Port of Loading</th><th>Port of Discharge</th><th>ETD</th><th>ETA</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId && mode !== "new";
                    const viewHref = keep({ sel: r.id, tab: undefined, new: undefined, edit: undefined });
                    const editable = canManage && (r.status === "BOOKED" || r.status === "DISPATCHED");
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.shipment_no}</Link></td>
                        <td className="whitespace-nowrap text-[13px]"><Link href={`/purchase-orders?sel=${r.po_id}`}>{r.po_no}</Link></td>
                        <td className="min-w-32 font-medium">{r.supplier_name}</td>
                        <td className="whitespace-nowrap font-mono text-xs">{r.container_no ?? ""}</td>
                        <td className="min-w-24">{r.port_loading ?? ""}</td>
                        <td className="min-w-24">{r.port_discharge ?? ""}</td>
                        <td className="whitespace-nowrap">{r.etd ? day(r.etd) : ""}</td>
                        <td className="whitespace-nowrap">{r.eta ? day(r.eta) : ""}</td>
                        <td><StatusPill status={r.status} delayed={r.delayed} /></td>
                        <td>
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.shipment_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            {editable && <Link href={keep({ edit: r.id, new: undefined })} aria-label={`Edit ${r.shipment_no}`} title="Edit" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <ShipmentRowMenu viewHref={viewHref} editHref={editable ? keep({ edit: r.id, new: undefined }) : null} poHref={`/purchase-orders?sel=${r.po_id}`} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} shipments</span>
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

        {showPanel && <Panel mode={mode} selId={selId} tab={tab} tabs={TABS} keep={keep} canManage={canManage} canCost={canCost} po={z.uuid().safeParse(first(sp.po)).data ?? null} />}
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
        <span className="block text-3xl font-bold leading-9 tracking-tight">{value}</span>
        <span className="block text-xs leading-tight">{sub}</span>
      </span>
    </Link>
  );
}

type PoLine = { id: number; quantity: number; received_qty: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

// Side panel: details of the chosen shipment, or the add / edit form. Row rules apply.
async function Panel({ mode, selId, tab, tabs, keep, canManage, canCost, po }: {
  mode: "view" | "new" | "edit"; selId: string | null; tab: string; tabs: readonly (readonly [string, string])[]; keep: (extra: Record<string, string | number | undefined>) => string;
  canManage: boolean; canCost: boolean; po: string | null;
}) {
  const closeHref = keep({ sel: "none", new: undefined, edit: undefined, tab: undefined, po: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";
  const supabase = await createClient();

  // Lines of an order with how much is still free to put on a shipment (not counting the shipment being edited).
  async function formLines(poId: string, exceptShipment: string | null, own: Map<number, number>): Promise<FormLine[]> {
    const { data: pl } = await supabase.from("purchase_order_lines").select("id, quantity, received_qty, items(internal_item_code, item_name, unit)").eq("po_id", poId).order("id");
    const lines = (pl ?? []) as unknown as PoLine[];
    const { data: used } = lines.length
      ? await supabase.from("import_shipment_lines").select("po_line_id, quantity, shipment_id, import_shipments!inner(status)").in("po_line_id", lines.map((l) => l.id)).neq("import_shipments.status", "CANCELLED")
      : { data: [] };
    const taken = new Map<number, number>();
    for (const u of (used ?? []) as { po_line_id: number; quantity: number; shipment_id: string }[]) {
      if (u.shipment_id === exceptShipment) continue;
      taken.set(u.po_line_id, (taken.get(u.po_line_id) ?? 0) + Number(u.quantity));
    }
    return lines
      .map((l) => {
        const free = Math.max(Number(l.quantity) - Number(l.received_qty) - (taken.get(l.id) ?? 0), 0);
        return { poLineId: l.id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "", ordered: Number(l.quantity), free, qty: own.has(l.id) ? String(own.get(l.id)) : exceptShipment ? "" : String(free || "") };
      })
      .filter((l) => l.free > 0 || own.has(l.poLineId));
  }

  if (mode === "new") {
    if (!po) {
      const { data: orders } = await supabase
        .from("purchase_orders").select("id, po_no, status, suppliers!inner(name, supplier_type)").in("status", ["SENT", "PARTIAL"]).eq("suppliers.supplier_type", "IMPORT").order("created_at", { ascending: false }).limit(200);
      const list = (orders ?? []) as unknown as { id: string; po_no: string; suppliers: { name: string } }[];
      return (
        <aside aria-label="Add import shipment" className={`${cardClass} ${shell}`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Add Import Shipment</h2>
            <Link href={closeHref} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
          <p className="mb-3 text-sm text-muted">Step 1: choose the purchase order whose goods are shipped. Only sent orders of Import suppliers are listed.</p>
          {list.length === 0 ? <p className="rounded-lg border border-line bg-surface-muted p-3 text-sm">No open import purchase order. Send a purchase order to an Import supplier first.</p> : (
            <form method="get" className="space-y-3">
              <input type="hidden" name="new" value="1" />
              <label className="block"><span className="mb-1 block text-xs text-muted">Purchase order</span>
                <select name="po" required className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm">
                  {list.map((o) => <option key={o.id} value={o.id}>{o.po_no} - {o.suppliers.name}</option>)}
                </select></label>
              <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong">Next</button>
            </form>
          )}
        </aside>
      );
    }
    const { data: order } = await supabase.from("purchase_orders").select("id, po_no, status, suppliers(supplier_type)").eq("id", po).maybeSingle();
    const ok = order && (order.status === "SENT" || order.status === "PARTIAL") && (order.suppliers as unknown as { supplier_type: string } | null)?.supplier_type === "IMPORT";
    if (!order || !ok) return (
      <aside aria-label="Add import shipment" className={`${cardClass} ${shell}`}>
        <p role="alert" className="text-sm text-[var(--danger)]">This purchase order cannot be shipped (it must be sent, not completed, and belong to an Import supplier).</p>
        <Link href={keep({ new: "1", po: undefined })} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold">Choose another</Link>
      </aside>
    );
    const lines = await formLines(order.id, null, new Map());
    return (
      <aside aria-label="Add import shipment" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Add Import Shipment</h2>
          <Link href={closeHref} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        {lines.length === 0 ? <p className="text-sm text-muted">Everything on this order is already on a shipment or received.</p> : (
          <ShipmentForm poId={order.id} poNo={order.po_no} lines={lines} cancelHref={closeHref} />
        )}
      </aside>
    );
  }
  if (!selId) return null;

  const { data: s } = await supabase.from("import_shipments").select("*, purchase_orders(id, po_no, location_id, suppliers(id, name, country))").eq("id", selId).maybeSingle();
  if (!s) return null;
  const order = s.purchase_orders as unknown as { id: string; po_no: string; suppliers: { id: string; name: string; country: string | null } };
  const { data: sl } = await supabase.from("import_shipment_lines").select("id, po_line_id, quantity").eq("shipment_id", s.id).order("id");
  const shipLines = sl ?? [];
  const own = new Map(shipLines.map((l) => [l.po_line_id as number, Number(l.quantity)]));

  if (mode === "edit" && canManage && (s.status === "BOOKED" || s.status === "DISPATCHED")) {
    const lines = await formLines(order.id, s.id, own);
    return (
      <aside aria-label="Edit import shipment" className={`${cardClass} ${shell}`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Edit Shipment</h2>
          <Link href={keep({ sel: s.id, edit: undefined })} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link></div>
        <p className="mb-3 font-mono text-sm font-semibold">{s.shipment_no}</p>
        <ShipmentForm
          poId={order.id} poNo={order.po_no} lines={lines} cancelHref={keep({ sel: s.id, edit: undefined })}
          shipment={{ id: s.id, containerNo: s.container_no, blNo: s.bl_no, portLoading: s.port_loading, portDischarge: s.port_discharge, etd: s.etd, eta: s.eta, shippingLine: s.shipping_line, vessel: s.vessel, incoterms: s.incoterms, notes: s.notes }}
        />
      </aside>
    );
  }

  // Item names for the lines, prices (only with receipts.cost), events and charges.
  const { data: poLines } = shipLines.length
    ? await supabase.from("purchase_order_lines").select("id, items(internal_item_code, item_name, unit)").in("id", shipLines.map((l) => l.po_line_id))
    : { data: [] };
  const itemOf = new Map(((poLines ?? []) as unknown as { id: number; items: { internal_item_code: string; item_name: string; unit: string } | null }[]).map((l) => [l.id, l.items]));
  const { data: costs } = canCost && shipLines.length ? await supabase.from("purchase_order_costs").select("line_id, unit_cost").in("line_id", shipLines.map((l) => l.po_line_id)) : { data: [] };
  const cost = new Map((costs ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  const { data: events } = await supabase.from("import_shipment_events").select("status, event_date, note").eq("shipment_id", s.id).order("id");
  const { data: charges } = canCost ? await supabase.from("import_shipment_charges").select("id, charge_type, amount, note").eq("shipment_id", s.id).order("id") : { data: [] };

  const totalValue = shipLines.reduce((a, l) => a + Number(l.quantity) * (cost.get(l.po_line_id) ?? 0), 0);
  const expenses = (charges ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const delayed = s.status !== "DELIVERED" && s.status !== "CANCELLED" && !!s.eta && s.eta < today;
  const evDate = new Map((events ?? []).map((e) => [e.status as string, e.event_date as string]));
  const cancelled = s.status === "CANCELLED";
  const reached = STATUS_STEPS.findIndex(([v]) => v === s.status);
  const lastReached = Math.max(reached, ...STATUS_STEPS.map(([v], i) => (evDate.has(v) ? i : -1)));
  const nextOptions = s.status === "DELIVERED" || cancelled ? [] : [...STATUS_STEPS.slice(Math.max(reached, 0) + 1), ["CANCELLED", "Cancelled"] as const];

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const chargeLabel = new Map<string, string>(CHARGE_TYPES);

  return (
    <aside aria-label="Shipment details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{s.shipment_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={s.status} delayed={delayed} />
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>

      <div role="tablist" aria-label="Shipment sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {tabs.map(([v, label]) => (
          <Link key={v} href={keep({ sel: s.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>
            {label}{v === "items" ? ` (${shipLines.length})` : v === "charges" ? ` (${(charges ?? []).length})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            <div className="rounded-xl border border-line bg-surface-muted p-3">
              <p className="text-xs text-muted">Supplier</p>
              <p className="mt-0.5 text-sm font-bold">{order.suppliers.name}</p>
              <p className="text-xs text-muted">{order.suppliers.country ?? ""}</p>
              <Link href={`/suppliers?sel=${order.suppliers.id}`} className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-xs font-semibold hover:bg-brand-soft">View Supplier</Link>
            </div>
            <dl className="mt-2">
              {field("Shipment No.", s.shipment_no)}
              {field("PO Number", <Link href={`/purchase-orders?sel=${order.id}`}>{order.po_no}</Link>)}
              {field("Container No.", s.container_no)}
              {field("BL / AWB No.", s.bl_no)}
              {field("Port of Loading", s.port_loading)}
              {field("Port of Discharge", s.port_discharge)}
              {field("ETD", s.etd && day(s.etd))}
              {field("ETA (Expected)", s.eta && day(s.eta))}
              {field("Shipping Line", s.shipping_line)}
              {field("Vessel / Flight", s.vessel)}
              {field("Incoterms", s.incoterms)}
              {field("Status", <StatusPill status={s.status} delayed={delayed} />)}
              {field("Notes", s.notes)}
            </dl>
            <h3 className="mb-2 mt-4 text-sm font-bold">Shipment Progress</h3>
            <ol className="grid grid-cols-6 gap-0.5 text-center">
              {STATUS_STEPS.map(([v, label], i) => {
                const done = !cancelled && i <= lastReached;
                const current = !cancelled && i === reached;
                return (
                  <li key={v} className="relative min-w-0">
                    {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[11px] h-0.5 w-full ${!cancelled && i <= lastReached ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]"}`} />}
                    <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white ${done ? "bg-[var(--brand)]" : "border-2 border-[var(--line-strong)] bg-surface"} ${current ? "ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-[var(--surface)]" : ""}`}>
                      {done && <Check size={13} aria-hidden />}
                    </span>
                    <span className={`mt-1 block break-words px-0 text-[9px] leading-tight ${done ? "font-medium" : "text-muted"}`}>{SHORT[v] ?? label}</span>
                    <span className="block text-[10px] leading-tight text-muted">{evDate.has(v) ? shortDay(evDate.get(v)!) : ""}</span>
                  </li>
                );
              })}
            </ol>
            {cancelled && <p className="mt-2 text-center text-xs font-medium text-[var(--danger)]">This shipment was cancelled{evDate.has("CANCELLED") ? ` on ${day(evDate.get("CANCELLED")!)}` : ""}.</p>}
          </>
        )}

        {tab === "items" && (
          shipLines.length === 0 ? <p className="py-6 text-center text-sm text-muted">No items on this shipment.</p> : (
            <ul className="divide-y divide-line text-sm">
              {shipLines.map((l) => {
                const it = itemOf.get(l.po_line_id);
                return (
                  <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{it?.internal_item_code}</span><span className="block text-xs text-muted">{it?.item_name}</span></span>
                    <span className="shrink-0 text-right font-mono text-xs">
                      <span className="block">{n(Number(l.quantity))} {it?.unit}</span>
                      {canCost && cost.has(l.po_line_id) && <span className="block text-muted">@ {inr(cost.get(l.po_line_id)!)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === "charges" && canCost && (
          <>
            {(charges ?? []).length === 0 ? <p className="py-4 text-center text-sm text-muted">No charges added yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {(charges ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0"><span className="block font-semibold">{chargeLabel.get(c.charge_type) ?? c.charge_type}</span>{c.note && <span className="block text-xs text-muted">{c.note}</span>}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono">{inr(Number(c.amount))}</span>
                      {canManage && (
                        <form action={removeShipmentCharge}>
                          <input type="hidden" name="id" value={s.id} /><input type="hidden" name="chargeId" value={c.id} />
                          <button type="submit" aria-label="Remove charge" title="Remove" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Trash2 size={16} aria-hidden /></button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && !cancelled && <ChargeForm id={s.id} />}
          </>
        )}

        {tab === "history" && (
          (events ?? []).length === 0 ? <p className="py-6 text-center text-sm text-muted">No history.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(events ?? []).map((e, i) => (
                <li key={i} className="py-2"><span className="flex items-center justify-between gap-3"><span className="font-semibold">{STATUS_LABEL[e.status as string] ?? e.status}</span><span className="text-xs text-muted">{day(e.event_date as string)}</span></span>{e.note && <span className="block text-xs text-muted">{e.note}</span>}</li>
              ))}
            </ul>
          )
        )}
      </div>

      <div className={`mt-4 grid gap-2 ${canCost ? "grid-cols-3" : "grid-cols-1"}`}>
        <Stat label="Total Items" value={n(shipLines.length)} />
        {canCost && <Stat label="Total Value" value={inr(totalValue)} />}
        {canCost && <Stat label="Expenses" value={inr(expenses)} />}
      </div>

      {canManage && nextOptions.length > 0 && <div className="mt-3"><StatusForm id={s.id} options={nextOptions} today={today} /></div>}
      {canManage && (s.status === "BOOKED" || s.status === "DISPATCHED") && (
        <Link href={keep({ edit: s.id, new: undefined })} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">
          <SquarePen size={16} aria-hidden /> Edit Shipment
        </Link>
      )}
      <p className="mt-2 text-xs text-muted">Stock grows only when the goods are received (Goods Inward), not when a shipment is marked delivered.</p>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-2.5">
      <p className="text-[11px] leading-tight text-muted">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

export const metadata = { title: "Import Shipments" };
