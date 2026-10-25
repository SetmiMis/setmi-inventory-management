import { Suspense } from "react";
import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { getCurrentLocation, getMyLocations } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { logout } from "./actions";
import { LocationSwitcher } from "./location-switcher";

// Every page in this group needs a signed-in user. Reading the session is a request-time
// read, so with Cache Components it must sit inside <Suspense>.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-neutral-500">Loading...</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const myLocations = await getMyLocations(user);
  const current = await getCurrentLocation(user);
  const billingOn = await isBillingEnabled();

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <header className="mb-6 print:hidden flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="font-semibold">
            SETMI INDIA IMS
          </Link>
          {can(user, "items.view") && (
            <Link href="/items" className="text-blue-700 underline">
              Items
            </Link>
          )}
          {(can(user, "receipts.view") || can(user, "receipts.create") || can(user, "receipts.post")) && (
            <Link href="/receipts" className="text-blue-700 underline">
              Receipts
            </Link>
          )}
          {billingOn && can(user, "bills.create") && (
            <Link href="/billing" className="text-blue-700 underline">
              Billing
            </Link>
          )}
          {(can(user, "bills.view") || can(user, "bills.create") || can(user, "bills.void")) && (
            <Link href="/bills" className="text-blue-700 underline">
              Bills
            </Link>
          )}
          {(can(user, "transfers.view") || can(user, "transfers.create") || can(user, "transfers.send") || can(user, "transfers.receive")) && (
            <Link href="/transfers" className="text-blue-700 underline">
              Transfers
            </Link>
          )}
          {(can(user, "suppliers.view") || can(user, "suppliers.manage")) && (
            <Link href="/suppliers" className="text-blue-700 underline">
              Suppliers
            </Link>
          )}
          {can(user, "stock.view") && (
            <Link href="/stock" className="text-blue-700 underline">
              Stock
            </Link>
          )}
          {(can(user, "locations.manage") || myLocations.length > 0) && (
            <Link href="/locations" className="text-blue-700 underline">
              Locations
            </Link>
          )}
          {user.isActive && user.isAdmin && (
            <>
              <Link href="/admin/users" className="text-blue-700 underline">
                Users
              </Link>
              <Link href="/admin/settings" className="text-blue-700 underline">
                Settings
              </Link>
            </>
          )}
        </nav>
        {myLocations.length > 1 && current ? (
          <LocationSwitcher locations={myLocations} currentId={current.id} />
        ) : current ? (
          <span className="text-sm text-neutral-500">Working in {current.name} ({current.code})</span>
        ) : null}
        <form action={logout} className="flex items-center gap-3 text-sm">
          <span className="text-neutral-500">{user.email}</span>
          <button type="submit" className="rounded border border-neutral-400 px-3 py-1">
            Sign out
          </button>
        </form>
      </header>

      {/* Central guard: an inactive account never reaches any page content. */}
      {user.isActive ? (
        children
      ) : (
        <p role="status" className="rounded border border-amber-500 p-4">
          Your account is created but not active yet. Please ask an administrator to activate it.
        </p>
      )}
    </div>
  );
}
