import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { isBillingEnabled } from "@/lib/settings";
import { BillingScreen } from "./billing-screen";

export default async function BillingPage() {
  const user = await requirePermission("bills.create");
  if (!(await isBillingEnabled())) {
    return (
      <main className="space-y-3">
        <h1 className="text-xl font-semibold">Billing</h1>
        <p role="status" className="rounded border border-amber-500 p-3 text-sm">
          Billing is switched OFF. Bills are made in Zoho for now. An administrator can switch billing on under{" "}
          {user.isAdmin ? <Link href="/admin/settings" className="text-blue-700 underline">Settings</Link> : "Settings"}.
        </p>
      </main>
    );
  }
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a shop yet.</p>;
  if (loc.type !== "SHOP") {
    return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are working in a warehouse ({loc.name}). Switch to a shop in the header to make a bill.</p>;
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">New bill at {loc.name}</h1>
        <Link href="/bills" className="text-sm text-blue-700 underline">Today&apos;s bills</Link>
      </div>
      <p className="text-sm text-neutral-500">No tax is calculated: this is a simple bill, not a tax invoice. Stock goes down when you complete the bill.</p>
      <BillingScreen placeName={loc.name} canOverridePrice={can(user, "bills.override_price")} />
    </main>
  );
}
