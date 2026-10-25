"use client";

import Image from "next/image";
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

export type NavItem = { href: string; label: string; icon: string; group?: string };

function NavList({ items, onPick }: { items: NavItem[]; onPick?: () => void }) {
  const pathname = usePathname();
  // Only the most specific match is marked (so /stock/entry does not also light up /stock).
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const activeHref = items.filter((it) => matches(it.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <ul className="space-y-1">
      {items.map((it, i) => {
        const Icon = ICONS[it.icon] ?? ReceiptText;
        const active = it.href === activeHref;
        // A small heading whenever the group changes, so a long menu is easy to scan.
        const heading = it.group && it.group !== items[i - 1]?.group ? it.group : null;
        return (
          <li key={it.href}>
            {heading && (
              <p className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-text)] opacity-70">{heading}</p>
            )}
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
              <Image src="/brand/setmi-logo-wide.png" alt="SETMI INDIA" width={150} height={46} className="h-auto w-[150px]" />
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

// Phone only: a bar at the bottom with the four things used most (the first four that this person may open),
// so staff at the counter or in the godown do not have to open the menu each time.
const BOTTOM_PREFERENCE = ["/", "/receipts", "/stock/entry", "/billing", "/stock", "/items", "/bills", "/transfers"];
export function BottomBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const chosen = BOTTOM_PREFERENCE.map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i).slice(0, 4);
  if (chosen.length < 2) return null;
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const activeHref = chosen.filter((c) => matches(c.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden print:hidden">
      {chosen.map((it) => {
        const Icon = ICONS[it.icon] ?? ReceiptText;
        const active = it.href === activeHref;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
          >
            <Icon size={20} aria-hidden />
            <span className="max-w-full truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
