"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ScanLine, X } from "lucide-react";
import { lookupEntryItem, saveStockEntry, searchEntryItems, type EntryItem, type Problem } from "./actions";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { parseQuantity } from "@/lib/validation/stock";
import { IN_REASONS, OUT_REASONS, type EntryReason } from "@/lib/validation/stock-entry";
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

type Line = { itemId: string; code: string; name: string; unit: string; decimals: number; quantity: string };
export type EntryLabels = {
  out: string; in: string; reason: string; scan: string; scanHint: string; search: string; searchHint: string; add: string;
  noItems: string; reference: string; referenceHint: string; remarks: string; save: string; saving: string; saved: string;
  remove: string; quantity: string; confirmOut: string; confirmIn: string;
};

export function EntryForm({ placeName, reasonLabels, t }: { placeName: string; reasonLabels: Record<EntryReason, string>; t: EntryLabels }) {
  const router = useRouter();
  const [direction, setDirection] = useState<"OUT" | "IN">("OUT");
  const [reason, setReason] = useState<EntryReason>("SOLD_OUTSIDE");
  const [lines, setLines] = useState<Line[]>([]);
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [found, setFound] = useState<EntryItem[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [busy, start] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);

  const reasons = direction === "OUT" ? OUT_REASONS : IN_REASONS;

  function chooseDirection(d: "OUT" | "IN") {
    setDirection(d);
    setReason(d === "OUT" ? "SOLD_OUTSIDE" : "CUSTOMER_RETURN");
    setProblems([]);
  }

  function addItem(it: EntryItem) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.itemId === it.id);
      const step = it.decimals === 0 ? 1 : 0; // metres/kg: type the quantity
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], quantity: String((parseQuantity(copy[i].quantity) ?? 0) + step) };
        return copy;
      }
      return [{ itemId: it.id, code: it.code, name: it.name, unit: it.unit, decimals: it.decimals, quantity: step ? "1" : "" }, ...prev];
    });
  }

  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (now - lastScan.current < MIN_SCAN_GAP_MS) return;
    lastScan.current = now;
    const res = await lookupEntryItem({ code });
    if (res.ok) {
      addItem(res.item);
      setFeedback({ ok: true, text: res.item.code });
      beep(true);
    } else {
      setFeedback({ ok: false, text: res.message });
      beep(false);
    }
    scanRef.current?.focus();
  }

  function save() {
    if (lines.length === 0) { setFeedback({ ok: false, text: t.noItems }); return; }
    const bad = lines.filter((l) => !(parseQuantity(l.quantity) ?? 0));
    if (bad.length) { setFeedback({ ok: false, text: `${t.quantity}: ${bad.map((l) => l.code).join(", ")}` }); return; }
    const count = lines.length;
    if (!window.confirm(`${direction === "OUT" ? t.confirmOut : t.confirmIn} (${count})`)) return;
    start(async () => {
      setProblems([]);
      const r = await saveStockEntry({
        direction, reason, reference, remarks,
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: parseQuantity(l.quantity) ?? 0 })),
      });
      if (!r.ok) { setFeedback({ ok: false, text: r.message }); setProblems(r.problems ?? []); beep(false); return; }
      setFeedback({ ok: true, text: `${t.saved} ${r.entryNo}` });
      setLines([]); setReference(""); setRemarks("");
      router.refresh();
      scanRef.current?.focus();
    });
  }

  const setQty = (id: string, quantity: string) => setLines((p) => p.map((l) => (l.itemId === id ? { ...l, quantity } : l)));
  const isOut = direction === "OUT";

  return (
    <div className="space-y-5">
      {/* Step 1: in or out, as two big buttons. */}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => chooseDirection("OUT")} aria-pressed={isOut}
          className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 text-lg font-semibold transition ${isOut ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "border-line bg-surface hover:bg-surface-muted"}`}>
          <ArrowUpFromLine size={22} aria-hidden /> {t.out}
        </button>
        <button type="button" onClick={() => chooseDirection("IN")} aria-pressed={!isOut}
          className={`flex items-center justify-center gap-2 rounded-xl border-2 p-4 text-lg font-semibold transition ${!isOut ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300" : "border-line bg-surface hover:bg-surface-muted"}`}>
          <ArrowDownToLine size={22} aria-hidden /> {t.in}
        </button>
      </div>

      {/* Step 2: why. */}
      <div>
        <p className={labelClass}>{t.reason} · {placeName}</p>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t.reason}>
          {reasons.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${reason === r ? "border-brand bg-brand text-white" : "border-line bg-surface hover:bg-surface-muted"}`}>
              {reasonLabels[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: what. */}
      <div className={`${cardClass} space-y-3`}>
        <div>
          <label htmlFor="scan" className="flex items-center gap-2 text-sm font-medium"><ScanLine size={16} aria-hidden /> {t.scan}</label>
          <input id="scan" ref={scanRef} autoFocus autoComplete="off" inputMode="none" placeholder="Scan here" className={`${inputClass} font-mono`}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ""; void onScan(v); }
            }} />
          <p role="status" className={`mt-1 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : "text-muted"}`}>
            {feedback ? feedback.text : t.scanHint}
          </p>
        </div>
        <div>
          <label htmlFor="find" className="block text-sm font-medium">{t.search}</label>
          <input id="find" autoComplete="off" placeholder={t.searchHint} className={inputClass}
            onChange={async (e) => setFound(e.target.value.trim().length >= 2 ? await searchEntryItems({ q: e.target.value }) : [])} />
          {found.length > 0 && (
            <ul className="mt-1 divide-y divide-line rounded-lg border border-line text-sm">
              {found.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span>{it.code} <span className="text-muted">{it.name}</span></span>
                  <button type="button" className={secondaryButton} onClick={() => { addItem(it); setFound([]); }}>{t.add}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-muted">{t.noItems}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.itemId} className={`${cardClass} flex items-center gap-3 p-3`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{l.code}</span>
                <span className="block truncate text-xs text-muted">{l.name}</span>
              </span>
              <input value={l.quantity} inputMode="decimal" aria-label={`${t.quantity} ${l.code}`} onChange={(e) => setQty(l.itemId, e.target.value)}
                className={`w-24 rounded-lg border bg-surface px-2 py-1.5 text-right font-mono text-base ${l.quantity !== "" && parseQuantity(l.quantity) === null ? "border-red-500" : "border-line"}`} />
              <span className="w-10 text-sm text-muted">{l.unit}</span>
              <button type="button" aria-label={`${t.remove} ${l.code}`} onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted"><X size={18} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="reference" className={labelClass}>{t.reference}</label>
          <input id="reference" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} placeholder={t.referenceHint} className={inputClass} />
        </div>
        <div>
          <label htmlFor="remarks" className={labelClass}>{t.remarks}</label>
          <input id="remarks" value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} className={inputClass} />
        </div>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-sm text-red-600">{problems.map((p, i) => <li key={i}>{p.code}: {p.message}</li>)}</ul>
      )}

      <button type="button" disabled={busy} onClick={save} className={`${primaryButton} w-full py-3 text-base sm:w-auto`}>
        <CheckCircle2 size={18} aria-hidden /> {busy ? t.saving : t.save}
      </button>
    </div>
  );
}
