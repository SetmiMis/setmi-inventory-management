import Link from "next/link";
import {
  ArrowLeftRight, BarChart3, Boxes, CheckCircle2, ChevronRight, CircleHelp, ClipboardList, MapPin, Package, PackageCheck,
  Receipt, ScanLine, ShieldCheck, ShoppingCart, Truck, type LucideIcon,
} from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";

type Task = { href: string; label: string; hint: string; icon: LucideIcon; show: boolean };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const denied = (await searchParams).denied !== undefined;
  const billingOn = await isBillingEnabled();

  // Big buttons named after what the person wants to DO. Only what this person may open is shown
  // (the pages still check on the server).
  const tasks: Task[] = [
    { href: "/items", label: "Find an item", hint: "Search by code, name or scan a barcode", icon: Package, show: can(user, "items.view") },
    { href: "/receipts/new", label: "Receive goods", hint: "Maal aaya hai: stock badhao", icon: PackageCheck, show: can(user, "receipts.create") },
    { href: "/purchase-orders/new", label: "Order goods from a supplier", hint: "Purchase order banao", icon: ClipboardList, show: can(user, "purchase.create") },
    { href: "/stock/scan", label: "Count stock by scanning", hint: "Scan karke ginti karo", icon: ScanLine, show: can(user, "stock.adjust") },
    { href: "/stock", label: "See stock", hint: "Kya kitna hai, kya kam hai", icon: Boxes, show: can(user, "stock.view") },
    { href: "/transfers/new", label: "Send goods to another place", hint: "Ek jagah se doosri jagah maal bhejo", icon: ArrowLeftRight, show: can(user, "transfers.create") },
    { href: "/billing", label: "Make a bill", hint: "Scan karo, bill banao, print karo", icon: ShoppingCart, show: billingOn && can(user, "bills.create") },
    { href: "/bills", label: "Bills", hint: "Aaj ke bills dekho ya void karo", icon: Receipt, show: can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void") },
    { href: "/reports", label: "Reports", hint: "Stock, bikri, kam stock, Excel download", icon: BarChart3, show: can(user, "reports.view") },
    { href: "/suppliers", label: "Suppliers", hint: "Jinse maal kharidte ho", icon: Truck, show: can(user, "suppliers.view") || can(user, "suppliers.manage") },
    { href: "/locations", label: "Warehouses and shops", hint: "Jagah banao aur dekho", icon: MapPin, show: can(user, "locations.manage") },
  ].filter((t) => t.show);

  // First-time setup list for the administrator. It checks the real data, so ticks are not guesses.
  type Step = { done: boolean; label: string; hint: string; href: string };
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
    const places = placesQ.count ?? 0;
    const suppliers = suppliersQ.count ?? 0;
    const items = itemsQ.count ?? 0;
    const people = peopleQ.count ?? 0;
    const stockRows = stockQ.count ?? 0;
    steps = [
      { done: places > 0, label: "Add your warehouses and shops", hint: "Locations > New warehouse or shop", href: "/locations/new" },
      { done: people > 1, label: "Add your staff and give permissions", hint: "Admin > Users (naya login Supabase dashboard se banta hai)", href: "/admin/users" },
      { done: items > 0, label: "Add your items", hint: "Items > New item, ya Excel se Import", href: "/items/import" },
      { done: suppliers > 0, label: "Add your suppliers", hint: "Suppliers > New supplier", href: "/suppliers/new" },
      { done: stockRows > 0, label: "Enter opening stock", hint: "Stock > Scan count, 'opening stock' tick karke", href: "/stock/scan" },
    ];
  }
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main className="space-y-6">
      <div>
        <h1>Welcome{user.fullName ? `, ${user.fullName}` : ""}</h1>
        <p className="mt-1 text-base text-muted">Aaj aap kya karna chahte hain?</p>
      </div>

      {denied && (
        <p role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          Aapko us page ki permission nahi hai. Agar aapko us kaam ki zaroorat hai to apne admin se kahein.
        </p>
      )}

      {steps.length > 0 && doneCount < steps.length && (
        <section className={`${cardClass} space-y-3 border-brand`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Shuru kaise karein ({doneCount} of {steps.length} ho gaya)</h2>
            <Link href="/help#start" className="inline-flex items-center gap-1 text-sm"><CircleHelp size={16} aria-hidden /> Help</Link>
          </div>
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-muted">
                  <CheckCircle2 size={22} className={s.done ? "text-green-600" : "text-muted"} aria-hidden />
                  <span className="flex-1">
                    <span className={`block font-medium ${s.done ? "text-muted line-through" : ""}`}>{s.label}</span>
                    <span className="block text-sm text-muted">{s.hint}</span>
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
          {tasks.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`${cardClass} group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                <t.icon size={24} aria-hidden />
              </span>
              <span>
                <span className="block text-base font-semibold">{t.label}</span>
                <span className="block text-sm text-muted">{t.hint}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {tasks.length === 0 && (
        <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          Abhi aapko koi kaam ki permission nahi mili hai. Apne admin se kahein ki aapko permission aur jagah de.
        </p>
      )}

      <section className={`${cardClass} flex flex-wrap items-center gap-4`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><CircleHelp size={24} aria-hidden /></span>
        <div className="flex-1">
          <h2 className="text-base">Kuch samajh nahi aa raha?</h2>
          <p className="text-sm text-muted">Help mein har kaam ke steps simple bhasha mein hain. Har screen par upar &quot;Help&quot; button bhi hai.</p>
        </div>
        <Link href="/help" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">Open Help</Link>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 flex items-center gap-2 text-sm">
          <ShieldCheck size={18} className="text-brand" aria-hidden /> Aapki permissions
        </h2>
        {user.isAdmin ? (
          <p className="text-sm">Administrator: sab kuch.</p>
        ) : user.permissions.length === 0 ? (
          <p className="text-sm">Abhi koi permission nahi mili.</p>
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
