import { Suspense } from "react";
import Link from "next/link";
import { can, requireUser, showDashboard } from "@/lib/auth";
import { getLang, tr } from "@/lib/i18n";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { logout } from "./actions";
import { LocationSwitcher } from "./location-switcher";
import { HelpButton } from "./help-button";
import { MobileMenu, NavLinks, type NavItem } from "./nav-links";
import { LanguageSwitch } from "@/components/language-switch";
import { LogOut, MapPin, UserCircle, Warehouse } from "lucide-react";
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

  // Which links this person may see. Same rules as before; only the look and the language changed.
  const nav: NavItem[] = [{ href: "/", label: tr(lang, "nav_home"), icon: "home" }];
  if (showDashboard(user)) nav.push({ href: "/dashboard", label: tr(lang, "nav_dashboard"), icon: "dashboard" });
  if (can(user, "items.view")) nav.push({ href: "/items", label: tr(lang, "nav_items"), icon: "items" });
  if (can(user, "stock.view")) nav.push({ href: "/stock", label: tr(lang, "nav_stock"), icon: "stock" });
  if (can(user, "purchase.view") || can(user, "purchase.create") || can(user, "purchase.approve"))
    nav.push({ href: "/purchase-orders", label: tr(lang, "nav_purchase"), icon: "purchase" });
  if (can(user, "receipts.view") || can(user, "receipts.create") || can(user, "receipts.post"))
    nav.push({ href: "/receipts", label: tr(lang, "nav_receipts"), icon: "receipts" });
  if (can(user, "transfers.view") || can(user, "transfers.create") || can(user, "transfers.send") || can(user, "transfers.receive"))
    nav.push({ href: "/transfers", label: tr(lang, "nav_transfers"), icon: "transfers" });
  if (billingOn && can(user, "bills.create")) nav.push({ href: "/billing", label: tr(lang, "nav_billing"), icon: "billing" });
  if (can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void"))
    nav.push({ href: "/bills", label: tr(lang, "nav_bills"), icon: "bills" });
  if (can(user, "suppliers.view") || can(user, "suppliers.manage"))
    nav.push({ href: "/suppliers", label: tr(lang, "nav_suppliers"), icon: "suppliers" });
  if (can(user, "reports.view")) nav.push({ href: "/reports", label: tr(lang, "nav_reports"), icon: "reports" });
  if (can(user, "locations.manage") || myLocations.length > 0)
    nav.push({ href: "/locations", label: tr(lang, "nav_locations"), icon: "locations" });
  if (user.isActive && user.isAdmin) {
    nav.push({ href: "/admin/users", label: tr(lang, "nav_users"), icon: "users" });
    nav.push({ href: "/admin/settings", label: tr(lang, "nav_settings"), icon: "settings" });
  }
  nav.push({ href: "/help", label: tr(lang, "nav_help"), icon: "help" });

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-[var(--sidebar)] p-4 lg:sticky lg:top-0 lg:flex lg:h-screen print:hidden">
        <Link href="/" className="mb-6 flex items-center gap-3 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow">
            <Warehouse size={20} aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-wide text-white">SETMI INDIA</span>
            <span className="block text-xs text-[var(--sidebar-text)]">Inventory</span>
          </span>
        </Link>
        <div className="flex-1 overflow-y-auto">
          <NavLinks items={nav} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur print:hidden">
          <div className="flex items-center gap-3">
            <MobileMenu items={nav} openLabel={tr(lang, "top_menu_open")} closeLabel={tr(lang, "top_menu_close")} />
            {myLocations.length > 1 && current ? (
              <LocationSwitcher locations={myLocations} currentId={current.id} label={tr(lang, "top_working_in")} />
            ) : current ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand">
                <MapPin size={14} aria-hidden /> {current.name} ({current.code})
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <LanguageSwitch lang={lang} label={tr(lang, "top_language")} />
            <span className="hidden items-center gap-1.5 text-muted md:inline-flex">
              <UserCircle size={18} aria-hidden /> {user.email}
            </span>
            <HelpButton label={tr(lang, "top_help")} />
            <form action={logout}>
              <button type="submit" className={secondaryButton}>
                <LogOut size={16} aria-hidden /> {tr(lang, "top_signout")}
              </button>
            </form>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-6 print:p-0">
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
  );
}
