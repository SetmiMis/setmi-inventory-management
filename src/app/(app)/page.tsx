import Link from "next/link";
import {
  ArrowLeftRight, BarChart3, Boxes, CheckCircle2, ChevronRight, CircleHelp, ClipboardList, MapPin, Package, PackageCheck,
  Receipt, ScanLine, ShieldCheck, ShoppingCart, Truck, type LucideIcon,
} from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { getLang, tr, type MessageKey } from "@/lib/i18n";
import { isBillingEnabled } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";

type Task = { href: string; label: MessageKey; hint: MessageKey; icon: LucideIcon; show: boolean };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const lang = await getLang();
  const t = (k: MessageKey) => tr(lang, k);
  const denied = (await searchParams).denied !== undefined;
  const billingOn = await isBillingEnabled();

  // Big buttons named after what the person wants to DO. Only what this person may open is shown
  // (the pages still check on the server).
  const tasks: Task[] = [
    { href: "/items", label: "task_items", hint: "task_items_hint", icon: Package, show: can(user, "items.view") },
    { href: "/receipts/new", label: "task_receive", hint: "task_receive_hint", icon: PackageCheck, show: can(user, "receipts.create") },
    { href: "/purchase-orders/new", label: "task_order", hint: "task_order_hint", icon: ClipboardList, show: can(user, "purchase.create") },
    { href: "/stock/scan", label: "task_count", hint: "task_count_hint", icon: ScanLine, show: can(user, "stock.adjust") },
    { href: "/stock", label: "task_stock", hint: "task_stock_hint", icon: Boxes, show: can(user, "stock.view") },
    { href: "/transfers/new", label: "task_transfer", hint: "task_transfer_hint", icon: ArrowLeftRight, show: can(user, "transfers.create") },
    { href: "/billing", label: "task_bill", hint: "task_bill_hint", icon: ShoppingCart, show: billingOn && can(user, "bills.create") },
    { href: "/bills", label: "task_bills", hint: "task_bills_hint", icon: Receipt, show: can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void") },
    { href: "/reports", label: "task_reports", hint: "task_reports_hint", icon: BarChart3, show: can(user, "reports.view") },
    { href: "/suppliers", label: "task_suppliers", hint: "task_suppliers_hint", icon: Truck, show: can(user, "suppliers.view") || can(user, "suppliers.manage") },
    { href: "/locations", label: "task_places", hint: "task_places_hint", icon: MapPin, show: can(user, "locations.manage") },
  ].filter((x) => x.show) as Task[];

  // First-time setup list for the administrator. It checks the real data, so ticks are not guesses.
  type Step = { done: boolean; label: MessageKey; hint: MessageKey; href: string };
  let steps: Step[] = [];
  if (user.isAdmin && user.isActive) {
    const supabase = await createClient();
    const head = { count: "exact" as const, head: true };
    const [placesQ, suppliersQ, itemsQ, peopleQ, stockQ] = await Promise.all([
      supabase.from("locations").select("id", head).neq("type", "TRANSIT"),
      supabase.from("suppliers").select("id", head),
      supabase.from("items").select("id", head),
      supabase.from("profiles").select("id", head).eq("is_active", true),
      supabase.from("stock_balances").select("item_id", head),
    ]);
    steps = [
      { done: (placesQ.count ?? 0) > 0, label: "step_places", hint: "step_places_hint", href: "/locations/new" },
      { done: (peopleQ.count ?? 0) > 1, label: "step_staff", hint: "step_staff_hint", href: "/admin/users" },
      { done: (itemsQ.count ?? 0) > 0, label: "step_items", hint: "step_items_hint", href: "/items/import" },
      { done: (suppliersQ.count ?? 0) > 0, label: "step_suppliers", hint: "step_suppliers_hint", href: "/suppliers/new" },
      { done: (stockQ.count ?? 0) > 0, label: "step_stock", hint: "step_stock_hint", href: "/stock/scan" },
    ];
  }
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main className="space-y-6">
      <div>
        <h1>{t("home_welcome")}{user.fullName ? `, ${user.fullName}` : ""}</h1>
        <p className="mt-1 text-base text-muted">{t("home_ask")}</p>
      </div>

      {denied && (
        <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          {t("home_denied")}
        </p>
      )}

      {steps.length > 0 && doneCount < steps.length && (
        <section className={`${cardClass} space-y-3 border-brand`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">{t("home_setup_title")} ({doneCount} / {steps.length} {t("home_setup_of")})</h2>
            <Link href="/help#start" className="inline-flex items-center gap-1 text-sm"><CircleHelp size={16} aria-hidden /> {t("top_help")}</Link>
          </div>
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-muted">
                  <CheckCircle2 size={22} className={s.done ? "text-green-600" : "text-muted"} aria-hidden />
                  <span className="flex-1">
                    <span className={`block font-medium ${s.done ? "text-muted line-through" : ""}`}>{t(s.label)}</span>
                    <span className="block text-sm text-muted">{t(s.hint)}</span>
                  </span>
                  {!s.done && <ChevronRight size={18} className="text-muted" aria-hidden />}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {tasks.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              className={`${cardClass} group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                <x.icon size={24} aria-hidden />
              </span>
              <span>
                <span className="block text-base font-semibold">{t(x.label)}</span>
                <span className="block text-sm text-muted">{t(x.hint)}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {tasks.length === 0 && (
        <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          {t("home_no_perm")}
        </p>
      )}

      <section className={`${cardClass} flex flex-wrap items-center gap-4`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><CircleHelp size={24} aria-hidden /></span>
        <div className="flex-1">
          <h2 className="text-base">{t("home_help_title")}</h2>
          <p className="text-sm text-muted">{t("home_help_text")}</p>
        </div>
        <Link href="/help" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">{t("home_help_button")}</Link>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 flex items-center gap-2 text-sm">
          <ShieldCheck size={18} className="text-brand" aria-hidden /> {t("home_perm_title")}
        </h2>
        {user.isAdmin ? (
          <p className="text-sm">{t("home_perm_admin")}</p>
        ) : user.permissions.length === 0 ? (
          <p className="text-sm">{t("home_perm_none")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {user.permissions.map((p) => (
              <li key={p} className="rounded-full bg-surface-muted px-2.5 py-1 font-mono text-xs">
                {p}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
