"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Ellipsis, Eye, Loader2, Save, SquarePen } from "lucide-react";
import { saveQualityResults, type QcState } from "./actions";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, root };
}

const menuClass = "absolute right-0 z-40 mt-2 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl";
const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-brand-soft";
const field = "min-h-11 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

export function QcRowMenu({ viewHref, inspectHref, receiptHref }: { viewHref: string; inspectHref: string | null; receiptHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View</Link></li>
          {inspectHref && <li><Link href={inspectHref} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> Record results</Link></li>}
          <li><Link href={receiptHref} className={itemClass} onClick={() => setOpen(false)}>Open goods receipt</Link></li>
        </ul>
      )}
    </div>
  );
}

export type QcLine = { id: number; code: string; name: string; unit: string; qty: number; passed: number; rejected: number; rework: number; reason: string };

// Results form: for every item, how many passed, were rejected or need rework (must add up to the received quantity).
// "Passed" starts as the whole quantity for a check that has not been done yet, so only the problem pieces need typing.
export function ResultsForm({ id, date, today, remarks, lines, fresh, cancelHref }: { id: string; date: string; today: string; remarks: string; lines: QcLine[]; fresh: boolean; cancelHref: string }) {
  const [state, formAction, pending] = useActionState<QcState, FormData>(saveQualityResults, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block"><span className="mb-1 block text-xs text-muted">QC date</span>
        <input type="date" name="date" defaultValue={date} max={today} required className={field} /></label>
      <ul className="space-y-3">
        {lines.map((l) => (
          <li key={l.id} className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">{l.code} <span className="font-normal text-muted">· received {l.qty} {l.unit}</span></p>
            <p className="mb-2 truncate text-xs text-muted">{l.name}</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-xs text-muted">Passed
                <input name={`passed_${l.id}`} type="number" min={0} max={l.qty} step="any" inputMode="decimal" defaultValue={fresh ? l.qty : l.passed} className={`${field} mt-0.5 text-right font-mono`} /></label>
              <label className="block text-xs text-muted">Rejected
                <input name={`rejected_${l.id}`} type="number" min={0} max={l.qty} step="any" inputMode="decimal" defaultValue={l.rejected || ""} placeholder="0" className={`${field} mt-0.5 text-right font-mono`} /></label>
              <label className="block text-xs text-muted">Rework
                <input name={`rework_${l.id}`} type="number" min={0} max={l.qty} step="any" inputMode="decimal" defaultValue={l.rework || ""} placeholder="0" className={`${field} mt-0.5 text-right font-mono`} /></label>
            </div>
            <input name={`reason_${l.id}`} maxLength={200} defaultValue={l.reason} placeholder="Reason (needed for rejected / rework)" className={`${field} mt-2`} />
          </li>
        ))}
      </ul>
      <label className="block"><span className="mb-1 block text-xs text-muted">Remarks</span>
        <textarea name="remarks" rows={2} maxLength={1000} defaultValue={remarks} className={`${field} py-2`} /></label>
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Link href={cancelHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Cancel</Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Results
        </button>
      </div>
    </form>
  );
}
