import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { secondaryButton } from "@/lib/ui";
import { ReceiptEditor, type EditorLine } from "../receipt-editor";

type LineRow = { id: number; item_id: string; quantity: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAnyPermission("receipts.view", "receipts.create", "receipts.post");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("goods_receipts")
    .select("id, receipt_no, supplier_id, receipt_date, supplier_invoice_no, notes, status, posted_at, purchase_order_id, suppliers(name), locations(code, name)")
    .eq("id", id.data)
    .maybeSingle();
  if (!r) notFound();

  const { data: lineData } = await supabase
    .from("goods_receipt_lines")
    .select("id, item_id, quantity, items(internal_item_code, item_name, unit)")
    .eq("receipt_id", r.id)
    .order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];
  // Prices come back only for people with receipts.cost (database rule); everyone else gets none.
  const { data: costData } = await supabase.from("goods_receipt_costs").select("line_id, unit_cost").in("line_id", lines.map((l) => l.id));
  const cost = new Map((costData ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  const canCost = can(user, "receipts.cost");

  const supplier = r.suppliers as unknown as { name: string } | null;
  const place = r.locations as unknown as { code: string; name: string } | null;
  const isDraft = r.status === "DRAFT";
  const canEditDraft = isDraft && can(user, "receipts.create");
  // The order number is shown when this person may see purchase orders; otherwise only that there is one.
  let poNo: string | null = null;
  if (r.purchase_order_id) {
    const { data: po } = await supabase.from("purchase_orders").select("po_no").eq("id", r.purchase_order_id).maybeSingle();
    poNo = po?.po_no ?? null;
  }

  let editorLines: EditorLine[] = [];
  let supplierOptions: { id: string; name: string }[] = [];
  if (canEditDraft) {
    const [{ data: units }, { data: sups }] = await Promise.all([
      supabase.from("units").select("code, decimals"),
      supabase.from("suppliers").select("id, name, is_active").order("name"),
    ]);
    const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
    editorLines = lines.map((l) => ({
      itemId: l.item_id, code: l.items?.internal_item_code ?? "", name: l.items?.item_name ?? "", unit: l.items?.unit ?? "PCS",
      decimals: dec.get(l.items?.unit ?? "PCS") ?? 0, quantity: String(Number(l.quantity)),
      unitCost: cost.has(l.id) ? String(cost.get(l.id)) : "",
    }));
    supplierOptions = (sups ?? []).filter((s) => s.is_active || s.id === r.supplier_id).map((s) => ({ id: s.id, name: s.name }));
  }
  const total = canCost ? lines.reduce((s, l) => s + Number(l.quantity) * (cost.get(l.id) ?? 0), 0) : 0;

  return (
    <main className="space-y-5">
      <p className="text-sm"><Link href="/receipts" className="text-blue-700 underline">Receipts</Link> / {r.receipt_no}</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{r.receipt_no}</h1>
        <span className={`rounded border px-2 py-0.5 text-xs ${r.status === "POSTED" ? "border-green-600 text-green-700" : r.status === "CANCELLED" ? "border-neutral-400" : "border-amber-500"}`}>
          {r.status === "DRAFT" ? "Draft" : r.status === "POSTED" ? "Posted" : "Cancelled"}
        </span>
      </div>

      {canEditDraft ? (
        <ReceiptEditor
          initial={{ receiptId: r.id, receiptNo: r.receipt_no, supplierId: r.supplier_id, receiptDate: r.receipt_date, invoiceNo: r.supplier_invoice_no ?? "", notes: r.notes ?? "", lines: editorLines }}
          suppliers={supplierOptions}
          placeName={`${place?.name} (${place?.code})`}
          canPost={can(user, "receipts.post")}
          canCost={canCost}
          purchaseOrder={r.purchase_order_id ? { id: r.purchase_order_id, poNo: poNo ?? "(order)" } : null}
        />
      ) : (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-medium">Supplier</dt><dd>{supplier?.name}</dd></div>
            <div><dt className="font-medium">Receipt date</dt><dd>{r.receipt_date}</dd></div>
            <div><dt className="font-medium">Supplier invoice</dt><dd>{r.supplier_invoice_no ?? ""}</dd></div>
            <div><dt className="font-medium">Received into</dt><dd>{place?.name} ({place?.code})</dd></div>
            {r.purchase_order_id && (
              <div><dt className="font-medium">Purchase order</dt><dd>{poNo ? <Link href={`/purchase-orders/${r.purchase_order_id}`}>{poNo}</Link> : "Yes (you cannot see orders)"}</dd></div>
            )}
            {r.posted_at && <div><dt className="font-medium">Posted</dt><dd>{new Date(r.posted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</dd></div>}
            {r.notes && <div className="sm:col-span-2"><dt className="font-medium">Notes</dt><dd>{r.notes}</dd></div>}
          </dl>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-neutral-300">
                <th className="py-2 pr-3">Item</th><th className="pr-3 text-right">Quantity</th>{canCost && <th className="pr-3 text-right">Price</th>}
              </tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-200">
                    <td className="py-2 pr-3">{l.items?.internal_item_code}<span className="block text-xs text-neutral-500">{l.items?.item_name}</span></td>
                    <td className="pr-3 text-right font-mono">{Number(l.quantity)} {l.items?.unit}</td>
                    {canCost && <td className="pr-3 text-right font-mono">{cost.has(l.id) ? cost.get(l.id) : ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {canCost && total > 0 && <p className="mt-2 text-right text-sm">Total value: <strong>{total.toFixed(2)}</strong></p>}
          </div>
          <p className="text-sm text-neutral-500">
            {r.status === "POSTED" ? "This receipt is posted and can no longer be changed. To correct a mistake, make a stock count with a reason." : "This receipt was cancelled."}
          </p>
          <div className="flex gap-3">
            <Link href={`/receipts/${r.id}/print`} className={secondaryButton}>Print receipt</Link>
            {r.status === "POSTED" && can(user, "items.view") && <Link href={`/receipts/${r.id}/labels`} className={secondaryButton}>Print labels for these items</Link>}
          </div>
        </>
      )}
    </main>
  );
}
