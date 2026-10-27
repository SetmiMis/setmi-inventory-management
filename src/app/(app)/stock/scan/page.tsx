import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { ScanCount } from "./scan-count";

export default async function ScanCountPage() {
  const user = await requirePermission("stock.adjust");
  const loc = await getCurrentLocation(user);
  if (!loc) {
    return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;
  }
  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/stock" className="text-blue-700 underline">Stock</Link> / Count by scanning</p>
      <h1 className="text-xl font-semibold">Count by scanning in {loc.name}</h1>
      <p className="text-sm text-neutral-500">
        Stand at the shelf, scan each piece. The count for an item goes up by one with every scan.
        Metre and kilogram items cannot be counted piece by piece: scan once, then type the quantity.
        Nothing is saved until you press Save.
      </p>
      <ScanCount placeName={loc.name} />
    </main>
  );
}

export const metadata = { title: "Scan Count" };
