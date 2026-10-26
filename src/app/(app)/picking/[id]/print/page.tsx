import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";

type LineRow = { id: number; quantity: number; items: { id: string; internal_item_code: string; item_name: string; unit: string } | null };

// A pick list for the paper file: what to take from the shelves for one sales order. `id` is the sales order id.
export default async function PickListPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission("picking.view", "picking.manage");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: o } = await supabase.from("sales_orders").select("id, order_no, order_date, expected_dispatch, location_id, customers(name), locations(name, code)").eq("id", id.data).maybeSingle();
  if (!o) notFound();
  const { data } = await supabase.from("sales_order_lines").select("id, quantity, items(id, internal_item_code, item_name, unit)").eq("order_id", o.id).order("id");
  const lines = (data ?? []) as unknown as LineRow[];
  const ids = lines.map((l) => l.items?.id).filter(Boolean) as string[];
  const { data: bins } = ids.length ? await supabase.from("item_bins").select("item_id, storage_bins(code)").eq("location_id", o.location_id).in("item_id", ids) : { data: [] };
  const rack = new Map<string, string>();
  for (const b of (bins ?? []) as unknown as { item_id: string; storage_bins: { code: string } | null }[]) if (b.storage_bins) rack.set(b.item_id, [rack.get(b.item_id), b.storage_bins.code].filter(Boolean).join(", "));
  const cust = o.customers as unknown as { name: string } | null;
  const place = o.locations as unknown as { name: string; code: string } | null;

  return (
    <main className="space-y-4 bg-white p-4 text-black">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/picking?sel=${o.id}&p=work`} className="text-sm text-blue-700 underline">Back</Link>
        <PrintButton />
      </div>
      <header className="border-b border-black pb-2">
        <p className="text-lg font-bold">SETMI INDIA</p>
        <p className="text-base font-semibold">Pick List for order {o.order_no}</p>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="font-semibold">Customer</dt><dd>{cust?.name ?? "-"}</dd></div>
        <div><dt className="font-semibold">Pick from</dt><dd>{place ? `${place.name} (${place.code})` : "-"}</dd></div>
        <div><dt className="font-semibold">Order date</dt><dd>{o.order_date}</dd></div>
        <div><dt className="font-semibold">Expected dispatch</dt><dd>{o.expected_dispatch ?? "-"}</dd></div>
      </dl>
      <table className="w-full border-collapse text-left text-sm">
        <thead><tr className="border-y border-black"><th className="py-1 pr-2">#</th><th className="pr-2">Item code</th><th className="pr-2">Item</th><th className="pr-2">Rack</th><th className="pr-2 text-right">Take</th><th className="text-right">Picked</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{l.items?.internal_item_code}</td><td className="pr-2">{l.items?.item_name}</td>
              <td className="pr-2">{(l.items && rack.get(l.items.id)) || "-"}</td>
              <td className="pr-2 text-right">{Number(l.quantity)} {l.items?.unit}</td><td className="text-right">______</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-3 gap-8 pt-16 text-sm"><p className="border-t border-black pt-1">Picked by</p><p className="border-t border-black pt-1">Checked by</p><p className="border-t border-black pt-1">Packed by</p></div>
    </main>
  );
}
