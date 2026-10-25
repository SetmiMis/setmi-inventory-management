"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelReceipt, lookupReceiptItem, postReceipt, saveReceipt, searchReceiptItems,
  type Problem, type ReceiptItem,
} from "./actions";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { parseQuantity } from "@/lib/validation/stock";
import { dangerButton, inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

export type EditorLine = { itemId: string; code: string; name: string; unit: string; decimals: number; quantity: string; unitCost: string };
export type EditorInitial = {
  receiptId: string | null; receiptNo: string | null; supplierId: string; receiptDate: string;
  invoiceNo: string; notes: string; lines: EditorLine[];
};

export function ReceiptEditor({
  initial, suppliers, placeName, canPost, canCost, purchaseOrder = null,
}: {
  initial: EditorInitial;
  suppliers: { id: string; name: string }[];
  placeName: string;
  canPost: boolean;
  canCost: boolean;
  // Set when this receipt is made against a purchase order: the supplier is fixed and the server limits each
  // quantity to what is still open on the order.
  purchaseOrder?: { id: string; poNo: string } | null;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [date, setDate] = useState(initial.receiptDate);
  const [invoiceNo, setInvoiceNo] = useState(initial.invoiceNo);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<EditorLine[]>(initial.lines);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [found, setFound] = useState<ReceiptItem[]>([]);
  const [busy, startBusy] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);

  function addItem(it: ReceiptItem) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.itemId === it.id);
      const step = it.decimals === 0 ? 1 : 0; // metres/kg cannot be counted by scans: type the quantity
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: String((parseQuantity(copy[i].quantity) ?? 0) + step) };
        return copy;
      }
      return [{ itemId: it.id, code: it.code, name: it.name, unit: it.unit, decimals: it.decimals, quantity: step ? "1" : "", unitCost: "" }, ...prev];
    });
  }

  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (now - lastScan.current < MIN_SCAN_GAP_MS) return;
    lastScan.current = now;
    const res = await lookupReceiptItem({ code });
    if (res.ok) {
      addItem(res.item);
      setFeedback({ ok: true, text: `${res.item.code}${res.item.decimals === 0 ? "" : ": type the quantity in the list"}` });
      beep(true);
    } else {
      setFeedback({ ok: false, text: res.message });
      beep(false);
    }
    scanRef.current?.focus();
  }

  const payload = () => ({
    id: initial.receiptId, supplierId, receiptDate: date, invoiceNo, notes, purchaseOrderId: purchaseOrder?.id ?? null,
    lines: lines.map((l) => ({
      itemId: l.itemId, quantity: parseQuantity(l.quantity) ?? 0,
      unitCost: canCost && l.unitCost.trim() !== "" ? Number(l.unitCost) : null,
    })),
  });

  function validateLocally(): string | null {
    if (!supplierId) return "Choose a supplier.";
    if (lines.length === 0) return "Add at least one item.";
    const bad = lines.filter((l) => !(parseQuantity(l.quantity) ?? 0));
    if (bad.length) return `Enter a quantity for: ${bad.map((l) => l.code).join(", ")}`;
    const badCost = lines.filter((l) => canCost && l.unitCost.trim() !== "" && !Number.isFinite(Number(l.unitCost)));
    if (badCost.length) return `Price is not a number for: ${badCost.map((l) => l.code).join(", ")}`;
    return null;
  }

  function run(post: boolean) {
    const err = validateLocally();
    if (err) { setFeedback({ ok: false, text: err }); return; }
    if (post && !window.confirm("Post this receipt? Stock will be added now and the receipt can no longer be edited.")) return;
    startBusy(async () => {
      setProblems([]);
      const saved = await saveReceipt(payload());
      if (!saved.ok) { setFeedback({ ok: false, text: saved.message }); setProblems(saved.problems ?? []); return; }
      if (post) {
        const posted = await postReceipt({ id: saved.id });
        if (!posted.ok) { setFeedback({ ok: false, text: `Saved as draft ${saved.receiptNo}, but not posted: ${posted.message}` }); router.push(`/receipts/${saved.id}`); return; }
      }
      if (!initial.receiptId || post) router.push(`/receipts/${saved.id}`);
      else { setFeedback({ ok: true, text: `Draft ${saved.receiptNo} saved.` }); router.refresh(); }
    });
  }

  function cancelDraft() {
    if (!initial.receiptId || !window.confirm("Cancel this draft receipt?")) return;
    startBusy(async () => {
      const r = await cancelReceipt({ id: initial.receiptId! });
      if (r.ok) router.push("/receipts"); else setFeedback({ ok: false, text: r.message });
    });
  }

  const total = canCost ? lines.reduce((s, l) => s + (parseQuantity(l.quantity) ?? 0) * (Number(l.unitCost) || 0), 0) : 0;
  const set = (id: string, patch: Partial<EditorLine>) => setLines((p) => p.map((l) => (l.itemId === id ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="supplier" className={labelClass}>Supplier *</label>
          <select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!purchaseOrder} className={inputClass}>
            <option value="">(choose)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {purchaseOrder && <p className="mt-1 text-xs text-muted">Against purchase order {purchaseOrder.poNo}. You can receive at most what is still open.</p>}
        </div>
        <div>
          <label htmlFor="date" className={labelClass}>Receipt date *</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="invoice" className={labelClass}>Supplier invoice number</label>
          <input id="invoice" value={invoiceNo} maxLength={60} onChange={(e) => setInvoiceNo(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Receiving into</label>
          <p className="mt-2 text-sm">{placeName}</p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>Notes</label>
          <textarea id="notes" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="space-y-3 rounded border border-neutral-300 p-4">
        <div>
          <label htmlFor="scan" className="block text-sm font-medium">Scan an item barcode (keep this box selected)</label>
          <input id="scan" ref={scanRef} autoFocus autoComplete="off" inputMode="none" placeholder="Scan here" className={`${inputClass} font-mono`}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ""; void onScan(v); }
            }} />
          <p role="status" className={`mt-1 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : "text-neutral-500"}`}>
            {feedback ? feedback.text : "Each scan adds one piece."}
          </p>
        </div>
        <div>
          <label htmlFor="find" className="block text-sm font-medium">Or search by code or name</label>
          <input id="find" autoComplete="off" placeholder="Type at least 2 letters" className={inputClass}
            onChange={async (e) => setFound(e.target.value.trim().length >= 2 ? await searchReceiptItems({ q: e.target.value }) : [])} />
          {found.length > 0 && (
            <ul className="mt-1 divide-y divide-neutral-200 rounded border border-neutral-300 text-sm">
              {found.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-1">
                  <span>{it.code} <span className="text-neutral-500">{it.name}</span></span>
                  <button type="button" className={secondaryButton} onClick={() => { addItem(it); setFound([]); }}>Add</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-500">No items yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300">
              <th className="py-2 pr-3">Item</th><th className="pr-3">Quantity</th>{canCost && <th className="pr-3">Buying price (per unit)</th>}<th />
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.itemId} className="border-b border-neutral-200">
                  <td className="py-2 pr-3">{l.code}<span className="block text-xs text-neutral-500">{l.name}</span></td>
                  <td className="pr-3">
                    <input onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("scan")?.focus(); } }} value={l.quantity} inputMode="decimal" aria-label={`Quantity ${l.code}`} onChange={(e) => set(l.itemId, { quantity: e.target.value })}
                      className={`w-24 rounded border bg-transparent px-2 min-h-11 text-base sm:min-h-9 sm:text-sm text-right font-mono ${l.quantity !== "" && parseQuantity(l.quantity) === null ? "border-red-500" : "border-neutral-400"}`} /> {l.unit}
                  </td>
                  {canCost && (
                    <td className="pr-3">
                      <input onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("scan")?.focus(); } }} value={l.unitCost} inputMode="decimal" aria-label={`Price ${l.code}`} onChange={(e) => set(l.itemId, { unitCost: e.target.value })}
                        className="w-28 rounded border border-neutral-400 bg-transparent px-2 min-h-11 text-base sm:min-h-9 sm:text-sm text-right font-mono" />
                    </td>
                  )}
                  <td><button type="button" className={secondaryButton} onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {canCost && total > 0 && <p className="mt-2 text-right text-sm">Total value: <strong>{total.toFixed(2)}</strong></p>}
        </div>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-sm text-red-600">{problems.map((p, i) => <li key={i}>{p.code}: {p.message}</li>)}</ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => run(false)} className={secondaryButton}>{busy ? "Working..." : "Save draft"}</button>
        {canPost && <button type="button" disabled={busy} onClick={() => run(true)} className={primaryButton}>Save and post (adds stock)</button>}
        {initial.receiptId && <button type="button" disabled={busy} onClick={cancelDraft} className={dangerButton}>Cancel draft</button>}
        {initial.receiptId && <Link href={`/receipts/${initial.receiptId}/print`} className="text-sm text-blue-700 underline">Print</Link>}
        {!canPost && <span className="text-xs text-neutral-500">Someone with the posting right must post this receipt.</span>}
      </div>
      {feedback && !feedback.ok && <p role="alert" className="text-sm text-red-600">{feedback.text}</p>}
    </div>
  );
}
