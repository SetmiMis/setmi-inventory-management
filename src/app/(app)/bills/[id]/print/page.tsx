import Link from "next/link";
import { companyLine, getCompany } from "@/lib/company";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";

// A narrow receipt (80 mm roll). It prints the names exactly as saved on the bill. Not a tax invoice.
export default async function BillPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission("bills.view", "bills.create", "bills.void");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const company = await getCompany();
  const supabase = await createClient();
  const { data: b } = await supabase.from("bills").select("*").eq("id", id.data).maybeSingle();
  if (!b) notFound();
  const { data: lines } = await supabase.from("bill_lines").select("id, item_name, unit, quantity, unit_price, line_total").eq("bill_id", b.id).order("id");
  const when = new Date(b.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto max-w-[80mm] space-y-2 bg-white p-2 text-[11pt] text-black">
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/bills/${b.id}`} className="text-sm text-blue-700 underline">Back</Link>
        <PrintButton />
      </div>
      <header className="text-center">
        <p className="text-lg font-bold">{company.name}</p>{companyLine(company) && <p className="text-xs">{companyLine(company)}</p>}
        <p>{b.location_name}</p>
        <p className="text-xs">{b.bill_no}{b.status === "VOIDED" ? " (VOIDED)" : ""}</p>
        <p className="text-xs">{when}</p>
      </header>
      <hr className="border-black" />
      <table className="w-full text-left text-[10pt]">
        <tbody>
          {(lines ?? []).map((l) => (
            <tr key={l.id} className="align-top">
              <td className="py-0.5 pr-1">{l.item_name}<br /><span className="text-[9pt]">{Number(l.quantity)} {l.unit} x {Number(l.unit_price).toFixed(2)}</span></td>
              <td className="py-0.5 text-right">{Number(l.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="border-black" />
      <div className="space-y-0.5 text-right">
        <p>Subtotal {Number(b.subtotal).toFixed(2)}</p>
        {Number(b.discount) > 0 && <p>Discount -{Number(b.discount).toFixed(2)}</p>}
        <p className="text-base font-bold">TOTAL {Number(b.total).toFixed(2)}</p>
        <p className="text-xs">Paid by {b.payment_mode}</p>
      </div>
      <p className="pt-2 text-center text-[9pt]">Thank you. This is not a tax invoice.</p>
    </main>
  );
}
