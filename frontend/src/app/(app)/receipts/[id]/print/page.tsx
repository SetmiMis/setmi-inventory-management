import Link from "next/link";
import { companyLine, getCompany } from "@/lib/company";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";

type LineRow = { id: number; quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

// A plain A4 page for the paper file. The prices column appears only for people with receipts.cost.
export default async function ReceiptPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAnyPermission("receipts.view", "receipts.create", "receipts.post");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const company = await getCompany();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("goods_receipts")
    .select("id, receipt_no, receipt_date, supplier_invoice_no, notes, status, posted_at, suppliers(name, gstin), locations(code, name)")
    .eq("id", id.data).maybeSingle();
  if (!r) notFound();
  const { data: lineData } = await supabase.from("goods_receipt_lines").select("id, quantity, items(internal_item_code, item_name, unit)").eq("receipt_id", r.id).order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];
  const { data: costData } = await supabase.from("goods_receipt_costs").select("line_id, unit_cost").in("line_id", lines.map((l) => l.id));
  const cost = new Map((costData ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  const showCost = can(user, "receipts.cost") && cost.size > 0;
  const sup = r.suppliers as unknown as { name: string; gstin: string | null } | null;
  const place = r.locations as unknown as { code: string; name: string } | null;
  const total = lines.reduce((s, l) => s + Number(l.quantity) * (cost.get(l.id) ?? 0), 0);

  return (
    <main className="space-y-4 bg-white p-4 text-black">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/receipts/${r.id}`} className="text-sm text-blue-700 underline">Back</Link>
        <PrintButton />
      </div>
      <header className="border-b border-black pb-2">
        <p className="text-lg font-bold">{company.name}</p>{companyLine(company) && <p className="text-xs">{companyLine(company)}</p>}
        <p className="text-base font-semibold">Goods Receipt {r.receipt_no}{r.status !== "POSTED" ? ` (${r.status === "DRAFT" ? "DRAFT, not posted" : "CANCELLED"})` : ""}</p>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="font-semibold">Supplier</dt><dd>{sup?.name}{sup?.gstin ? ` (GSTIN ${sup.gstin})` : ""}</dd></div>
        <div><dt className="font-semibold">Date</dt><dd>{r.receipt_date}</dd></div>
        <div><dt className="font-semibold">Supplier invoice</dt><dd>{r.supplier_invoice_no ?? "-"}</dd></div>
        <div><dt className="font-semibold">Received into</dt><dd>{place?.name} ({place?.code})</dd></div>
      </dl>
      <table className="w-full border-collapse text-left text-sm">
        <thead><tr className="border-y border-black"><th className="py-1 pr-2">#</th><th className="pr-2">Item code</th><th className="pr-2">Item</th><th className="pr-2 text-right">Quantity</th>{showCost && <th className="pr-2 text-right">Price</th>}{showCost && <th className="text-right">Amount</th>}</tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{l.items?.internal_item_code}</td><td className="pr-2">{l.items?.item_name}</td>
              <td className="pr-2 text-right">{Number(l.quantity)} {l.items?.unit}</td>
              {showCost && <td className="pr-2 text-right">{cost.get(l.id) ?? ""}</td>}
              {showCost && <td className="text-right">{cost.has(l.id) ? (Number(l.quantity) * (cost.get(l.id) as number)).toFixed(2) : ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {showCost && <p className="text-right text-sm font-semibold">Total: {total.toFixed(2)}</p>}
      {r.notes && <p className="text-sm"><strong>Notes:</strong> {r.notes}</p>}
      <div className="grid grid-cols-2 gap-10 pt-16 text-sm"><p className="border-t border-black pt-1">Received by</p><p className="border-t border-black pt-1">Checked by</p></div>
    </main>
  );
}
