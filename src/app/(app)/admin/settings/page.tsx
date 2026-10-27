import Link from "next/link";
import {
  AppWindow, Archive, Bell, Boxes, Building2, ChevronLeft, ChevronRight, ClipboardList, FileText, History, Layers, Mail, Palette, Search, Settings, ShieldCheck, ShoppingCart, SlidersHorizontal, Plug, type LucideIcon,
} from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { isBillingEnabled } from "@/lib/settings";
import { cardClass } from "@/lib/ui";
import { RowsPerPage } from "../../items/item-controls";
import { BillingSwitch } from "./billing-switch";
import { CompanyForm } from "./company-form";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SIZES = [10, 25, 50, 100];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TABS = [
  { key: "general", label: "General", icon: Settings }, { key: "company", label: "Company", icon: Building2 }, { key: "modules", label: "Modules", icon: AppWindow },
  { key: "inventory", label: "Inventory", icon: Boxes }, { key: "sales", label: "Sales", icon: ShoppingCart }, { key: "purchase", label: "Purchase", icon: ClipboardList },
  { key: "notifications", label: "Notifications", icon: Bell }, { key: "integrations", label: "Integrations", icon: Plug }, { key: "backup", label: "Backup & Data", icon: Archive },
  { key: "appearance", label: "Appearance", icon: Palette }, { key: "audit", label: "Audit Log", icon: FileText },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type AuditRow = { id: number; at: string; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> | null; actor_name: string | null };

const dateTime = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === first(sp.tab)) ? (first(sp.tab) as TabKey) : "general";
  const [company, billing] = await Promise.all([getCompany(), isBillingEnabled()]);

  return (
    <main className="space-y-5">
      <div>
        <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-sm text-muted">
          <Link href="/dashboard">Dashboard</Link> <ChevronRight size={14} aria-hidden /> <span>Administration</span> <ChevronRight size={14} aria-hidden />
          <span className="font-medium text-[var(--foreground)]">Settings</span>
        </nav>
        <h1 className="!text-3xl !font-bold">System Settings</h1>
        <p className="mt-1 text-sm text-muted">Company information, billing switch and the audit log work now. Settings that are not built yet are shown switched off with the words &quot;Not built yet&quot;, so nothing looks active that does nothing.</p>
      </div>

      <div role="tablist" aria-label="Settings sections" className={`${cardClass} flex flex-wrap gap-1 !p-1.5 text-sm`}>
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "general" ? "/admin/settings" : `/admin/settings?tab=${t.key}`} role="tab" aria-selected={t.key === tab}
            className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 font-semibold ${t.key === tab ? "bg-brand-soft text-[var(--brand-text)]" : "text-muted hover:bg-surface-muted"}`}>
            <t.icon size={16} aria-hidden /> {t.label}
          </Link>
        ))}
      </div>

      {tab === "general" && (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <Card icon={Building2} title="Business Information" text="Basic company details. Printed on papers." works>
            <CompanyForm company={company} />
          </Card>
          <Card icon={SlidersHorizontal} title="System Preferences" text="General system behaviour and preferences." works={false} badge="Fixed">
            <Fact label="Default Date Format" value="DD MMM YYYY (14 Oct 2026)" />
            <Fact label="Default Currency" value="INR (₹) - Indian Rupee" />
            <Fact label="Time Zone" value="(GMT+05:30) Asia/Kolkata" />
            <Fact label="Default Language" value="English or Hindi (each person chooses at the top)" />
            <Toggle label="Enable Multi-warehouse" hint="Warehouses and shops are always on (Locations)" on />
            <Toggle label="Enable Batch / Serial Tracking" hint="No batch or serial tracking exists" notBuilt />
            <Toggle label="Enable Approval Workflow" hint="Approvals are always on for stock changes and returns; they follow the permissions" on />
            <Toggle label="Allow Negative Stock" hint="Stock can never go below zero (the database refuses it)" notBuilt />
          </Card>
          <Card icon={Mail} title="Email & Notifications" text="Needs an e-mail service." works={false} badge="Not built yet">
            <Fact label="SMTP Server / Port / Password" value="Not built yet" />
            <Toggle label="Order Notifications" hint="New sales order notifications" notBuilt />
            <Toggle label="Low Stock Alerts" hint="The bell at the top already shows low stock" notBuilt />
            <Toggle label="Purchase Order Notifications" hint="PO creation and status updates" notBuilt />
            <Toggle label="Daily Stock Report" hint="Receive a daily stock summary" notBuilt />
          </Card>
          <Card icon={FileText} title="Document Settings" text="How document numbers look (fixed for now)." works={false} badge="Fixed">
            <Fact label="Sales Order" value="SO-2026-0001" />
            <Fact label="Purchase Order" value="PO-000001" />
            <Fact label="Goods Receipt (GRN)" value="GRN-000001" />
            <Fact label="Return" value="RT-2026-0001" />
            <Fact label="Dispatch / Picking" value="Use the sales order number" />
            <p className="text-xs text-muted">Changing prefixes and the next number is not built yet.</p>
          </Card>
          <Card icon={Layers} title="Inventory Settings" text="How stock is counted and valued." works={false} badge="Fixed">
            <Fact label="Default Valuation Method" value="Average Cost (FIFO is not built)" />
            <Fact label="Low Stock Alert Threshold" value="Set per item and place (Min level)" />
            <Fact label="Default Reorder Level" value="Set per item and place" />
            <Toggle label="Enable Location (Racks)" hint="Racks and bins are on (Locations page)" on />
            <Toggle label="Enable Expiry Tracking" hint="No expiry dates exist" notBuilt />
            <Toggle label="Enable Stock Valuation" hint="Stock Valuation report is on" on />
            <Toggle label="Enable Physical Count" hint="Physical Count page is on" on />
          </Card>
          <Card icon={ShieldCheck} title="Security Settings" text="Sign-in protection." works={false} badge="Mixed">
            <Fact label="Session Timeout / Password Expiry" value="Set in Supabase, not here" />
            <Toggle label="Two Factor Authentication" hint="Not built yet" notBuilt />
            <Toggle label="Restrict IP Access" hint="Not built yet" notBuilt />
            <Toggle label="Audit Log" hint="Always on: every important change is recorded (see the Audit Log tab)" on />
            <Toggle label="Login Attempt Limit" hint="Handled by Supabase, not set here" notBuilt />
          </Card>
        </div>
      )}

      {tab === "company" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card icon={Building2} title="Business Information" text="Basic company details. Printed on papers." works><CompanyForm company={company} /></Card>
          <section className={`${cardClass} !p-5`}>
            <h2 className="mb-1 text-base font-bold">How it looks on a printed paper</h2>
            <p className="mb-3 text-xs text-muted">Pick list, shipping label, goods receipt, purchase order, transfer note and bill use this heading.</p>
            <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-white p-4 text-black">
              <p className="text-lg font-bold">{company.name}</p>
              {company.tagline && <p className="text-xs italic">{company.tagline}</p>}
              <p className="mt-1 text-xs">{[company.address, company.phone, company.email, company.website].filter(Boolean).join(" · ") || "Address, phone and e-mail appear here once you fill them in."}</p>
              {(company.gst || company.pan) && <p className="text-xs">{company.gst && `GSTIN ${company.gst}`}{company.gst && company.pan ? " · " : ""}{company.pan && `PAN ${company.pan}`}</p>}
            </div>
            <p className="mt-3 text-xs text-muted">The logo is a file in the project and cannot be changed here yet.</p>
          </section>
        </div>
      )}

      {tab === "modules" && (
        <section className={`${cardClass} !p-5`}>
          <h2 className="mb-3 text-base font-bold">Modules</h2>
          <div className="overflow-x-auto"><table className="dash-table w-full text-left text-sm">
            <thead><tr><th>Module</th><th>What it does</th><th>Status</th></tr></thead>
            <tbody>
              {[
                ["Products / SKU, Categories, Suppliers, Customers", "Master data"], ["Warehouses and Locations (Racks)", "Places and bins"], ["Purchase Orders, Import Shipments, Goods Inward, Quality Check", "Buying and receiving"],
                ["Current Stock, Stock Ledger, Transfers, Adjustments, Physical Count", "Stock"], ["Sales Orders, Picking & Packing, Dispatch, Returns", "Selling and sending"], ["Reports (Inventory, Purchase, Sales, Stock Valuation)", "Analysis"], ["Users & Roles, Settings", "Administration"],
              ].map(([m, d]) => <tr key={m}><td className="font-semibold">{m}</td><td>{d}</td><td><span className="rounded-md bg-[#e3f6ec] px-2 py-0.5 text-xs font-medium text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]">Always on</span></td></tr>)}
              <tr><td className="font-semibold">Shop Billing</td><td>Shop bills that reduce stock</td><td><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${billing ? "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]" : "bg-[#fdf3d0] text-[#8a6a00] dark:bg-[#4a3d10] dark:text-[#f2d166]"}`}>{billing ? "ON" : "OFF"}</span></td></tr>
            </tbody>
          </table></div>
          <div className="mt-5 space-y-3 rounded-xl border border-line bg-surface-muted p-4">
            <h3 className="font-bold">Billing in this system</h3>
            <p className="text-sm">Status: <strong className={billing ? "text-green-700 dark:text-green-400" : "text-amber-600"}>{billing ? "ON" : "OFF"}</strong></p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted">
              <li>While OFF, no one can make a bill here (the database refuses it, not only the menu). Your billing stays in Zoho.</li>
              <li>While ON, a bill made here reduces the stock of that shop at once, and the bill shows the item&apos;s Selling Item Name.</li>
              <li>Do not bill the same sale in both Zoho and here, or stock will be reduced twice or not at all. While billing is OFF the stock here does not go down with Zoho sales: correct it with a stock count.</li>
              <li>These bills have no tax yet (no GST, no tax invoice number). They are not tax invoices.</li>
              <li>Voiding a bill (stock comes back) still works while billing is OFF.</li>
            </ul>
            <BillingSwitch enabled={billing} />
          </div>
        </section>
      )}

      {tab === "inventory" && (
        <Facts title="Inventory" rows={[
          ["Valuation", "Average cost of posted goods receipts (Stock Valuation page). FIFO is not built."], ["Units", "Units and their decimals are managed on the Products page (Units)."],
          ["Minimum / maximum levels", "Set per item and place on Current Stock; the automatic reorder uses them."], ["Negative stock", "Never allowed: the database refuses it."],
          ["Batch / serial / expiry", "Not built."], ["Reserved stock", "Orders do not reserve stock; stock leaves when an order is dispatched."],
        ]} />
      )}
      {tab === "sales" && (
        <Facts title="Sales" rows={[
          ["Sales channels", "Website, Amazon, Flipkart, Meesho, Direct, Other (fixed list)."], ["Order flow", "Pending, Confirmed, In Packing, Dispatched, Cancelled."], ["Tax", "No GST / tax on orders or bills yet (waits for the accountant)."],
          ["Payments", "No customer payments are recorded (no Payment Status)."], ["Couriers", "Added from the Dispatch page (Add a courier)."], ["Returns", "Good items go back into stock when a return is approved."],
        ]} />
      )}
      {tab === "purchase" && (
        <Facts title="Purchase" rows={[
          ["Order flow", "Draft, Sent, Partly received, Completed, Cancelled."], ["Buying prices", "Seen only by people with the cost permission."], ["Payments to suppliers", "Not recorded (no Payment Status)."],
          ["Import shipments", "One shipment belongs to one purchase order; the status is set by hand."], ["Quality check", "One check per posted goods receipt; it is only a record."],
        ]} />
      )}
      {tab === "notifications" && <NotBuilt icon={Bell} title="Notifications" text="E-mail and SMS notifications need an outside e-mail / SMS service (paid, needs your approval). The bell at the top already shows low stock and waiting approvals." />}
      {tab === "integrations" && <NotBuilt icon={Plug} title="Integrations" text="Connections to Amazon, Flipkart, couriers, Zoho or accounting software are not built. Each needs its own outside service and keys." />}
      {tab === "backup" && <NotBuilt icon={Archive} title="Backup & Data" text="Backups are done by Supabase (database backups depend on your Supabase plan). Nothing can be backed up or restored from this page yet. Every report page has a CSV download." />}
      {tab === "appearance" && (
        <section className={`${cardClass} !p-5`}>
          <h2 className="mb-2 text-base font-bold">Appearance</h2>
          <p className="text-sm text-muted">Light and dark theme and English / Hindi are chosen by each person with the buttons at the top of the screen (the sun / moon button and the language button). There is no company-wide theme setting.</p>
        </section>
      )}
      {tab === "audit" && <AuditLog sp={sp} />}
    </main>
  );
}

async function AuditLog({ sp }: { sp: SearchParams }) {
  const q = (first(sp.q) ?? "").replace(/[^\p{L}\p{N}@ ._+-]/gu, "").slice(0, 60).trim();
  const entity = z.string().regex(/^[a-z_]{1,60}$/).safeParse(first(sp.entity)).data ?? "all";
  const from = DATE.test(first(sp.from) ?? "") ? first(sp.from)! : "";
  const to = DATE.test(first(sp.to) ?? "") ? first(sp.to)! : "";
  const size = SIZES.includes(Number(first(sp.size))) ? Number(first(sp.size)) : 20;
  const page = Math.min(Math.max(parseInt(first(sp.page) ?? "1", 10) || 1, 1), 100000);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_audit_page", { p_q: q || null, p_entity: entity === "all" ? null : entity, p_from: from || null, p_to: to || null, p_limit: size, p_offset: (page - 1) * size });
  const r = (data ?? { total: 0, rows: [], entities: [] }) as { total: number; rows: AuditRow[]; entities: string[] };
  const total = Number(r.total);
  const lastPage = Math.max(1, Math.ceil(total / size));
  const keep = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams({ tab: "audit" });
    const base: Record<string, string | number | undefined> = { q: q || undefined, entity: entity !== "all" ? entity : undefined, from: from || undefined, to: to || undefined, size: size !== 20 ? size : undefined, page: page > 1 ? page : undefined };
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== undefined && v !== "") params.set(k, String(v));
    return `/admin/settings?${params.toString()}`;
  };
  const what = (a: AuditRow) => {
    const d = a.details ?? {};
    const row = ((d.new ?? d.old) as Record<string, unknown> | undefined) ?? d;
    const bits = [row.key, row.name, row.email, row.order_no, row.po_no, row.return_no, row.bill_no, row.code, row.item_name].filter((x) => typeof x === "string" && x) as string[];
    return bits.slice(0, 2).join(" · ");
  };
  return (
    <section className={`${cardClass} min-w-0 !p-5`}>
      <h2 className="mb-1 text-base font-bold">Audit Log</h2>
      <p className="mb-3 text-sm text-muted">Every important change in the system, newest first: who did it, what, and when.</p>
      <form method="get" className="mb-4 grid gap-3 md:grid-cols-4 xl:grid-cols-[minmax(10rem,2fr)_repeat(3,minmax(0,1fr))_auto_auto] xl:items-end">
        <input type="hidden" name="tab" value="audit" />
        <label className="relative block md:col-span-4 xl:col-span-1"><span className="sr-only">Search</span><Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search person, action, id" autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-3 text-base md:text-sm" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Area</span>
          <select name="entity" defaultValue={entity} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm"><option value="all">All areas</option>{r.entities.map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Date From</span><input type="date" name="from" defaultValue={from} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Date To</span><input type="date" name="to" defaultValue={to} className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" /></label>
        <Link href="/admin/settings?tab=audit" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
        <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong"><Search size={16} aria-hidden /> Filter</button>
      </form>
      {error && <p role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{friendlyDbError(error)}</p>}
      {r.rows.length === 0 ? <EmptyState icon={History} title="Nothing found" text="Try a different word, or press Clear." /> : (
        <div className="overflow-x-auto"><table className="dash-table w-full text-left text-sm">
          <thead><tr><th>Time</th><th>Done by</th><th>Area</th><th>Action</th><th>About</th></tr></thead>
          <tbody>{r.rows.map((a) => <tr key={a.id}><td className="whitespace-nowrap">{dateTime(a.at)}</td><td>{a.actor_name ?? "-"}</td><td>{a.entity}</td><td>{a.action}</td><td className="max-w-64 truncate text-muted">{what(a)}</td></tr>)}</tbody>
        </table></div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">Showing {total === 0 ? 0 : (page - 1) * size + 1} to {Math.min(page * size, total)} of {total.toLocaleString("en-IN")} entries</span>
        <nav aria-label="Pagination" className="flex items-center gap-1.5">
          {page > 1 ? <Link href={keep({ page: page - 1 })} aria-label="Previous page" className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-line bg-surface px-2 hover:bg-surface-muted"><ChevronLeft size={16} aria-hidden /></Link> : <span aria-disabled className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-line px-2 opacity-40"><ChevronLeft size={16} aria-hidden /></span>}
          <span className="px-2 text-muted">Page {page} of {lastPage}</span>
          {page < lastPage ? <Link href={keep({ page: page + 1 })} aria-label="Next page" className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-line bg-surface px-2 hover:bg-surface-muted"><ChevronRight size={16} aria-hidden /></Link> : <span aria-disabled className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-line px-2 opacity-40"><ChevronRight size={16} aria-hidden /></span>}
        </nav>
        <RowsPerPage size={size} sizes={SIZES} basePath={keep({ size: undefined, page: undefined })} />
      </div>
    </section>
  );
}

function Card({ icon: Icon, title, text, works, badge, children }: { icon: LucideIcon; title: string; text: string; works: boolean; badge?: string; children: React.ReactNode }) {
  return (
    <section className={`${cardClass} min-w-0 !p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e5effd] text-[#1d62c9]"><Icon size={22} aria-hidden /></span>
        <div className="min-w-0 flex-1"><h2 className="text-base font-bold">{title}</h2><p className="text-xs text-muted">{text}</p></div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${works ? "bg-[#e3f6ec] text-[#16824f] dark:bg-[#123a2a] dark:text-[#6fe0a8]" : "bg-[#eceff3] text-[#5b6675] dark:bg-[#2a3340] dark:text-[#b7c0cc]"}`}>{works ? "Works now" : badge ?? "Not built yet"}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2 border-b border-line pb-2 text-[13px] last:border-0"><dt className="text-muted">{label}</dt><dd className="break-words font-medium">{value}</dd></div>;
}

function Toggle({ label, hint, on, notBuilt }: { label: string; hint: string; on?: boolean; notBuilt?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0"><p className="text-[13px] font-medium">{label}</p><p className="text-xs text-muted">{hint}</p></div>
      <span role="img" aria-label={on ? "On, fixed" : notBuilt ? "Off, not built yet" : "Off"} className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 opacity-60 ${on ? "justify-end bg-[var(--brand)]" : "justify-start bg-[var(--line-strong)]"}`}><span className="h-5 w-5 rounded-full bg-white shadow" /></span>
    </div>
  );
}

function Facts({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <section className={`${cardClass} max-w-4xl !p-5`}>
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <dl className="space-y-2">{rows.map(([k, v]) => <Fact key={k} label={k} value={v} />)}</dl>
      <p className="mt-3 text-xs text-muted">These are how the system works today. They are not switches yet.</p>
    </section>
  );
}

function NotBuilt({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <section className={`${cardClass} max-w-3xl !p-5`}>
      <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eceff3] text-[#5b6675]"><Icon size={22} aria-hidden /></span>
        <div><h2 className="text-base font-bold">{title} <span className="ml-2 rounded-md bg-[#eceff3] px-2 py-0.5 text-[11px] font-semibold text-[#5b6675] dark:bg-[#2a3340] dark:text-[#b7c0cc]">Not built yet</span></h2><p className="mt-1 text-sm text-muted">{text}</p></div></div>
    </section>
  );
}

export const metadata = { title: "Settings" };
