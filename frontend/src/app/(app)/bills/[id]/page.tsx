import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { secondaryButton } from "@/lib/ui";
import { VoidForm } from "../void-form";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const user = await requireAnyPermission("bills.view", "bills.create", "bills.void");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const justMade = (await searchParams).new === "1";

  const supabase = await createClient();
  const { data: b } = await supabase.from("bills").select("*").eq("id", id.data).maybeSingle();
  if (!b) notFound();
  const { data: lines } = await supabase.from("bill_lines").select("id, item_code, item_name, unit, quantity, unit_price, line_total").eq("bill_id", b.id).order("id");
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "");

  return (
    <main className="space-y-5">
      <p className="text-sm"><Link href="/bills" className="text-blue-700 underline">Bills</Link> / {b.bill_no}</p>
      {justMade && <p role="status" className="rounded border border-green-600 p-3 text-sm text-green-700">Bill made. Stock has been reduced.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{b.bill_no}</h1>
        <span className={`rounded border px-2 py-0.5 text-xs ${b.status === "VOIDED" ? "border-red-500 text-red-600" : "border-green-600 text-green-700"}`}>{b.status === "VOIDED" ? "Voided" : "Done"}</span>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">Shop</dt><dd>{b.location_name} ({b.location_code})</dd></div>
        <div><dt className="font-medium">Made</dt><dd>{when(b.created_at)}</dd></div>
        <div><dt className="font-medium">Payment</dt><dd>{b.payment_mode}</dd></div>
        <div><dt className="font-medium">Customer</dt><dd>{[b.customer_name, b.customer_phone].filter(Boolean).join(", ")}</dd></div>
        {b.status === "VOIDED" && <div className="sm:col-span-2"><dt className="font-medium">Voided</dt><dd>{when(b.voided_at)}: {b.void_reason}</dd></div>}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Item</th><th className="pr-3 text-right">Qty</th><th className="pr-3 text-right">Price</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-2 pr-3">{l.item_name}<span className="block text-xs text-neutral-500">{l.item_code}</span></td>
                <td className="pr-3 text-right font-mono">{Number(l.quantity)} {l.unit}</td>
                <td className="pr-3 text-right font-mono">{Number(l.unit_price).toFixed(2)}</td>
                <td className="text-right font-mono">{Number(l.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 space-y-1 text-right text-sm">
          <p>Subtotal: {Number(b.subtotal).toFixed(2)}</p>
          {Number(b.discount) > 0 && <p>Discount: -{Number(b.discount).toFixed(2)}</p>}
          <p className="text-lg">Total: <strong>{Number(b.total).toFixed(2)}</strong></p>
        </div>
      </div>
      <p className="text-xs text-neutral-500">This is a simple bill without tax. It is not a tax invoice.</p>
      <Link href={`/bills/${b.id}/print`} className={secondaryButton + " inline-block"}>Print receipt</Link>
      {b.status === "COMPLETED" && can(user, "bills.void") && <VoidForm billId={b.id} />}
    </main>
  );
}
