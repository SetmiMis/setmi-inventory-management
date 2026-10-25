"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Boxes,
  RefreshCw,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Home,
  MapPin,
  Menu,
  PackageCheck,
  Package,
  Receipt,
  BarChart3,
  ReceiptText,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

// The server (layout) decides which links this person may see and sends only names.
// Icons are picked here, so no component has to cross from server to client.
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  items: Package,
  stock: Boxes,
  help: CircleHelp,
  dashboard: LayoutDashboard,
  entry: ArrowUpDown,
  reorder: RefreshCw,
  purchase: ClipboardList,
  receipts: PackageCheck,
  transfers: ArrowLeftRight,
  billing: ShoppingCart,
  bills: Receipt,
  suppliers: Truck,
  locations: MapPin,
  users: Users,
  settings: Settings,
  reports: BarChart3,
};

export type NavItem = { href: string; label: string; icon: string };

function NavList({ items, onPick }: { items: NavItem[]; onPick?: () => void }) {
  const pathname = usePathname();
  // Only the most specific match is marked (so /stock/entry does not also light up /stock).
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const activeHref = items.filter((it) => matches(it.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon] ?? ReceiptText;
        const active = it.href === activeHref;
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-[var(--sidebar-active)] text-white shadow-sm"
                  : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-active)] hover:text-white"
              }`}
            >
              <Icon size={18} aria-hidden className={active ? "text-sky-300" : ""} />
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// Desktop sidebar list.
export function NavLinks({ items }: { items: NavItem[] }) {
  return <NavList items={items} />;
}

// Phone: a menu button that opens the same list over the page.
export function MobileMenu({ items, openLabel = "Open menu", closeLabel = "Close menu" }: { items: NavItem[]; openLabel?: string; closeLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openLabel}
        className="rounded-lg border border-line bg-surface p-2 lg:hidden"
      >
        <Menu size={20} aria-hidden />
      </button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-[var(--sidebar)] p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="font-semibold text-white">SETMI INDIA</span>
              <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel} className="text-white">
                <X size={20} aria-hidden />
              </button>
            </div>
            <NavList items={items} onPick={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
