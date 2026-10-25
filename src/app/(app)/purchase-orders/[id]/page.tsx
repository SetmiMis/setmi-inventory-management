import Link from "next/link";
import { notFound } from "next/navigation";
import { PackagePlus, Printer } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/badge";
import { can, requireAnyPermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { primaryButton, secondaryButton } from "@/lib/ui";
import { PoEditor, type EditorLine } from "../po-editor";
import { PO_STATUS_LABEL, PO_STATUS_TONE } from "../status";
import { PoActions } from "./po-actions";

type LineRow = { id: number; item_id: string; quantity: number; received_qty: number; items: { internal_item_code: string; item_name: string; unit: string } | null };

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAnyPermission("purchase.view", "purchase.create", "purchase.approve");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: o } = await supabase
    .from("purchase_orders")
    .select("id, po_no, supplier_id, location_id, order_date, expected_date, notes, status, sent_at, closed_at, close_note, suppliers(name), locations(code, name)")
    .eq("id", id.data)
    .maybeSingle();
  if (!o) notFound();

  const { data: lineData } = await supabase
    .from("purchase_order_lines")
    .select("id, item_id, quantity, received_qty, items(internal_item_code, item_name, unit)")
    .eq("po_id", o.id)
    .order("id");
  const lines = (lineData ?? []) as unknown as LineRow[];
  // Prices come back only for people with receipts.cost (database rule); everyone else gets none.
  const { data: costData } = await supabase.from("purchase_order_costs").select("line_id, unit_cost").in("line_id", lines.map((l) => l.id));
  const cost = new Map((costData ?? []).map((c) => [c.line_id as number, Number(c.unit_cost)]));
  const canCost = can(user, "receipts.cost");

  const supplier = o.suppliers as unknown as { name: string } | null;
  const place = o.locations as unknown as { code: string; name: string } | null;
  const isDraft = o.status === "DRAFT";
  const canEditDraft = isDraft && can(user, "purchase.create");
  const open = o.status === "SENT" || o.status === "PARTIAL";

  // Receipts made against this order (visible only to people who may see receipts).
  const { data: receiptData } = await supabase
    .from("goods_receipts").select("id, receipt_no, status, receipt_date").eq("purchase_order_id", o.id).order("created_at");
  const receipts = receiptData ?? [];
  const current = await getCurrentLocation(user);
  const canReceiveHere = open && can(user, "receipts.create") && current?.id === o.location_id;

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
    supplierOptions = (sups ?? []).filter((s) => s.is_active || s.id === o.supplier_id).map((s) => ({ id: s.id, name: s.name }));
  }
  const total = canCost ? lines.reduce((s, l) => s + Number(l.quantity) * (cost.get(l.id) ?? 0), 0) : 0;
  const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="space-y-5">
      <p className="text-sm"><Link href="/purchase-orders">Purchase orders</Link> / {o.po_no}</p>
      <div className="flex flex-wrap items-center gap-3">
        <h1>{o.po_no}</h1>
        <Badge tone={PO_STATUS_TONE[o.status] ?? "gray"}>{PO_STATUS_LABEL[o.status] ?? o.status}</Badge>
      </div>

      {canEditDraft ? (
        <PoEditor
          initial={{ poId: o.id, poNo: o.po_no, supplierId: o.supplier_id, orderDate: o.order_date, expectedDate: o.expected_date ?? "", notes: o.notes ?? "", lines: editorLines }}
          suppliers={supplierOptions}
          placeName={`${place?.name} (${place?.code})`}
          canSend={can(user, "purchase.approve")}
          canCost={canCost}
        />
      ) : (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="font-medium">Supplier</dt><dd>{supplier?.name}</dd></div>
            <div><dt className="font-medium">Deliver to</dt><dd>{place?.name} ({place?.code})</dd></div>
            <div><dt className="font-medium">Order date</dt><dd>{o.order_date}</dd></div>
            <div><dt className="font-medium">Expected delivery</dt><dd>{o.expected_date ?? ""}</dd></div>
            {o.sent_at && <div><dt className="font-medium">Sent</dt><dd>{fmtDate(o.sent_at)}</dd></div>}
            {o.closed_at && <div><dt className="font-medium">{o.status === "CANCELLED" ? "Cancelled" : "Closed"}</dt><dd>{fmtDate(o.closed_at)}</dd></div>}
            {o.close_note && <div className="sm:col-span-2"><dt className="font-medium">Reason for closing</dt><dd>{o.close_note}</dd></div>}
            {o.notes && <div className="sm:col-span-2"><dt className="font-medium">Notes</dt><dd>{o.notes}</dd></div>}
          </dl>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr>
                <th>Item</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Still open</th>
                {canCost && <th className="text-right">Price</th>}
              </tr></thead>
              <tbody>
                {lines.map((l) => {
                  const openQty = Math.max(Number(l.quantity) - Number(l.received_qty), 0);
                  return (
                    <tr key={l.id} className="border-b border-line">
                      <td>{l.items?.internal_item_code}<span className="block text-xs text-muted">{l.items?.item_name}</span></td>
                      <td className="text-right font-mono">{Number(l.quantity)} {l.items?.unit}</td>
                      <td className="text-right font-mono">{Number(l.received_qty)}</td>
                      <td className="text-right font-mono">{o.status === "CANCELLED" ? "" : openQty}</td>
                      {canCost && <td className="text-right font-mono">{cost.has(l.id) ? cost.get(l.id) : ""}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {canCost && total > 0 && <p className="mt-2 text-right text-sm">Total value: <strong>{total.toFixed(2)}</strong></p>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canReceiveHere && (
              <Link href={`/receipts/new?po=${o.id}`} className={primaryButton}><PackagePlus size={16} aria-hidden /> Receive goods against this order</Link>
            )}
            <Link href={`/purchase-orders/${o.id}/print`} className={secondaryButton}><Printer size={16} aria-hidden /> Print order</Link>
          </div>
          {open && !canReceiveHere && can(user, "receipts.create") && (
            <p className="text-sm text-muted">To receive goods, switch your working place to {place?.name} ({place?.code}) first.</p>
          )}
          <PoActions id={o.id} status={o.status} canApprove={can(user, "purchase.approve")} />
        </>
      )}

      {receipts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg">Receipts against this order</h2>
          <ul className="space-y-1 text-sm">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <Link href={`/receipts/${r.id}`}>{r.receipt_no}</Link> <span className="text-muted">{r.receipt_date}</span>
                <Badge tone={r.status === "POSTED" ? "green" : r.status === "CANCELLED" ? "gray" : "amber"}>{r.status === "DRAFT" ? "Draft" : r.status === "POSTED" ? "Posted" : "Cancelled"}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
