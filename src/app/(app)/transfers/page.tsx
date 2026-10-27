import Link from "next/link";
import {
  ArrowDownToLine, ArrowLeftRight, Ban, Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, FileText, Plus, Printer, Search, SquarePen, Truck, X as XIcon, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { can, requireAnyPermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { sanitizeSearch } from "@/lib/validation/item";
import { RowsPerPage } from "../items/item-controls";
import { PrintButton } from "../stock/movements/ledger-controls";
import { ReceiveForm, type RLine } from "./receive-form";
import { RecallButton } from "./recall-button";
import { TransferEditor, type Destination } from "./transfer-editor";
import { TransferRowMenu } from "./transfer-menu";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const STATUS_FILTERS = ["DRAFT", "SENT", "RECEIVED", "CANCELLED"] as const;
const STATUS_LABEL: Record<string, string> = { DRAFT: "Draft", SENT: "In Transit", RECEIVED: "Completed", CANCELLED: "Cancelled" };
const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-[#eceff3] text-[#5b6b7c] dark:bg-[#25394a] dark:text-[#b7c6d3]",
  SENT: "bg-[#fdf0e1] text-[#b45f08] dark:bg-[#4a3410] dark:text-[#f5c068]",
  RECEIVED: "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]",
  CANCELLED: "bg-[#fde8e8] text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]",
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: string; transfer_no: string; status: string; has_shortage: boolean; created_at: string; from_location_id: string; from_name: string; to_location_id: string; to_name: string;
  items: number; qty: number; requested_by: string | null;
};
type PageData = {
  total: number; rows: Row[]; places: { id: string; name: string }[];
  kpi: { total: number; completed: number; in_transit: number; cancelled: number; draft: number; new_month: number };
};
const EMPTY: PageData = { total: 0, rows: [], places: [], kpi: { total: 0, completed: 0, in_transit: 0, cancelled: 0, draft: 0, new_month: 0 } };

const n = (v: number) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
const StatusPill = ({ status, shortage }: { status: string; shortage?: boolean }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
    {shortage && <span className="inline-flex rounded-md bg-[#fde8e8] px-2 py-0.5 text-xs font-medium text-[#c8302f] dark:bg-[#4a1c1c] dark:text-[#f5a0a0]">Shortage</span>}
  </span>
);

export default async function StockTransferPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("transfers.view", "transfers.create", "transfers.send", "transfers.receive");
  const sp = await searchParams;

  const q = sanitizeSearch(first(sp.q));
  const fromPlace = z.uuid().safeParse(first(sp.fromp)).data ?? "";
  const toPlace = z.uuid().safeParse(first(sp.top)).data ?? "";
  const status = (STATUS_FILTERS as readonly string[]).includes(first(sp.status) ?? "") ? first(sp.status)! : "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 10;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const canCreate = can(user, "transfers.create");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transfers_page", {
    p_q: q || null, p_from_location: fromPlace || null, p_to_location: toPlace || null, p_status: status === "all" ? null : status,
    p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size,
  });
  const result = (data ?? EMPTY) as PageData;
  const rows = result.rows;
  const kpi = result.kpi;
  const total = Number(result.total);
  const lastPage = Math.max(1, Math.ceil(total / size));

  const selParam = first(sp.sel);
  const selId = selParam === "none" ? null : (z.uuid().safeParse(selParam).data ?? (first(sp.p) === "create" ? null : rows[0]?.id) ?? null);
  // The panel has two tabs: "create" (the form) and "details" (the chosen transfer). Create is first when no transfer was chosen.
  const panel = first(sp.p) === "details" || (selParam && selParam !== "none" && first(sp.p) !== "create") ? "details" : canCreate && (first(sp.p) === "create" || !selParam) ? "create" : "details";

  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const base: Record<string, string | number | undefined> = {
      q: q || undefined, fromp: fromPlace || undefined, top: toPlace || undefined, status: status !== "all" ? status : undefined, from: from || undefined, to: to || undefined,
      size: size !== 10 ? size : undefined, page: page > 1 ? page : undefined, sel: selParam, p: first(sp.p),
    };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    const s = params.toString();
    return s ? `/transfers?${s}` : "/transfers";
  };
  const filterOnly = new URLSearchParams(Object.entries({ q, fromp: fromPlace, top: toPlace, status: status !== "all" ? status : "", from, to }).filter(([, v]) => v) as [string, string][]).toString();

  const pages: (number | "gap")[] = [];
  const windowEnd = Math.min(lastPage, Math.max(5, page + 2));
  for (let p = Math.max(1, windowEnd - 4); p <= windowEnd; p++) pages.push(p);
  if (windowEnd < lastPage) pages.push("gap", lastPage);

  const filtersOn = !!(q || fromPlace || toPlace || from || to || status !== "all");

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Inventory</span> <ChevronRight size={14} aria-hidden />
            <span className="font-medium text-[var(--foreground)]">Stock Transfer</span>
          </nav>
          <h1 className="!text-3xl !font-bold">Stock Transfer</h1>
          <p className="mt-1 text-sm text-muted">Transfer stock between warehouses and shops. Stock leaves when a transfer is sent and arrives when the other place receives it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <a href={`/transfers/export${filterOnly ? `?${filterOnly}` : ""}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted">
            <ArrowDownToLine size={18} aria-hidden /> Export
          </a>
          <PrintButton />
          {canCreate && (
            <Link href={keep({ p: "create", sel: undefined })} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
              <Plus size={18} aria-hidden /> New Stock Transfer
            </Link>
          )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ArrowLeftRight} tint="blue" label="Total Transfers" value={n(kpi.total)} href={keep({ status: undefined, page: undefined, sel: undefined })} sub={<span className="font-medium text-green-700 dark:text-green-400">+{kpi.new_month} this month</span>} />
        <Kpi icon={CheckCircle2} tint="green" label="Completed" value={n(kpi.completed)} href={keep({ status: "RECEIVED", page: undefined, sel: undefined })} sub={<span className="text-muted">Received by the other place</span>} />
        <Kpi icon={Truck} tint="orange" label="In Transit" value={n(kpi.in_transit)} href={keep({ status: "SENT", page: undefined, sel: undefined })} sub={<span className="text-muted">On the way</span>} />
        <Kpi icon={Ban} tint="red" label="Cancelled" value={n(kpi.cancelled)} href={keep({ status: "CANCELLED", page: undefined, sel: undefined })} sub={<span className="text-muted">No stock effect</span>} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section className={`${cardClass} min-w-0 !p-4`}>
          <form method="get" className="mb-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-[minmax(10rem,2fr)_repeat(5,minmax(0,1fr))_auto_auto] 2xl:items-end print:hidden">
            <label className="relative block md:col-span-3 2xl:col-span-1">
              <span className="sr-only">Search</span>
              <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input name="q" defaultValue={q} placeholder="Search transfer no, SKU, item name" autoComplete="off"
                className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" />
            </label>
            <FilterSelect label="From Warehouse" name="fromp" value={fromPlace}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="To Warehouse" name="top" value={toPlace}>
              <option value="">All Warehouses</option>
              {result.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FilterSelect>
            <FilterSelect label="Status" name="status" value={status}>
              <option value="all">All Status</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </FilterSelect>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span>
              <input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span>
              <input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
            <Link href="/transfers" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
            <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong">
              <Search size={16} aria-hidden /> Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <EmptyState icon={ArrowLeftRight} title="No transfers found" text={filtersOn ? "Try a different word, or press Clear." : "A transfer moves goods from one of your places to another. Start one from the form on the right."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="dash-table w-full text-left text-sm">
                <thead>
                  <tr><th>#</th><th>Transfer No.</th><th>Date</th><th>From Warehouse</th><th>To Warehouse</th><th className="text-right">Items</th><th className="text-right">Total Qty</th><th>Status</th><th>Requested By</th><th className="print:hidden">Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const selected = r.id === selId && panel === "details";
                    const viewHref = keep({ sel: r.id, p: "details" });
                    return (
                      <tr key={r.id} aria-selected={selected} className={selected ? "!bg-brand-soft" : ""}>
                        <td className="text-muted">{(page - 1) * size + i + 1}</td>
                        <td className="whitespace-nowrap text-[13px] font-semibold"><Link href={viewHref}>{r.transfer_no}</Link></td>
                        <td className="whitespace-nowrap">{day(r.created_at)}</td>
                        <td className="min-w-28">{r.from_name}</td>
                        <td className="min-w-28">{r.to_name}</td>
                        <td className="text-right font-mono">{n(r.items)}</td>
                        <td className="text-right font-mono">{n(r.qty)}</td>
                        <td><StatusPill status={r.status} shortage={r.has_shortage} /></td>
                        <td className="whitespace-nowrap">{r.requested_by ?? ""}</td>
                        <td className="print:hidden">
                          <span className="flex items-center gap-1">
                            <Link href={viewHref} aria-label={`View ${r.transfer_no}`} title="View" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Eye size={18} aria-hidden /></Link>
                            {r.status === "DRAFT" && canCreate && <Link href={`/transfers/${r.id}`} aria-label={`Edit ${r.transfer_no}`} title="Edit draft" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><SquarePen size={18} aria-hidden /></Link>}
                            <TransferRowMenu id={r.id} viewHref={viewHref} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
            <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {n(total)} transfers</span>
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

        <aside aria-label="Transfer" className={`${cardClass} h-fit min-w-0 !p-4 xl:sticky xl:top-20 print:hidden`}>
          <div role="tablist" aria-label="Transfer panel" className="mb-3 grid grid-cols-2 border-b border-line text-sm">
            {canCreate ? (
              <Link href={keep({ p: "create", sel: undefined })} role="tab" aria-selected={panel === "create"}
                className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "create" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Create Transfer</Link>
            ) : <span />}
            <Link href={keep({ p: "details", sel: selId ?? rows[0]?.id })} role="tab" aria-selected={panel === "details"}
              className={`-mb-px min-h-11 border-b-2 py-2.5 text-center font-semibold ${panel === "details" ? "border-[var(--brand)] text-[var(--brand-text)]" : "border-transparent text-muted"}`}>Transfer Details</Link>
          </div>
          {panel === "create" ? <CreatePanel user={user} /> : <DetailsPanel selId={selId} keep={keep} user={user} />}
        </aside>
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

const TINTS = { blue: "bg-[#e5effd] text-[#1d62c9]", green: "bg-[#e3f6ec] text-[#16824f]", orange: "bg-[#fdf0e1] text-[#b45f08]", red: "bg-[#fde8e8] text-[#c8302f]" } as const;

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

// "Create Transfer": the same form as the full page. The sending place is the place the person works in (change it at the top).
async function CreatePanel({ user }: { user: Awaited<ReturnType<typeof requireAnyPermission>> }) {
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet. Ask an administrator.</p>;
  const supabase = await createClient();
  const { data } = await supabase.rpc("transfer_destinations");
  const destinations = ((data ?? []) as Destination[]).filter((d) => d.id !== loc.id);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">A draft does not change stock. Stock leaves {loc.name} when you send it, and arrives only when the other place receives it. To send from another place, switch your working place at the top.</p>
      <TransferEditor transferId={null} transferNo={null} fromName={`${loc.name} (${loc.code})`} destinations={destinations}
        initialTo="" initialNotes="" initialLines={[]} canSend={can(user, "transfers.send")} />
    </div>
  );
}

type LineRow = { id: number; item_id: string; quantity_sent: number; quantity_received: number | null; items: { internal_item_code: string; item_name: string; unit: string } | null };

async function DetailsPanel({ selId, keep, user }: { selId: string | null; keep: (extra: Record<string, string | number | undefined>) => string; user: Awaited<ReturnType<typeof requireAnyPermission>> }) {
  if (!selId) return <p className="py-6 text-center text-sm text-muted">Choose a transfer from the list to see it here.</p>;
  const supabase = await createClient();
  const { data: t } = await supabase.from("stock_transfers").select("*").eq("id", selId).maybeSingle();
  if (!t) return <p className="py-6 text-center text-sm text-muted">This transfer was not found, or you may not see it.</p>;
  const { data: lineData } = await supabase.from("stock_transfer_lines").select("id, item_id, quantity_sent, quantity_received, items(internal_item_code, item_name, unit)").eq("transfer_id", t.id).order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];
  const { data: who } = await supabase.rpc("person_name", { p_id: t.created_by });

  const mine = new Set((await getMyLocations(user)).map((l) => l.id));
  const canReceive = t.status === "SENT" && mine.has(t.to_location_id) && can(user, "transfers.receive");
  const canRecall = t.status === "SENT" && mine.has(t.from_location_id) && can(user, "transfers.send");
  const canEditDraft = t.status === "DRAFT" && mine.has(t.from_location_id) && can(user, "transfers.create");

  let receiveLines: RLine[] = [];
  if (canReceive) {
    const { data: units } = await supabase.from("units").select("code, decimals");
    const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
    receiveLines = lines.map((l) => ({ itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "PCS", decimals: dec.get(l.items?.unit ?? "PCS") ?? 0, sent: Number(l.quantity_sent) }));
  }

  const totalSent = lines.reduce((a, l) => a + Number(l.quantity_sent), 0);
  const totalGot = lines.reduce((a, l) => a + Number(l.quantity_received ?? 0), 0);
  const cancelled = t.status === "CANCELLED";
  const steps = [
    { label: "Created", when: t.created_at as string | null, done: true, bad: false },
    { label: "Sent", when: t.sent_at as string | null, done: !!t.sent_at, bad: false },
    cancelled ? { label: "Cancelled", when: null, done: true, bad: true } : { label: "Received", when: t.received_at as string | null, done: t.status === "RECEIVED", bad: false },
  ];
  const field = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="break-words">{value || "-"}</dd></div>
  );

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold">{t.transfer_no}</h2>
        <div className="flex items-center gap-1">
          <StatusPill status={t.status} shortage={t.has_shortage} />
          <Link href={keep({ sel: "none", p: undefined })} aria-label="Close details" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-muted"><XIcon size={20} aria-hidden /></Link>
        </div>
      </div>
      <dl>
        {field("Date", day(t.created_at))}
        {field("From Warehouse", `${t.from_name} (${t.from_code})`)}
        {field("To Warehouse", `${t.to_name} (${t.to_code})`)}
        {field("Requested By", who as string | null)}
        {field("Total Items", n(lines.length))}
        {field("Qty Sent", n(totalSent))}
        {t.status === "RECEIVED" && field("Qty Received", n(totalGot))}
        {field("Remarks", t.notes)}
        {t.receive_note && field("Receiving Note", t.receive_note)}
      </dl>

      <h3 className="mb-2 mt-3 text-sm font-bold">Transfer Progress</h3>
      <ol className="grid grid-cols-3 gap-1 text-center">
        {steps.map((s, i) => (
          <li key={s.label} className="relative min-w-0">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[11px] h-0.5 w-full ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "bg-[var(--line-strong)]"}`} />}
            <span className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full text-white ${s.done ? (s.bad ? "bg-[var(--danger)]" : "bg-[var(--brand)]") : "border-2 border-[var(--line-strong)] bg-surface"}`}>
              {s.done && (s.bad ? <XIcon size={13} aria-hidden /> : <Check size={13} aria-hidden />)}
            </span>
            <span className={`mt-1 block text-[11px] leading-tight ${s.done ? "font-medium" : "text-muted"}`}>{s.label}</span>
            <span className="block text-[10px] leading-tight text-muted">{s.when ? dateTime(s.when) : ""}</span>
          </li>
        ))}
      </ol>

      <h3 className="mb-1 mt-3 text-sm font-bold">Items</h3>
      <ul className="divide-y divide-line text-sm">
        {lines.map((l) => {
          const short = l.quantity_received !== null && Number(l.quantity_received) < Number(l.quantity_sent);
          return (
            <li key={l.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0"><span className="block font-semibold">{l.items?.internal_item_code}</span><span className="block truncate text-xs text-muted">{l.items?.item_name}</span></span>
              <span className="shrink-0 text-right font-mono text-xs">
                <span className="block">{n(Number(l.quantity_sent))} {l.items?.unit}</span>
                {t.status === "RECEIVED" && <span className={`block ${short ? "font-semibold text-[var(--danger)]" : "text-muted"}`}>got {n(Number(l.quantity_received ?? 0))}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {canReceive && <div className="mt-3 rounded-xl border border-line bg-surface-muted p-3"><p className="mb-2 text-sm font-semibold">Receive this transfer</p><ReceiveForm transferId={t.id} lines={receiveLines} /></div>}
      {canRecall && <div className="mt-3"><RecallButton transferId={t.id} /></div>}
      {t.status === "SENT" && !canReceive && !canRecall && <p className="mt-3 text-xs text-muted">The goods are on the way. The receiving place will receive them.</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/transfers/${t.id}/print`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><Printer size={16} aria-hidden /> Print Note</Link>
        <Link href={`/transfers/${t.id}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--brand)] bg-surface text-sm font-semibold text-[var(--brand-text)] hover:bg-brand-soft"><FileText size={16} aria-hidden /> {canEditDraft ? "Edit Draft" : "Open Full Page"}</Link>
      </div>
    </div>
  );
}

export const metadata = { title: "Stock Transfer" };
