import Image from "next/image";
import { getCompany } from "@/lib/company";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";

type LineRow = { id: number; quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

// A plain A4 page to send to the supplier. Prices appear only for people who may see them. Not a tax invoice.
export default async function PurchaseOrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAnyPermission("purchase.view", "purchase.create", "purchase.approve");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const company = await getCompany();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, expected_date, notes, status, suppliers(name, contact_person, phone, address), locations(code, name)")
    .eq("id", id.data).maybeSingle();
  if (!o) notFound();
  const { data: lineData } = await supabase
    .from("purchase_order_lines").select("id, quantity, items(internal_item_code, item_name, unit)").eq("po_id", o.id).order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];
  const { data: costData } = await supabase.from("purchase_order_costs").select("line_id, unit_cost").in("line_id", lines.map((l) => l.id));
  const cost = new Map((costData ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  const canCost = can(user, "receipts.cost");
  const total = canCost ? lines.reduce((s, l) => s + Number(l.quantity) * (cost.get(l.id) ?? 0), 0) : 0;
  const sup = o.suppliers as unknown as { name: string; contact_person: string | null; phone: string | null; address: string | null } | null;
  const place = o.locations as unknown as { code: string; name: string } | null;

  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-black">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/purchase-orders/${o.id}`} className="text-sm text-blue-700 underline">Back</Link>
        <PrintButton />
      </div>
      <header className="flex items-start justify-between border-b border-black pb-3">
        <div className="flex items-center gap-3">
          <Image src="/brand/setmi-badge-96.png" alt="" width={48} height={48} className="h-12 w-12 rounded-full" />
          <div>
            <p className="text-xl font-bold">{company.name}</p>
            <p className="text-sm">Purchase order</p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-lg font-bold">{o.po_no}{o.status === "CANCELLED" ? " (CANCELLED)" : ""}</p>
          <p>Date: {o.order_date}</p>
          {o.expected_date && <p>Expected: {o.expected_date}</p>}
        </div>
      </header>
      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-semibold">To</p>
          <p>{sup?.name}</p>
          {sup?.contact_person && <p>{sup.contact_person}</p>}
          {sup?.phone && <p>{sup.phone}</p>}
          {sup?.address && <p className="whitespace-pre-line">{sup.address}</p>}
        </div>
        <div>
          <p className="font-semibold">Deliver to</p>
          <p>{place?.name} ({place?.code})</p>
        </div>
      </section>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-black"><th className="py-1">Item</th><th className="text-right">Quantity</th>{canCost && <th className="text-right">Price</th>}{canCost && <th className="text-right">Amount</th>}</tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-neutral-300 align-top">
              <td className="py-1">{l.items?.internal_item_code} {l.items?.item_name}</td>
              <td className="text-right">{Number(l.quantity)} {l.items?.unit}</td>
              {canCost && <td className="text-right">{cost.has(l.id) ? cost.get(l.id)!.toFixed(2) : ""}</td>}
              {canCost && <td className="text-right">{cost.has(l.id) ? (Number(l.quantity) * cost.get(l.id)!).toFixed(2) : ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {canCost && total > 0 && <p className="text-right text-base font-bold">Total {total.toFixed(2)}</p>}
      {o.notes && <p className="text-sm"><span className="font-semibold">Notes:</span> {o.notes}</p>}
      <p className="pt-6 text-xs">This is a purchase order, not a tax invoice. Please quote the order number on your invoice.</p>
    </main>
  );
}
