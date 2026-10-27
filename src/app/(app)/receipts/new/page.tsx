import Link from "next/link";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { cardClass } from "@/lib/ui";
import { ReceiptEditor, type EditorLine } from "../receipt-editor";

type SearchParams = Record<string, string | string[] | undefined>;
type OpenLine = { item_id: string; code: string; name: string; unit: string; decimals: number; open: number };
type OpenPo = { id: string; po_no: string; status: string; supplier_id: string; location_id: string; lines: OpenLine[] };
type Receivable = { id: string; po_no: string; supplier_name: string; location_id: string; location_code: string; expected_date: string | null };

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePermission("receipts.create");
  const loc = await getCurrentLocation(user);
  if (!loc) return <p role="status" className="rounded border border-amber-500 p-3 text-sm">You are not assigned to a warehouse or shop yet.</p>;

  const sp = await searchParams;
  const poParam = z.uuid().safeParse(Array.isArray(sp.po) ? sp.po[0] : sp.po);

  const supabase = await createClient();
  const { data: suppliers } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  // Receiving against a purchase order: the database function tells what is still open (no prices).
  let po: OpenPo | null = null;
  let poProblem: string | null = null;
  if (poParam.success) {
    const { data, error } = await supabase.rpc("purchase_order_open_lines", { p_id: poParam.data });
    if (error || !data) poProblem = "That purchase order was not found or you cannot receive against it.";
    else po = data as unknown as OpenPo;
    if (po && !(po.status === "SENT" || po.status === "PARTIAL")) { poProblem = "That purchase order is not open for receiving."; po = null; }
    if (po && po.location_id !== loc.id) { poProblem = "That purchase order is for another place. Switch your working place first."; po = null; }
    if (po && po.lines.length === 0) { poProblem = "Everything on that purchase order has been received."; po = null; }
  }

  // Without a chosen order: list the open orders for the places this person works in.
  let receivable: Receivable[] = [];
  if (!poParam.success) {
    const { data } = await supabase.rpc("receivable_purchase_orders");
    receivable = ((data ?? []) as unknown as Receivable[]).filter((r) => r.location_id === loc.id);
  }

  const poLines: EditorLine[] = (po?.lines ?? []).map((l) => ({
    itemId: l.item_id, code: l.code, name: l.name, unit: l.unit, decimals: l.decimals, quantity: String(Number(l.open)), unitCost: "",
  }));

  return (
    <main className="space-y-4">
      <p className="text-sm"><Link href="/receipts">Receipts</Link> / New</p>
      <h1>New goods receipt</h1>
      <p className="text-sm text-muted">A draft does not change stock. Stock goes up only when the receipt is posted.</p>
      {poProblem && <p role="alert" className="rounded border border-amber-500 p-3 text-sm">{poProblem}</p>}

      {receivable.length > 0 && (
        <section className={`${cardClass} space-y-2`}>
          <h2 className="text-base">Open purchase orders for {loc.name}</h2>
          <p className="text-sm text-muted">Pick one to receive against it (quantities are filled in for you), or fill the form below for goods without an order.</p>
          <ul className="space-y-1 text-sm">
            {receivable.map((r) => (
              <li key={r.id}>
                <Link href={`/receipts/new?po=${r.id}`}>{r.po_no}</Link> <span className="text-muted">{r.supplier_name}{r.expected_date ? `, expected ${r.expected_date}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(suppliers ?? []).length === 0 ? (
        <p role="status" className="rounded border border-amber-500 p-3 text-sm">
          There is no supplier yet. {can(user, "suppliers.manage") ? <Link href="/suppliers/new">Create a supplier</Link> : "Ask an administrator to create one."}
        </p>
      ) : (
        <ReceiptEditor
          initial={{ receiptId: null, receiptNo: null, supplierId: po?.supplier_id ?? "", receiptDate: today, invoiceNo: "", notes: "", lines: poLines }}
          suppliers={suppliers ?? []}
          placeName={`${loc.name} (${loc.code})`}
          canPost={can(user, "receipts.post")}
          canCost={can(user, "receipts.cost")}
          purchaseOrder={po ? { id: po.id, poNo: po.po_no } : null}
        />
      )}
    </main>
  );
}

export const metadata = { title: "New Goods Receipt" };
