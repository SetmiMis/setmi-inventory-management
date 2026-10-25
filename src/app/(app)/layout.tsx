import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { can, requireUser, showDashboard } from "@/lib/auth";
import { getLang, tr } from "@/lib/i18n";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { logout } from "./actions";
import { LocationSwitcher } from "./location-switcher";
import { CommandPalette, type PaletteEntry } from "./command-palette";
import { HelpButton } from "./help-button";
import { BottomBar, MobileMenu, type NavItem } from "./nav-links";
import { TopNav } from "./top-nav";
import { LanguageSwitch } from "@/components/language-switch";
import { LogOut, MapPin, UserCircle } from "lucide-react";
import { secondaryButton } from "@/lib/ui";

// Every page in this group needs a signed-in user. Reading the session is a request-time
// read, so with Cache Components it must sit inside <Suspense>.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading...</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const lang = await getLang();
  const myLocations = await getMyLocations(user);
  const current = await getCurrentLocation(user);
  const billingOn = await isBillingEnabled();

  // Which links this person may see. Same rules as before; the menu is now grouped and has a search box.
  const g = {
    daily: tr(lang, "group_daily"), inventory: tr(lang, "group_inventory"), buying: tr(lang, "group_buying"),
    insights: tr(lang, "group_insights"), admin: tr(lang, "group_admin"), support: tr(lang, "group_support"),
  };
  const nav: NavItem[] = [{ href: "/", label: tr(lang, "nav_home"), icon: "home" }];
  if (showDashboard(user)) nav.push({ href: "/dashboard", label: tr(lang, "nav_dashboard"), icon: "dashboard" });
  // Daily work
  if (can(user, "stock.entry")) nav.push({ href: "/stock/entry", label: tr(lang, "nav_entry"), icon: "entry", group: g.daily });
  if (can(user, "receipts.view") || can(user, "receipts.create") || can(user, "receipts.post"))
    nav.push({ href: "/receipts", label: tr(lang, "nav_receipts"), icon: "receipts", group: g.daily });
  if (can(user, "transfers.view") || can(user, "transfers.create") || can(user, "transfers.send") || can(user, "transfers.receive"))
    nav.push({ href: "/transfers", label: tr(lang, "nav_transfers"), icon: "transfers", group: g.daily });
  if (billingOn && can(user, "bills.create")) nav.push({ href: "/billing", label: tr(lang, "nav_billing"), icon: "billing", group: g.daily });
  if (can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void"))
    nav.push({ href: "/bills", label: tr(lang, "nav_bills"), icon: "bills", group: g.daily });
  // Inventory
  if (can(user, "items.view")) nav.push({ href: "/items", label: tr(lang, "nav_items"), icon: "items", group: g.inventory });
  if (can(user, "stock.view")) nav.push({ href: "/stock", label: tr(lang, "nav_stock"), icon: "stock", group: g.inventory });
  if (can(user, "stock.view") && can(user, "items.view")) nav.push({ href: "/reorder", label: tr(lang, "nav_reorder"), icon: "reorder", group: g.inventory });
  if (can(user, "locations.manage") || myLocations.length > 0)
    nav.push({ href: "/locations", label: tr(lang, "nav_locations"), icon: "locations", group: g.inventory });
  // Buying
  if (can(user, "purchase.view") || can(user, "purchase.create") || can(user, "purchase.approve"))
    nav.push({ href: "/purchase-orders", label: tr(lang, "nav_purchase"), icon: "purchase", group: g.buying });
  if (can(user, "suppliers.view") || can(user, "suppliers.manage"))
    nav.push({ href: "/suppliers", label: tr(lang, "nav_suppliers"), icon: "suppliers", group: g.buying });
  // Insights and admin
  if (can(user, "reports.view")) nav.push({ href: "/reports", label: tr(lang, "nav_reports"), icon: "reports", group: g.insights });
  if (user.isActive && user.isAdmin) {
    nav.push({ href: "/admin/users", label: tr(lang, "nav_users"), icon: "users", group: g.admin });
    nav.push({ href: "/admin/settings", label: tr(lang, "nav_settings"), icon: "settings", group: g.admin });
  }
  nav.push({ href: "/help", label: tr(lang, "nav_help"), icon: "help", group: g.support });

  // Search box: every page above, plus quick actions for the jobs done most often.
  const paletteEntries: PaletteEntry[] = [
    ...nav.map((n) => ({ href: n.href, label: n.label, kind: "page" as const })),
    ...(can(user, "items.create") ? [{ href: "/items/new", label: tr(lang, "act_new_item"), kind: "action" as const }] : []),
    ...(can(user, "receipts.create") ? [{ href: "/receipts/new", label: tr(lang, "act_new_receipt"), kind: "action" as const }] : []),
    ...(can(user, "purchase.create") ? [{ href: "/purchase-orders/new", label: tr(lang, "act_new_po"), kind: "action" as const }] : []),
    ...(can(user, "transfers.create") ? [{ href: "/transfers/new", label: tr(lang, "act_new_transfer"), kind: "action" as const }] : []),
    ...(can(user, "stock.entry") ? [{ href: "/stock/entry", label: tr(lang, "act_stock_out"), kind: "action" as const }] : []),
  ];
  const paletteLabels = {
    button: tr(lang, "search_button"), title: tr(lang, "search_title"), placeholder: tr(lang, "search_placeholder"),
    items: tr(lang, "search_items"), pages: tr(lang, "search_pages"), actions: tr(lang, "search_actions"), recent: tr(lang, "search_recent"),
    none: tr(lang, "search_none"), hint: tr(lang, "search_hint"), typing: tr(lang, "search_typing"),
  };

  return (
    <div className="min-h-screen">
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <MobileMenu items={nav} openLabel={tr(lang, "top_menu_open")} closeLabel={tr(lang, "top_menu_close")} />
              <Link href="/" className="flex items-center gap-2.5" aria-label="SETMI INDIA, home">
                <Image src="/brand/setmi-badge-96.png" alt="" width={36} height={36} priority className="h-9 w-9 rounded-full" />
                <span className="leading-tight">
                  <span className="block text-sm font-bold">SETMI INDIA</span>
                  <span className="block text-[11px] font-medium uppercase tracking-widest text-muted">Inventory</span>
                </span>
              </Link>
              {myLocations.length > 1 && current ? (
                <LocationSwitcher locations={myLocations} currentId={current.id} label={tr(lang, "top_working_in")} />
              ) : current ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-[var(--brand-text)]">
                  <MapPin size={14} aria-hidden /> {current.name} ({current.code})
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <CommandPalette entries={paletteEntries} canSearchItems={can(user, "items.view")} labels={paletteLabels} />
              <LanguageSwitch lang={lang} label={tr(lang, "top_language")} />
              <span className="hidden items-center gap-1.5 text-muted xl:inline-flex">
                <UserCircle size={18} aria-hidden /> {user.email}
              </span>
              <HelpButton label={tr(lang, "top_help")} />
              <form action={logout}>
                <button type="submit" className={secondaryButton}>
                  <LogOut size={16} aria-hidden /> {tr(lang, "top_signout")}
                </button>
              </form>
            </div>
          </div>
          <div className="mx-auto hidden max-w-7xl border-t border-line px-4 py-1.5 lg:block">
            <TopNav items={nav} />
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 py-6 pb-24 lg:pb-6 print:p-0">
          {/* Central guard: an inactive account never reaches any page content. */}
          {user.isActive ? (
            children
          ) : (
            <p role="status" className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-amber-900">
              {tr(lang, "top_inactive")}
            </p>
          )}
        </div>
      </div>
      <BottomBar items={nav} />
    </div>
  );
}
