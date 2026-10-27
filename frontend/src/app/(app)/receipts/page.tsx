import Link from "next/link";
import {
  ArrowDownToLine, Ban, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Eye, FileText, PackageCheck, PackageOpen, PackagePlus, Printer, Search, X, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { CreateGrnMenu, GrnMenu } from "./receipt-controls";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const TABS = [["overview", "Overview"], ["items", "Items"], ["history", "History"]] as const;
const STATUS_FILTERS = ["DRAFT", "POSTED", "PARTIAL", "CANCELLED"] as const;
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", POSTED: "Posted", PARTIAL: "Partly received", CANCELLED: "Cancelled" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; receipt_no: string; receipt_date: string; status: string; supplier_invoice_no: string | null; place_code: string; place_name: string; supplier_id: string;
  supplier_name: string; supplier_country: string | null; source: string; po_id: string | null; po_no: string | null; partial: boolean; items: number; qty: number;
};
type PageData = {
  total: number; rows: Row[]; suppliers: { id: string; name: string }[]; places: { id: string; name: string }[];
  kpi: { total: number; today: number; draft: number; posted: number; partial: number; cancelled: number; new_month: number };
};
const EMPTY: PageData = { total: 0, rows: [], suppliers: [], places: [], kpi: { total: 0, today: 0, draft: 0, posted: 0, partial: 0, cancelled: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const inr = (v: number) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const SOURCE_STYLE = {
  IMPORT: "bg-[#e5effd] text-[#1d62c9] dark:bg-[#1c3a66] dark:text-[#9ec5ff]",
  LOCAL: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
} as const;
const SourceBadge = ({ source }: { source: string }) => (
  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${source === "IMPORT" ? SOURCE_STYLE.IMPORT : SOURCE_STYLE.LOCAL}`}>{source === "IMPORT" ? "Import" : "Domestic"}</span>
);
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  POSTED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  PARTIAL: "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]",
  CANCELLED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const StatusPill = ({ status, partial }: { status: string; partial?: boolean }) => {
  const key = partial ? "PARTIAL" : status;
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[key]}`}>{STATUS_LABEL[key]}</span>;
};

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("receipts.view", "receipts.create", "receipts.post");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const place = z.uuid().safeParse(first(sp.place)).data ?? "";
  const supplier = z.uuid().safeParse(first(sp.supplier)).data ?? "";
  const source = ["IMPORT", "LOCAL"].includes(first(sp.source) ?? "") ? first(sp.source)! : "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const tab = TABS.some(([v]) => v === first(sp.tab)) ? first(sp.tab)! : "overview";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receipts_page", {
    p_q: q || null, p_location: place || null, p_supplier: supplier || null, p_source: source || null, p_status: status === "all" ? null : status,
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
      q: q || undefined, place: place || undefined, supplier: supplier || undefined, source: source || undefined, status: status !== "all" ? status : undefined,
      from: from || undefined, to: to || undefined, size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, tab: tab !== "overview" ? tab : undefined,
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/receipts?${s}` : "/receipts";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, place, supplier, source, status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const canCreate = can(user, "receipts.create");
  const filtersOn = !!(q || place || supplier || source || from || to || status !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Purchase &amp; Import</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Goods Inward (GRN)</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Goods Inward (GRN)</h1>
          <p className="mt-1 text-sm text-muted">Record and manage goods received from suppliers (domestic and import). Stock goes up when a receipt is posted.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a href={`/receipts/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          {canCreate && <CreateGrnMenu />}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={PackageOpen} tint="blue" label="Total GRNs" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={PackagePlus} tint="violet" label="Received Today" value={n(kpi.today)} href={keep({ status: "POSTED", from: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), to: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }), page: undefined, sel: undefined })} sub={<span className="text-muted">Posted today</span>} />
        <Kpi icon={ClipboardList} tint="orange" label="Pending (Draft)" value={n(kpi.draft)} href={keep({ status: "DRAFT", page: undefined, sel: undefined })} sub={<span className="text-muted">Not posted yet</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Posted (Stocked)" value={n(kpi.posted)} href={keep({ status: "POSTED", page: undefined, sel: undefined })} sub={<span className="text-muted">Stock was added</span>} />
        <Kpi icon={PackageCheck} tint="amber" label="Partly Received" value={n(kpi.partial)} href={keep({ status: "PARTIAL", page: undefined, sel: undefined })} sub={<span className="text-muted">Order still waits for goods</span>} />
        <Kpi icon={Ban} tint="red" label="Cancelled" value={n(kpi.cancelled)} href={keep({ status: "CANCELLED", page: undefined, sel: undefined })} sub={<span className="text-muted">No stock effect</span>} />
      </section>

      <div className={`grid gap-5 ${selId ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(12rem,2fr)_repeat(6,minmax(0,1fr))_auto_auto] 2xl:items-end">
            <label className="relative block md:col-span-3 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search GRN no, PO, supplier, invoice, item" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="Warehouse" name="place" value={place}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Supplier" name="supplier" value={supplier}>
              <option value="">All Suppliers</option>
              {result.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Source" name="source" value={source}>
              <option value="">All (Domestic/Import)</option><option value="LOCAL">Domestic</option><option value="IMPORT">Import</option>
            </FilterSelect>
            <FilterSelect label="GRN Status" name="status" value={status}>
              <option value="all">All Status</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </FilterSelect>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
              <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
              <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <Link href="/receipts" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={PackageCheck} title="No goods receipts found" text={filtersOn ? "Try a different word, or press Clear." : "A receipt records goods that arrived. Stock goes up when you post it."} actionHref={canCreate ? "/receipts/new" : undefined} actionLabel="Create GRN" />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>GRN No.</th><th>Date</th><th>PO Number</th><th>Supplier</th><th>Source</th><th>Warehouse</th><th className="text-right">Total Items</th><th className="text-right">Received Qty</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId;
                    const viewHref = keep({ sel: r.id, tab: undefined });
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.receipt_no}</Link></td>
                        <td className="whitespace-nowrap">{day(r.receipt_date)}</td>
                        <td className="whitespace-nowrap text-[13px]">{r.po_id && r.po_no ? <Link href={`/purchase-orders?sel=${r.po_id}`}>{r.po_no}</Link> : ""}</td>
                        <td className="min-w-32 font-medium">{r.supplier_name}</td>
                        <td><SourceBadge source={r.source} /></td>
                        <td className="min-w-24">{r.place_name}</td>
                        <td className="text-right font-mono">{n(r.items)}</td>
                        <td className="text-right font-mono">{n(r.qty)}</td>
                        <td><StatusPill status={r.status} partial={r.partial} /></td>
                        <td>
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.receipt_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            <Link href={`/receipts/${r.id}/print`} aria-label={`Print ${r.receipt_no}`} title="Print" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Printer size={18} aria-hidden /></Link>
                            <GrnMenu variant="row" id={r.id} poId={r.po_no ? r.po_id : null} viewHref={viewHref} />
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
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} GRNs</span>
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

        {selId && <Panel selId={selId} tab={tab} keep={keep} canCost={can(user, "receipts.cost")} />}
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

type Line = { id: number; quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

// Side panel: details of the chosen receipt. Row rules apply, so a person only sees receipts they may see.
async function Panel({ selId, tab, keep, canCost }: { selId: string; tab: string; keep: (extra: Record<string, string | number | undefined>) => string; canCost: boolean }) {
  const closeHref = keep({ sel: "none", tab: undefined });
  const shell = "h-fit min-w-0 !p-4 xl:sticky xl:top-20";
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("goods_receipts")
    .select("id, receipt_no, receipt_date, supplier_invoice_no, notes, status, created_at, posted_at, purchase_order_id, suppliers(id, name, country, supplier_type), locations(code, name)")
    .eq("id", selId).maybeSingle();
  if (!r) return null;

  const { data: lineData } = await supabase.from("goods_receipt_lines").select("id, quantity, items(internal_item_code, item_name, unit)").eq("receipt_id", r.id).order("id");
  const lines = (lineData ?? []) as unknown as Line[];
  const { data: costData } = canCost && lines.length ? await supabase.from("goods_receipt_costs").select("line_id, unit_cost").in("line_id", lines.map((l) => l.id)) : { data: [] };
  const cost = new Map((costData ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  let po: { id: string; po_no: string; status: string } | null = null;
  if (r.purchase_order_id) {
    const { data } = await supabase.from("purchase_orders").select("id, po_no, status").eq("id", r.purchase_order_id).maybeSingle();
    po = data;
  }

  const sup = r.suppliers as unknown as { id: string; name: string; country: string | null; supplier_type: string };
  const place = r.locations as unknown as { code: string; name: string };
  const partial = r.status === "POSTED" && po?.status === "PARTIAL";
  const totalQty = lines.reduce((a, l) => a + Number(l.quantity), 0);
  const totalValue = lines.reduce((a, l) => a + Number(l.quantity) * (cost.get(l.id) ?? 0), 0);
  const cancelled = r.status === "CANCELLED";
  const posted = r.status === "POSTED";

  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );
  const steps = [
    { label: "Created", when: r.created_at as string, done: true, bad: false },
    cancelled ? { label: "Cancelled", when: null, done: true, bad: true } : { label: "Stock Updated", when: r.posted_at as string | null, done: posted, bad: false },
  ];

  return (
    <aside aria-label="Goods receipt details" className={`${cardClass} ${shell}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{r.receipt_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={r.status} partial={partial} />
          <Link href={closeHref} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><X size={20} aria-hidden /></Link>
        </div>
      </div>

      <div role="tablist" aria-label="Receipt sections" className="flex flex-wrap gap-1 border-b border-line text-sm">
        {TABS.map(([v, label]) => (
          <Link key={v} href={keep({ sel: r.id, tab: v === "overview" ? undefined : v })} role="tab" aria-selected={tab === v}
            className={`-mb-px min-h-10 border-b-2 px-2 py-2 font-medium ${tab === v ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted hover:text-[var(--foreground)]"}`}>
            {label}{v === "items" ? ` (${lines.length})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-3">
        {tab === "overview" && (
          <>
            <div className="rounded-xl border border-line bg-surface-muted p-3">
              <p className="text-xs text-muted">Supplier</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-bold">{sup.name} <SourceBadge source={sup.supplier_type} /></p>
              <p className="text-xs text-muted">{sup.country ?? ""}</p>
              <Link href={`/suppliers?sel=${sup.id}`} className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-[var(--line-strong)] bg-surface px-3 text-xs font-semibold hover:bg-brand-soft">View Supplier</Link>
            </div>
            <dl className="mt-2">
              {field("GRN Number", r.receipt_no)}
              {field("PO Number", po ? <Link href={`/purchase-orders?sel=${po.id}`}>{po.po_no}</Link> : r.purchase_order_id ? "(order not visible to you)" : "")}
              {field("Invoice No.", r.supplier_invoice_no)}
              {field("Received Date", day(r.receipt_date))}
              {field("Warehouse", `${place.name} (${place.code})`)}
              {field("Source", <SourceBadge source={sup.supplier_type} />)}
              {field("Total Items", n(lines.length))}
              {field("Total Received Qty", n(totalQty))}
              {canCost && field("Total Value", totalValue > 0 ? inr(totalValue) : "")}
              {field("Status", <StatusPill status={r.status} partial={partial} />)}
              {field("Remarks", r.notes)}
            </dl>
            <h3 className="mb-2 mt-4 text-sm font-bold">Receiving Progress</h3>
            <ol className="grid grid-cols-2 gap-1 text-center">
              {steps.map((s, i) => (
                <li key={s.label} className="relative min-w-0">
                  {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[11px] h-0.5 w-full ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "bg-[var(--line-strong)]"}`} />}
                  <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "border-2 border-[var(--line-strong)] bg-surface"}`}>
                    {s.done && (s.bad ? <X size={13} aria-hidden /> : <Check size={13} aria-hidden />)}
                  </span>
                  <span className={`mt-1 block text-[11px] leading-tight ${s.done ? "font-medium" : "text-muted"}`}>{s.label}</span>
                  <span className="block text-[10px] leading-tight text-muted">{s.when ? dateTime(s.when) : ""}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {tab === "items" && (
          lines.length === 0 ? <p className="py-6 text-center text-sm text-muted">No items on this receipt.</p> : (
            <ul className="divide-y divide-line text-sm">
              {lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block font-semibold">{l.items?.internal_item_code}</span><span className="block text-xs text-muted">{l.items?.item_name}</span></span>
                  <span className="shrink-0 text-right font-mono text-xs">
                    <span className="block">{n(Number(l.quantity))} {l.items?.unit}</span>
                    {canCost && cost.has(l.id) && <span className="block text-muted">@ {inr(cost.get(l.id)!)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}

        {tab === "history" && (
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between gap-3 py-2"><span className="font-semibold">Created</span><span className="text-xs text-muted">{dateTime(r.created_at)}</span></li>
            {r.posted_at && <li className="flex items-center justify-between gap-3 py-2"><span className="font-semibold">Posted (stock added)</span><span className="text-xs text-muted">{dateTime(r.posted_at)}</span></li>}
            {cancelled && <li className="py-2 font-semibold">Cancelled</li>}
          </ul>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/receipts/${r.id}/print`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><Printer size={16} aria-hidden /> Print GRN</Link>
        <Link href={`/receipts/${r.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--brand)] bg-surface text-sm font-semibold text-[var(--brand-text)] hover:bg-brand-soft"><FileText size={16} aria-hidden /> {r.status === "DRAFT" ? "Open / Post" : "Open GRN"}</Link>
      </div>
    </aside>
  );
}

export const metadata = { title: "Goods Inward (GRN)" };
