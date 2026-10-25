import { requireAdmin } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/settings";
import { BillingSwitch } from "./billing-switch";

export default async function SettingsPage() {
  await requireAdmin();
  const enabled = await isBillingEnabled();

  return (
    <main className="space-y-5">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="space-y-3 rounded border border-neutral-300 p-4">
        <h2 className="font-medium">Billing in this system</h2>
        <p className="text-sm">
          Status:{" "}
          <strong className={enabled ? "text-green-700" : "text-amber-600"}>{enabled ? "ON" : "OFF"}</strong>
        </p>
        <ul className="list-inside list-disc space-y-1 text-sm text-neutral-600">
          <li>While OFF, no one can make a bill here (the database refuses it, not only the menu). Your billing stays in Zoho.</li>
          <li>While ON, a bill made here reduces the stock of that shop at once, and the bill shows the item&apos;s Selling Item Name.</li>
          <li>
            Do not bill the same sale in both Zoho and here, or stock will be reduced twice or not at all. While billing is OFF
            the stock here does not go down with Zoho sales: correct it with a stock count.
          </li>
          <li>These bills have no tax yet (no GST, no tax invoice number). They are not tax invoices.</li>
          <li>Voiding a bill (stock comes back) still works while billing is OFF.</li>
        </ul>
        <BillingSwitch enabled={enabled} />
      </section>
    </main>
  );
}
