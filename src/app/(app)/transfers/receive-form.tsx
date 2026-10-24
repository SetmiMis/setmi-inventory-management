"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lookupTransferItem, receiveTransfer, type Problem } from "./actions";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { parseQuantity } from "@/lib/validation/stock";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

export type RLine = { itemId: string; code: string; name: string; unit: string; decimals: number; sent: number };

// Receiving: the person enters (or scans) what really arrived. Less than sent is allowed and is
// recorded as a shortage with a note; more than sent is not possible.
export function ReceiveForm({ transferId, lines }: { transferId: string; lines: RLine[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.itemId, String(l.sent)])));
  const [scanMode, setScanMode] = useState(false);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, startBusy] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);

  function toggleScan(on: boolean) {
    setScanMode(on);
    // Scan mode starts every count at 0 so that only what is physically scanned is counted.
    setVals(Object.fromEntries(lines.map((l) => [l.itemId, on ? "0" : String(l.sent)])));
    if (on) setTimeout(() => scanRef.current?.focus(), 0);
  }

  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (now - lastScan.current < MIN_SCAN_GAP_MS) return;
    lastScan.current = now;
    const res = await lookupTransferItem({ code });
    const line = res.ok ? lines.find((l) => l.itemId === res.item.id) : undefined;
    if (!res.ok) { setFeedback({ ok: false, text: res.message }); beep(false); }
    else if (!line) { setFeedback({ ok: false, text: `${res.item.code} is not on this transfer` }); beep(false); }
    else if (line.decimals > 0) { setFeedback({ ok: true, text: `${line.code}: type the quantity in the list` }); beep(true); }
    else {
      setVals((p) => ({ ...p, [line.itemId]: String((parseQuantity(p[line.itemId]) ?? 0) + 1) }));
      setFeedback({ ok: true, text: line.code }); beep(true);
    }
    scanRef.current?.focus();
  }

  const short = lines.some((l) => (parseQuantity(vals[l.itemId]) ?? -1) < l.sent);

  function submit() {
    const bad = lines.filter((l) => parseQuantity(vals[l.itemId]) === null);
    if (bad.length) { setFeedback({ ok: false, text: `Fix the number for: ${bad.map((l) => l.code).join(", ")}` }); return; }
    if (!window.confirm(short ? "Some items arrived short. Receive the transfer and record the shortage?" : "Receive this transfer? Stock is added to your place now.")) return;
    startBusy(async () => {
      setProblems([]);
      const r = await receiveTransfer({ id: transferId, note, received: lines.map((l) => ({ itemId: l.itemId, received: parseQuantity(vals[l.itemId]) as number })) });
      if (!r.ok) { setFeedback({ ok: false, text: r.message }); setProblems(r.problems ?? []); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded border border-neutral-300 p-4">
      <h2 className="font-medium">Receive this transfer</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={scanMode} onChange={(e) => toggleScan(e.target.checked)} /> Check by scanning (counts start at 0, each scan adds one)
      </label>
      {scanMode && (
        <div>
          <input ref={scanRef} autoComplete="off" inputMode="none" placeholder="Scan here" aria-label="Scan an item" className={`${inputClass} font-mono`}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ""; void onScan(v); } }} />
          <p role="status" className={`mt-1 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : "text-neutral-500"}`}>{feedback ? feedback.text : "Scan each piece that arrived."}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Item</th><th className="pr-3 text-right">Sent</th><th className="pr-3">Arrived</th><th>Difference</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const got = parseQuantity(vals[l.itemId]);
              const diff = got === null ? null : +(got - l.sent).toFixed(3);
              return (
                <tr key={l.itemId} className="border-b border-neutral-200">
                  <td className="py-2 pr-3">{l.code}<span className="block text-xs text-neutral-500">{l.name}</span></td>
                  <td className="pr-3 text-right font-mono">{l.sent} {l.unit}</td>
                  <td className="pr-3">
                    <input value={vals[l.itemId]} inputMode="decimal" aria-label={`Arrived ${l.code}`} onChange={(e) => setVals((p) => ({ ...p, [l.itemId]: e.target.value }))}
                      className={`w-24 rounded border bg-transparent px-2 py-1 text-right font-mono ${got === null || got > l.sent ? "border-red-500" : "border-neutral-400"}`} />
                  </td>
                  <td className={diff === null || diff === 0 ? "" : diff < 0 ? "font-medium text-red-600" : "text-red-600"}>
                    {diff === null ? "?" : diff === 0 ? "OK" : diff < 0 ? `${-diff} short` : "more than sent"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <label htmlFor="note" className="block text-sm font-medium">Note {short ? "* (required: some items are short)" : "(optional)"}</label>
        <textarea id="note" rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      {problems.length > 0 && <ul role="alert" className="list-inside list-disc text-sm text-red-600">{problems.map((p, i) => <li key={i}>{p.code ? `${p.code}: ` : ""}{p.message}</li>)}</ul>}
      {feedback && !feedback.ok && !scanMode && <p role="alert" className="text-sm text-red-600">{feedback.text}</p>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={submit} className={primaryButton}>{busy ? "Working..." : "Receive (adds stock)"}</button>
        <button type="button" disabled={busy} onClick={() => toggleScan(false)} className={secondaryButton}>Reset numbers</button>
      </div>
    </div>
  );
}
