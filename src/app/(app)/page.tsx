import Link from "next/link";
import { ArrowLeftRight, BarChart3, Boxes, MapPin, Package, PackageCheck, Receipt, ScanLine, ShieldCheck, Truck, type LucideIcon } from "lucide-react";
import { can, requireUser } from "@/lib/auth";
import { cardClass } from "@/lib/ui";

type Shortcut = { href: string; label: string; hint: string; icon: LucideIcon; show: boolean };

export default async function HomePage() {
  const user = await requireUser();

  // Shortcuts only for what this person may open (the pages still check on the server).
  const shortcuts: Shortcut[] = [
    { href: "/items", label: "Items", hint: "Find, add or edit items", icon: Package, show: can(user, "items.view") },
    { href: "/stock", label: "Stock", hint: "What is where, counts, low stock", icon: Boxes, show: can(user, "stock.view") },
    { href: "/stock/scan", label: "Scan count", hint: "Count stock with a scanner", icon: ScanLine, show: can(user, "stock.adjust") },
    { href: "/receipts", label: "Receipts", hint: "Goods coming in from suppliers", icon: PackageCheck, show: can(user, "receipts.view") || can(user, "receipts.create") || can(user, "receipts.post") },
    { href: "/transfers", label: "Transfers", hint: "Move stock between places", icon: ArrowLeftRight, show: can(user, "transfers.view") || can(user, "transfers.create") || can(user, "transfers.send") || can(user, "transfers.receive") },
    { href: "/bills", label: "Bills", hint: "Shop bills of the day", icon: Receipt, show: can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void") },
    { href: "/reports", label: "Reports", hint: "Stock, low stock, sales, slow stock", icon: BarChart3, show: can(user, "reports.view") },
    { href: "/suppliers", label: "Suppliers", hint: "People you buy from", icon: Truck, show: can(user, "suppliers.view") || can(user, "suppliers.manage") },
    { href: "/locations", label: "Locations", hint: "Warehouses and shops", icon: MapPin, show: can(user, "locations.manage") },
  ].filter((s) => s.show);

  return (
    <main className="space-y-6">
      <div>
        <h1>Welcome{user.fullName ? `, ${user.fullName}` : ""}</h1>
        <p className="mt-1 text-sm text-muted">Pick what you want to do.</p>
      </div>

      {shortcuts.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`${cardClass} group flex items-center gap-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                <s.icon size={22} aria-hidden />
              </span>
              <span>
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-sm text-muted">{s.hint}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className={cardClass}>
        <h2 className="mb-2 flex items-center gap-2 text-sm">
          <ShieldCheck size={18} className="text-brand" aria-hidden /> Your access
        </h2>
        {user.isAdmin ? (
          <p className="text-sm">Administrator: all permissions.</p>
        ) : user.permissions.length === 0 ? (
          <p className="text-sm">No permissions have been given to you yet.</p>
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
