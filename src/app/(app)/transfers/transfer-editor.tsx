"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelTransfer, lookupTransferItem, saveTransfer, searchTransferItems, sendTransfer, suggestLines,
  type Problem, type TransferItem,
} from "./actions";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { parseQuantity } from "@/lib/validation/stock";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

export type TLine = { itemId: string; code: string; name: string; unit: string; decimals: number; quantity: string };
export type Destination = { id: string; code: string; name: string; type: string };

export function TransferEditor({
  transferId, transferNo, fromName, destinations, initialTo, initialNotes, initialLines, canSend,
}: {
  transferId: string | null; transferNo: string | null; fromName: string; destinations: Destination[];
  initialTo: string; initialNotes: string; initialLines: TLine[]; canSend: boolean;
}) {
  const router = useRouter();
  const [to, setTo] = useState(initialTo);
  const [notes, setNotes] = useState(initialNotes);
  const [lines, setLines] = useState<TLine[]>(initialLines);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [found, setFound] = useState<TransferItem[]>([]);
  const [busy, startBusy] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);

  function addItem(it: TransferItem, qty?: number) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.itemId === it.id);
      const step = it.decimals === 0 ? 1 : 0; // metres/kg are typed, not scanned piece by piece
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: qty !== undefined ? String(qty) : String((parseQuantity(copy[i].quantity) ?? 0) + step) };
        return copy;
      }
      return [{ itemId: it.id, code: it.code, name: it.name, unit: it.unit, decimals: it.decimals, quantity: qty !== undefined ? String(qty) : step ? "1" : "" }, ...prev];
    });
  }

  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (now - lastScan.current < MIN_SCAN_GAP_MS) return;
    lastScan.current = now;
    const res = await lookupTransferItem({ code });
    if (res.ok) { addItem(res.item); setFeedback({ ok: true, text: res.item.code }); beep(true); }
    else { setFeedback({ ok: false, text: res.message }); beep(false); }
    scanRef.current?.focus();
  }

  const payload = () => ({
    id: transferId, toLocationId: to, notes,
    lines: lines.map((l) => ({ itemId: l.itemId, quantity: parseQuantity(l.quantity) ?? 0 })),
  });
  function validateLocally(): string | null {
    if (!to) return "Choose the receiving place.";
    if (lines.length === 0) return "Add at least one item.";
    const bad = lines.filter((l) => !(parseQuantity(l.quantity) ?? 0));
    return bad.length ? `Enter a quantity for: ${bad.map((l) => l.code).join(", ")}` : null;
  }

  function run(send: boolean) {
    const err = validateLocally();
    if (err) { setFeedback({ ok: false, text: err }); return; }
    if (send && !window.confirm("Send this transfer? The stock leaves your place now and is on the way until the other place receives it.")) return;
    startBusy(async () => {
      setProblems([]);
      const saved = await saveTransfer(payload());
      if (!saved.ok) { setFeedback({ ok: false, text: saved.message }); setProblems(saved.problems ?? []); return; }
      if (send) {
        const r = await sendTransfer({ id: saved.id });
        if (!r.ok) { setFeedback({ ok: false, text: `Saved as draft ${saved.transferNo}, but not sent: ${r.message}` }); router.push(`/transfers/${saved.id}`); return; }
      }
      if (!transferId || send) router.push(`/transfers/${saved.id}`);
      else { setFeedback({ ok: true, text: `Draft ${saved.transferNo} saved.` }); router.refresh(); }
    });
  }

  function suggest() {
    if (!to) { setFeedback({ ok: false, text: "Choose the receiving place first." }); return; }
    startBusy(async () => {
      const r = await suggestLines({ toLocationId: to });
      if (!r.ok) { setFeedback({ ok: false, text: r.message }); return; }
      if (r.lines.length === 0) { setFeedback({ ok: true, text: "Nothing is below its minimum there, or you have nothing to send for it." }); return; }
      r.lines.forEach((l) => addItem(l, l.quantity));
      setFeedback({ ok: true, text: `${r.lines.length} item(s) added from the minimum levels. Check the quantities.` });
    });
  }

  function cancelDraft() {
    if (!transferId || !window.confirm("Cancel this draft transfer?")) return;
    startBusy(async () => {
      const r = await cancelTransfer({ id: transferId });
      if (r.ok) router.push("/transfers"); else setFeedback({ ok: false, text: r.message });
    });
  }

  const set = (id: string, patch: Partial<TLine>) => setLines((p) => p.map((l) => (l.itemId === id ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><span className={labelClass}>Sending from</span><p className="mt-2 text-sm">{fromName}</p></div>
        <div>
          <label htmlFor="to" className={labelClass}>Sending to *</label>
          <select id="to" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass}>
            <option value="">(choose)</option>
            {destinations.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.code}, {d.type === "SHOP" ? "shop" : "warehouse"})</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>Notes</label>
          <textarea id="notes" rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="space-y-3 rounded border border-neutral-300 p-4">
        <div>
          <label htmlFor="scan" className="block text-sm font-medium">Scan an item barcode (keep this box selected)</label>
          <input id="scan" ref={scanRef} autoComplete="off" inputMode="none" placeholder="Scan here" className={`${inputClass} font-mono`}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ""; void onScan(v); } }} />
          <p role="status" className={`mt-1 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : "text-neutral-500"}`}>{feedback ? feedback.text : "Each scan adds one piece."}</p>
        </div>
        <div>
          <label htmlFor="find" className="block text-sm font-medium">Or search by code or name</label>
          <input id="find" autoComplete="off" placeholder="Type at least 2 letters" className={inputClass}
            onChange={async (e) => setFound(e.target.value.trim().length >= 2 ? await searchTransferItems({ q: e.target.value }) : [])} />
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
        <button type="button" disabled={busy} onClick={suggest} className={secondaryButton}>Fill from the other place&apos;s minimum levels</button>
      </div>

      {lines.length === 0 ? <p className="text-sm text-neutral-500">No items yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Item</th><th className="pr-3">Quantity to send</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.itemId} className="border-b border-neutral-200">
                  <td className="py-2 pr-3">{l.code}<span className="block text-xs text-neutral-500">{l.name}</span></td>
                  <td className="pr-3">
                    <input value={l.quantity} inputMode="decimal" aria-label={`Quantity ${l.code}`} onChange={(e) => set(l.itemId, { quantity: e.target.value })}
                      className={`w-24 rounded border bg-transparent px-2 py-1 text-right font-mono ${l.quantity !== "" && parseQuantity(l.quantity) === null ? "border-red-500" : "border-neutral-400"}`} /> {l.unit}
                  </td>
                  <td><button type="button" className={secondaryButton} onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {problems.length > 0 && <ul role="alert" className="list-inside list-disc text-sm text-red-600">{problems.map((p, i) => <li key={i}>{p.code}: {p.message}</li>)}</ul>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => run(false)} className={secondaryButton}>{busy ? "Working..." : "Save draft"}</button>
        {canSend && <button type="button" disabled={busy} onClick={() => run(true)} className={primaryButton}>Save and send (stock leaves)</button>}
        {transferId && <button type="button" disabled={busy} onClick={cancelDraft} className={secondaryButton}>Cancel draft</button>}
        {!canSend && <span className="text-xs text-neutral-500">Someone with the sending right must send this transfer.</span>}
        {transferNo && <span className="text-xs text-neutral-500">{transferNo}</span>}
      </div>
      {feedback && !feedback.ok && <p role="alert" className="text-sm text-red-600">{feedback.text}</p>}
    </div>
  );
}
