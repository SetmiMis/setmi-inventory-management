import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SERVICE_LABEL } from "@/lib/validation/dispatch";
import { PACKING_LABEL } from "@/lib/validation/picking";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";

// A plain shipping label for the parcel: who it is for, which courier, the AWB. It is NOT a courier-made label and NOT a tax invoice or e-way bill.
// `id` is the dispatch id.
export default async function ShippingLabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission("dispatch.view", "dispatch.manage");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: d } = await supabase.from("dispatches").select("id, order_id, job_id, dispatch_date, service_type, awb, insurance, pickup_ref, remarks, couriers(name), locations(name, code, address)").eq("id", id.data).maybeSingle();
  if (!d) notFound();
  const { data: o } = await supabase.from("sales_orders").select("order_no, shipping_address, customers(name, phone)").eq("id", d.order_id).maybeSingle();
  const { data: j } = d.job_id ? await supabase.from("pick_pack_jobs").select("packing_type, box_no, weight_kg").eq("id", d.job_id).maybeSingle() : { data: null };
  const { count } = await supabase.from("sales_order_lines").select("id", { count: "exact", head: true }).eq("order_id", d.order_id);
  const courier = d.couriers as unknown as { name: string } | null;
  const from = d.locations as unknown as { name: string; code: string; address: string | null } | null;
  const cust = o?.customers as unknown as { name: string; phone: string | null } | null;

  return (
    <main className="space-y-4 bg-white p-4 text-black">
      <style>{`@media print { @page { size: A5; margin: 8mm; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/dispatch?sel=${d.id}&p=details`} className="text-sm text-blue-700 underline">Back</Link>
        <PrintButton />
      </div>
      <section className="mx-auto max-w-md space-y-3 border-2 border-black p-4 text-sm">
        <header className="flex items-start justify-between border-b border-black pb-2">
          <div><p className="text-lg font-bold">SETMI INDIA</p><p className="text-xs">Order {o?.order_no}</p></div>
          <div className="text-right"><p className="font-semibold">{courier?.name}</p><p className="text-xs">{d.service_type ? SERVICE_LABEL[d.service_type] : ""}{d.insurance ? " · Insured" : ""}</p></div>
        </header>
        <div className="border-b border-black pb-2 text-center">
          <p className="text-xs">AWB / Tracking ID</p>
          <p className="font-mono text-2xl font-bold tracking-wider">{d.awb}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase">Deliver to</p>
          <p className="text-base font-bold">{cust?.name}</p>
          {cust?.phone && <p>Phone: {cust.phone}</p>}
          <p className="whitespace-pre-line">{o?.shipping_address || "-"}</p>
        </div>
        <div className="border-t border-black pt-2">
          <p className="text-xs font-semibold uppercase">Ship from</p>
          <p>{from?.name} ({from?.code}){from?.address ? `, ${from.address}` : ""}</p>
        </div>
        <dl className="grid grid-cols-2 gap-1 border-t border-black pt-2 text-xs">
          <div><dt className="font-semibold">Dispatch date</dt><dd>{d.dispatch_date}</dd></div>
          <div><dt className="font-semibold">Items</dt><dd>{count ?? 0} line(s)</dd></div>
          <div><dt className="font-semibold">Package</dt><dd>{j?.packing_type ? PACKING_LABEL[j.packing_type] : "-"}{j?.box_no ? ` ${j.box_no}` : ""}</dd></div>
          <div><dt className="font-semibold">Weight</dt><dd>{j?.weight_kg != null ? `${Number(j.weight_kg)} kg` : "-"}</dd></div>
          {d.pickup_ref && <div className="col-span-2"><dt className="font-semibold">Pickup reference</dt><dd>{d.pickup_ref}</dd></div>}
          {d.remarks && <div className="col-span-2"><dt className="font-semibold">Remarks</dt><dd>{d.remarks}</dd></div>}
        </dl>
      </section>
    </main>
  );
}
