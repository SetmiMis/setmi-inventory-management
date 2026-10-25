"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelPurchaseOrder, lookupPoItem, savePurchaseOrder, searchPoItems, sendPurchaseOrder,
  type PoItem, type Problem,
} from "./actions";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { parseQuantity } from "@/lib/validation/stock";
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

export type EditorLine = { itemId: string; code: string; name: string; unit: string; decimals: number; quantity: string; unitCost: string };
export type EditorInitial = {
  poId: string | null; poNo: string | null; supplierId: string; orderDate: string; expectedDate: string; notes: string; lines: EditorLine[];
};

export function PoEditor({
  initial, suppliers, placeName, canSend, canCost,
}: {
  initial: EditorInitial;
  suppliers: { id: string; name: string }[];
  placeName: string;
  canSend: boolean;
  canCost: boolean;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [orderDate, setOrderDate] = useState(initial.orderDate);
  const [expectedDate, setExpectedDate] = useState(initial.expectedDate);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<EditorLine[]>(initial.lines);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [found, setFound] = useState<PoItem[]>([]);
  const [busy, startBusy] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);

  function addItem(it: PoItem) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.itemId === it.id);
      const step = it.decimals === 0 ? 1 : 0; // metres/kg: type the quantity
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
    const res = await lookupPoItem({ code });
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
    id: initial.poId, supplierId, orderDate, expectedDate, notes,
    lines: lines.map((l) => ({
      itemId: l.itemId, quantity: parseQuantity(l.quantity) ?? 0,
      unitCost: canCost && l.unitCost.trim() !== "" ? Number(l.unitCost) : null,
    })),
  });

  function validateLocally(): string | null {
    if (!supplierId) return "Choose a supplier.";
    if (!orderDate) return "Choose the order date.";
    if (expectedDate && expectedDate < orderDate) return "The expected date cannot be before the order date.";
    if (lines.length === 0) return "Add at least one item.";
    const bad = lines.filter((l) => !(parseQuantity(l.quantity) ?? 0));
    if (bad.length) return `Enter a quantity for: ${bad.map((l) => l.code).join(", ")}`;
    const badCost = lines.filter((l) => canCost && l.unitCost.trim() !== "" && !Number.isFinite(Number(l.unitCost)));
    if (badCost.length) return `Price is not a number for: ${badCost.map((l) => l.code).join(", ")}`;
    return null;
  }

  function run(send: boolean) {
    const err = validateLocally();
    if (err) { setFeedback({ ok: false, text: err }); return; }
    if (send && !window.confirm("Send this order? It can no longer be edited after sending.")) return;
    startBusy(async () => {
      setProblems([]);
      const saved = await savePurchaseOrder(payload());
      if (!saved.ok) { setFeedback({ ok: false, text: saved.message }); setProblems(saved.problems ?? []); return; }
      if (send) {
        const sent = await sendPurchaseOrder({ id: saved.id });
        if (!sent.ok) { setFeedback({ ok: false, text: `Saved as draft ${saved.poNo}, but not sent: ${sent.message}` }); router.push(`/purchase-orders/${saved.id}`); return; }
      }
      if (!initial.poId || send) router.push(`/purchase-orders/${saved.id}`);
      else { setFeedback({ ok: true, text: `Draft ${saved.poNo} saved.` }); router.refresh(); }
    });
  }

  function cancelDraft() {
    if (!initial.poId || !window.confirm("Cancel this draft order?")) return;
    startBusy(async () => {
      const r = await cancelPurchaseOrder({ id: initial.poId! });
      if (r.ok) router.push("/purchase-orders"); else setFeedback({ ok: false, text: r.message });
    });
  }

  const total = canCost ? lines.reduce((s, l) => s + (parseQuantity(l.quantity) ?? 0) * (Number(l.unitCost) || 0), 0) : 0;
  const set = (id: string, patch: Partial<EditorLine>) => setLines((p) => p.map((l) => (l.itemId === id ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="supplier" className={labelClass}>Supplier *</label>
          <select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>
            <option value="">(choose)</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Deliver to</label>
          <p className="mt-2 text-sm">{placeName}</p>
        </div>
        <div>
          <label htmlFor="odate" className={labelClass}>Order date *</label>
          <input id="odate" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="edate" className={labelClass}>Expected delivery date</label>
          <input id="edate" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>Notes for the supplier</label>
          <textarea id="notes" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className={`${cardClass} space-y-3`}>
        <div>
          <label htmlFor="scan" className="block text-sm font-medium">Scan an item barcode (keep this box selected)</label>
          <input id="scan" ref={scanRef} autoComplete="off" inputMode="none" placeholder="Scan here" className={`${inputClass} font-mono`}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ""; void onScan(v); }
            }} />
          <p role="status" className={`mt-1 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : "text-muted"}`}>
            {feedback ? feedback.text : "Each scan adds one piece."}
          </p>
        </div>
        <div>
          <label htmlFor="find" className="block text-sm font-medium">Or search by code or name</label>
          <input id="find" autoComplete="off" placeholder="Type at least 2 letters" className={inputClass}
            onChange={async (e) => setFound(e.target.value.trim().length >= 2 ? await searchPoItems({ q: e.target.value }) : [])} />
          {found.length > 0 && (
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line text-sm">
              {found.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-1">
                  <span>{it.code} <span className="text-muted">{it.name}</span></span>
                  <button type="button" className={secondaryButton} onClick={() => { addItem(it); setFound([]); }}>Add</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-muted">No items yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr>
              <th>Item</th><th>Quantity</th>{canCost && <th>Buying price (per unit)</th>}<th />
            </tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.itemId} className="border-b border-line">
                  <td>{l.code}<span className="block text-xs text-muted">{l.name}</span></td>
                  <td>
                    <input value={l.quantity} inputMode="decimal" aria-label={`Quantity ${l.code}`} onChange={(e) => set(l.itemId, { quantity: e.target.value })}
                      className={`w-24 rounded-lg border bg-surface px-2 py-1 text-right font-mono ${l.quantity !== "" && parseQuantity(l.quantity) === null ? "border-red-500" : "border-line"}`} /> {l.unit}
                  </td>
                  {canCost && (
                    <td>
                      <input value={l.unitCost} inputMode="decimal" aria-label={`Price ${l.code}`} onChange={(e) => set(l.itemId, { unitCost: e.target.value })}
                        className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-right font-mono" />
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
        {canSend && <button type="button" disabled={busy} onClick={() => run(true)} className={primaryButton}>Save and send</button>}
        {initial.poId && canSend && <button type="button" disabled={busy} onClick={cancelDraft} className={secondaryButton}>Cancel draft</button>}
        {initial.poId && <Link href={`/purchase-orders/${initial.poId}/print`} className="text-sm text-blue-700 underline">Print</Link>}
        {!canSend && <span className="text-xs text-muted">Someone with the approve right must send this order.</span>}
      </div>
      {feedback && !feedback.ok && <p role="alert" className="text-sm text-red-600">{feedback.text}</p>}
    </div>
  );
}
