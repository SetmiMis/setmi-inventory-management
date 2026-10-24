"use client";

import { useRef, useState, useTransition } from "react";
import { lookupBarcode, saveScanCount, type StockState } from "../actions";
import { parseQuantity } from "@/lib/validation/stock";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

type Line = {
  itemId: string; code: string; name: string; unit: string; decimals: number;
  current: number | null; counted: string; scans: number;
};

// Same gap Odoo uses between scans: a second scan within 100 ms is treated as an accidental double read.
const MIN_GAP_MS = 100;

export function ScanCount({ placeName }: { placeName: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<StockState>(null);
  const [saving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);
  const audio = useRef<AudioContext | null>(null);

  function beep(ok: boolean) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audio.current ??= new Ctx();
      const o = audio.current.createOscillator();
      const g = audio.current.createGain();
      o.frequency.value = ok ? 880 : 220; // high = found, low = problem
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(audio.current.destination);
      o.start();
      o.stop(audio.current.currentTime + (ok ? 0.08 : 0.25));
    } catch {
      // Sound is a convenience only.
    }
  }

  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (now - lastScan.current < MIN_GAP_MS) return;
    lastScan.current = now;
    setResult(null);

    const res = await lookupBarcode({ code });
    if (!res.ok) {
      setFeedback({ ok: false, text: res.message });
      beep(false);
    } else {
      const it = res.item;
      setLines((prev) => {
        const i = prev.findIndex((l) => l.itemId === it.id);
        // Whole-number units: every scan adds one. Metres/kilograms cannot be counted by scanning
        // each unit, so the line is created and the person types the quantity.
        const step = it.decimals === 0 ? 1 : 0;
        if (i >= 0) {
          const copy = [...prev];
          const cur = parseQuantity(copy[i].counted) ?? 0;
          copy[i] = { ...copy[i], counted: String(cur + step), scans: copy[i].scans + 1 };
          return copy;
        }
        return [{ itemId: it.id, code: it.code, name: it.name, unit: it.unit, decimals: it.decimals,
          current: it.current, counted: step ? "1" : "", scans: 1 }, ...prev];
      });
      setFeedback({ ok: true, text: `${it.code}${it.decimals === 0 ? "" : ": type the quantity in the list"}` });
      beep(true);
    }
    inputRef.current?.focus();
  }

  function change(itemId: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  }
  function bump(l: Line, by: number) {
    const cur = parseQuantity(l.counted) ?? 0;
    const next = Math.max(0, +(cur + by).toFixed(3));
    change(l.itemId, { counted: String(next) });
  }

  const bad = lines.filter((l) => parseQuantity(l.counted) === null);

  function save() {
    if (bad.length > 0) {
      setResult({ ok: false, message: `Fix the quantity for: ${bad.map((l) => l.code).join(", ")}` });
      return;
    }
    startSave(async () => {
      const r = await saveScanCount({
        rows: lines.map((l) => ({ itemId: l.itemId, counted: parseQuantity(l.counted) as number })),
        reason,
        opening,
      });
      setResult(r);
      if (r?.ok) {
        setLines([]);
        setFeedback(null);
        setReason("");
        inputRef.current?.focus();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-neutral-300 p-4">
        <label htmlFor="scan" className="block text-sm font-medium">Scan here (keep this box selected)</label>
        <input
          id="scan"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          inputMode="none"
          placeholder="Scan an item barcode"
          className={`${inputClass} font-mono`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const el = e.currentTarget;
              const value = el.value;
              el.value = "";
              void onScan(value);
            }
          }}
        />
        <p role="status" className={`mt-2 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : ""}`}>
          {feedback ? feedback.text : "Each scan adds one piece to that item."}
        </p>
        <p className="text-xs text-neutral-500">Scan printed labels, not the screen. If a scan types nothing or odd letters, check the scanner is in USB keyboard mode with the Enter suffix on.</p>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing scanned yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-3">Item</th><th className="pr-3 text-right">System shows</th>
                <th className="pr-3">You counted</th><th className="pr-3">Scans</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.itemId} className="border-b border-neutral-200">
                  <td className="py-2 pr-3">{l.code}<span className="block text-xs text-neutral-500">{l.name}</span></td>
                  <td className="pr-3 text-right font-mono">{l.current ?? "?"} {l.unit}</td>
                  <td className="pr-3">
                    <div className="flex items-center gap-1">
                      <button type="button" className={secondaryButton} onClick={() => bump(l, -1)} aria-label={`Minus one ${l.code}`}>-1</button>
                      <input value={l.counted} inputMode="decimal" aria-label={`Counted ${l.code}`}
                        onChange={(e) => change(l.itemId, { counted: e.target.value })}
                        className={`w-24 rounded border px-2 py-1 text-right font-mono ${parseQuantity(l.counted) === null ? "border-red-500" : "border-neutral-400"} bg-transparent`} />
                      <button type="button" className={secondaryButton} onClick={() => bump(l, 1)} aria-label={`Plus one ${l.code}`}>+1</button>
                      <span className="text-xs text-neutral-500">{l.unit}</span>
                    </div>
                  </td>
                  <td className="pr-3">{l.scans}</td>
                  <td><button type="button" className={secondaryButton} onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-3 rounded border border-neutral-300 p-4 text-sm">
        <p>The numbers above REPLACE the stock shown for these items in <strong>{placeName}</strong>. Items you did not scan are not changed.</p>
        <label className="block font-medium" htmlFor="reason">Reason *</label>
        <input id="reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Monthly count" className={inputClass} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={opening} onChange={(e) => setOpening(e.target.checked)} />
          This is opening stock (first entry for these items in this place)
        </label>
        <button type="button" disabled={saving || lines.length === 0} onClick={save} className={primaryButton}>
          {saving ? "Saving..." : `Save ${lines.length} item${lines.length === 1 ? "" : "s"}`}
        </button>
        {result && (
          <div role="status" className={result.ok ? "text-green-700" : "text-red-600"}>
            <p>{result.message}</p>
            {result.problems && (
              <ul className="list-inside list-disc">{result.problems.map((p, i) => <li key={i}>{p.code}: {p.message}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
