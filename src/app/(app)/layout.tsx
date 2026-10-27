import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { can, requireUser, showDashboard } from "@/lib/auth";
import { getLang, tr } from "@/lib/i18n";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { LocationSwitcher } from "./location-switcher";
import { CommandPalette, type PaletteEntry } from "./command-palette";
import { HelpButton } from "./help-button";
import { BottomBar, MobileMenu, NavLinks, type NavItem } from "./nav-links";
import { CollapseButton, NotificationBell, SidebarColumn, ThemeToggle, UserMenu } from "./top-bar-parts";
import { LanguageSwitch } from "@/components/language-switch";
import { MapPin } from "lucide-react";

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

  // The bell: how many items are low on stock (the database only shows the places this person may see).
  let lowCount = 0;
  if (user.isActive && can(user, "stock.view")) {
    const supabase = await createClient();
    const { count } = await supabase.from("stock_overview").select("item_id", { count: "exact", head: true }).eq("is_low", true);
    lowCount = count ?? 0;
  }

  // The menu is the one in the owner's dashboard mock, item for item. Items marked `soon` are in the design but
  // not built yet: they open a "Coming soon" page (nothing is faked). Only what this person may use is shown.
  const g = {
    master: tr(lang, "g_master"), purchase: tr(lang, "g_purchase"), inventory: tr(lang, "g_inventory"), sales: tr(lang, "g_sales"),
    reports: tr(lang, "g_reports"), admin: tr(lang, "g_admin"),
  };
  const seesTransfers = can(user, "transfers.view") || can(user, "transfers.create") || can(user, "transfers.send") || can(user, "transfers.receive");
  const seesReceipts = can(user, "receipts.view") || can(user, "receipts.create") || can(user, "receipts.post");
  const seesPurchase = can(user, "purchase.view") || can(user, "purchase.create") || can(user, "purchase.approve");
  const seesBills = can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void");
  const nav: NavItem[] = [];
  const add = (show: boolean, item: NavItem) => { if (show) nav.push(item); };
  if (showDashboard(user)) nav.push({ href: "/dashboard", label: tr(lang, "nav_dashboard"), icon: "dashboard" });
  else nav.push({ href: "/", label: tr(lang, "nav_home"), icon: "home" });
  // Master data
  add(can(user, "items.view"), { href: "/items", label: tr(lang, "nm_products"), icon: "items", group: g.master });
  add(can(user, "items.view"), { href: "/items/categories", label: tr(lang, "nm_categories"), icon: "categories", group: g.master });
  add(can(user, "suppliers.view") || can(user, "suppliers.manage"), { href: "/suppliers", label: tr(lang, "nm_suppliers"), icon: "suppliers", group: g.master });
  add(can(user, "locations.manage") || myLocations.length > 0, { href: "/locations", label: tr(lang, "nm_warehouses"), icon: "warehouses", group: g.master });
  add(can(user, "locations.manage") || myLocations.length > 0, { href: "/locations/racks", label: tr(lang, "nm_racks"), icon: "locations", group: g.master });
  add(can(user, "customers.view") || can(user, "customers.manage"), { href: "/customers", label: tr(lang, "nm_customers"), icon: "customers", group: g.master });
  // Purchase & import
  add(seesPurchase, { href: "/purchase-orders", label: tr(lang, "nm_po"), icon: "purchase", group: g.purchase });
  add(can(user, "shipments.view") || can(user, "shipments.manage"), { href: "/import-shipments", label: tr(lang, "nm_import"), icon: "import", group: g.purchase });
  add(seesReceipts, { href: "/receipts", label: tr(lang, "nm_grn"), icon: "receipts", group: g.purchase });
  add(can(user, "qc.view") || can(user, "qc.manage"), { href: "/quality-check", label: tr(lang, "nm_qc"), icon: "qc", group: g.purchase });
  // Inventory
  add(can(user, "stock.view"), { href: "/stock", label: tr(lang, "nm_stock"), icon: "stock", group: g.inventory });
  add(can(user, "stock.view"), { href: "/stock/movements", label: tr(lang, "nm_ledger"), icon: "ledger", group: g.inventory });
  add(seesTransfers, { href: "/transfers", label: tr(lang, "nm_transfer"), icon: "transfers", group: g.inventory });
  add(can(user, "stock.entry"), { href: "/stock/entry", label: tr(lang, "nm_adjust"), icon: "entry", group: g.inventory });
  add(can(user, "stock.adjust") || can(user, "stock.approve") || can(user, "stock.view"), { href: "/stock/count", label: tr(lang, "nm_count"), icon: "count", group: g.inventory });
  // Sales & dispatch (our sales are the bills)
  add(can(user, "sales_orders.view") || can(user, "sales_orders.create") || can(user, "sales_orders.confirm"), { href: "/sales-orders", label: tr(lang, "nm_sorders"), icon: "bills", group: g.sales });
  add(can(user, "picking.view") || can(user, "picking.manage"), { href: "/picking", label: tr(lang, "nm_picking"), icon: "picking", group: g.sales });
  add(can(user, "dispatch.view") || can(user, "dispatch.manage"), { href: "/dispatch", label: tr(lang, "nm_dispatch"), icon: "dispatch", group: g.sales });
  add(can(user, "returns.view") || can(user, "returns.manage") || can(user, "returns.approve"), { href: "/returns", label: tr(lang, "nm_returns"), icon: "returns", group: g.sales });
  // Reports
  add(can(user, "reports.view"), { href: "/reports/inventory", label: tr(lang, "nm_rinv"), icon: "reports", group: g.reports });
  add(can(user, "reports.view"), { href: "/coming-soon/purchase-reports", label: tr(lang, "nm_rpur"), icon: "reports2", group: g.reports, soon: true });
  add(can(user, "reports.view"), { href: "/reports?r=sales-day", label: tr(lang, "nm_rsales"), icon: "reports3", group: g.reports });
  add(can(user, "reports.view"), { href: "/coming-soon/stock-valuation", label: tr(lang, "nm_rval"), icon: "valuation", group: g.reports, soon: true });
  // Administration
  add(user.isActive && user.isAdmin, { href: "/admin/users", label: tr(lang, "nm_users"), icon: "users", group: g.admin });
  add(user.isActive && user.isAdmin, { href: "/admin/settings", label: tr(lang, "nm_settings"), icon: "settings", group: g.admin });

  // Jobs that are in the system but not in the mock's menu: reachable from Quick Action, the search box and the phone bar.
  const extras: NavItem[] = [];
  if (can(user, "stock.view") && can(user, "items.view")) extras.push({ href: "/reorder", label: tr(lang, "nav_reorder"), icon: "reorder" });
  if (seesBills) extras.push({ href: "/bills", label: tr(lang, "nav_bills"), icon: "bills" });
  if (billingOn && can(user, "bills.create")) extras.push({ href: "/billing", label: tr(lang, "nav_billing2"), icon: "billing" });
  extras.push({ href: "/help", label: tr(lang, "nav_help"), icon: "help" });
  const bottomPool = [...nav, ...extras];

  // Search box: every page above, plus quick actions for the jobs done most often.
  const paletteEntries: PaletteEntry[] = [
    ...[...nav, ...extras].filter((n) => !n.soon).map((n) => ({ href: n.href, label: n.label, kind: "page" as const })),
    ...(can(user, "items.create") ? [{ href: "/items/new", label: tr(lang, "act_new_item"), kind: "action" as const }] : []),
    ...(can(user, "receipts.create") ? [{ href: "/receipts/new", label: tr(lang, "act_new_receipt"), kind: "action" as const }] : []),
    ...(can(user, "purchase.create") ? [{ href: "/purchase-orders/new", label: tr(lang, "act_new_po"), kind: "action" as const }] : []),
    ...(can(user, "transfers.create") ? [{ href: "/transfers/new", label: tr(lang, "act_new_transfer"), kind: "action" as const }] : []),
    ...(can(user, "stock.entry") ? [{ href: "/stock/entry", label: tr(lang, "act_stock_out"), kind: "action" as const }] : []),
  ];
  const paletteLabels = {
    button: tr(lang, "top_search"), title: tr(lang, "search_title"), placeholder: tr(lang, "search_placeholder"),
    items: tr(lang, "search_items"), pages: tr(lang, "search_pages"), actions: tr(lang, "search_actions"), recent: tr(lang, "search_recent"),
    none: tr(lang, "search_none"), hint: tr(lang, "search_hint"), typing: tr(lang, "search_typing"),
  };
  const displayName = user.fullName?.trim() || user.email.split("@")[0];

  const locationChip =
    myLocations.length > 1 && current ? (
      <LocationSwitcher locations={myLocations} currentId={current.id} label={tr(lang, "top_working_in")} />
    ) : current ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-[var(--brand-text)]">
        <MapPin size={14} aria-hidden /> {current.name} ({current.code})
      </span>
    ) : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 h-16 border-b border-line bg-surface print:hidden">
        <div className="flex h-full items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <MobileMenu items={[...nav, ...extras]} openLabel={tr(lang, "top_menu_open")} closeLabel={tr(lang, "top_menu_close")} />
          <Link href={showDashboard(user) ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2.5" aria-label="SETMI INDIA, home">
            <Image src="/brand/setmi-round-192.png" alt="" width={44} height={44} priority className="h-11 w-11" />
            <span className="hidden leading-tight sm:block">
              <span className="block text-xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-r from-[#0b7fb0] to-[#12b5c9] bg-clip-text text-transparent">SETMI</span>{" "}
                <span className="text-[#16a34a]">INDIA</span>
              </span>
              <span className="block text-[11px] font-medium text-muted">Engineered for the Extraordinary.</span>
            </span>
          </Link>
          <CollapseButton label={tr(lang, "top_collapse")} />
          <div className="flex min-w-0 flex-1 justify-center px-1 md:px-4">
            <CommandPalette entries={paletteEntries} canSearchItems={can(user, "items.view")} labels={paletteLabels} />
          </div>
          <ThemeToggle lightLabel={tr(lang, "theme_to_light")} darkLabel={tr(lang, "theme_to_dark")} />
          <NotificationBell count={lowCount} label={tr(lang, "top_notifications")} text={lowCount > 0 ? `${lowCount} ${tr(lang, "top_low_alert")}` : tr(lang, "top_no_alert")} />
          <HelpButton label={tr(lang, "top_help")} />
          <UserMenu
            name={displayName}
            email={user.email}
            role={user.isAdmin ? tr(lang, "top_role_admin") : tr(lang, "top_role_staff")}
            signOut={tr(lang, "top_signout")}
          >
            <div className="space-y-3">
              <LanguageSwitch lang={lang} label={tr(lang, "top_language")} />
              {locationChip}
            </div>
          </UserMenu>
        </div>
      </header>

      <div className="lg:flex">
        <SidebarColumn>
          <NavLinks items={nav} />
        </SidebarColumn>
        <div className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1400px] px-4 py-6 pb-24 lg:pb-8 print:p-0">
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
      </div>
      <BottomBar items={bottomPool.filter((n) => !n.soon)} />
    </div>
  );
}
