"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Ellipsis, ExternalLink, Eye, Loader2, Play, Save, Send, X } from "lucide-react";
import { COUNT_REASONS, REASON_LABEL } from "@/lib/validation/count";
import { createCount, decideCount, saveCountProgress, type CountState } from "./actions";

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

export function CountRowMenu({ id, viewHref }: { id: string; viewHref: string }) {
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
  const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-brand-soft";
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Ellipsis size={18} aria-hidden /></button>
      {open && (
        <ul className="absolute right-0 z-40 mt-2 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View details</Link></li>
          <li><Link href={`/stock/count/${id}`} className={itemClass}><ExternalLink size={16} aria-hidden /> Open count sheet</Link></li>
        </ul>
      )}
    </div>
  );
}

// "Create New Physical Count": the place is the one the person works in; the scope is all items, one category or one rack.
export function CreateCountForm({ placeName, categories, racks }: { placeName: string; categories: { id: string; name: string }[]; racks: string[] }) {
  const [state, formAction, pending] = useActionState<CountState, FormData>(createCount, null);
  const [type, setType] = useState<"FULL" | "CYCLE" | "LOCATION">("FULL");
  const radio = (value: "FULL" | "CYCLE" | "LOCATION", label: string, hint: string) => (
    <label className="flex min-h-11 items-start gap-2 text-sm">
      <input type="radio" name="countType" value={value} checked={type === value} onChange={() => setType(value)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
      <span><span className="font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
    </label>
  );
  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm"><span className="text-muted">Warehouse:</span> <span className="font-semibold">{placeName}</span></p>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-xs text-muted">Count type *</legend>
        {radio("FULL", "Full Count", "Every product with stock or a level here")}
        {radio("CYCLE", "Cycle Count", "One category")}
        {radio("LOCATION", "Location Count", "One rack")}
      </fieldset>
      {type === "CYCLE" && (
        <label className="block"><span className="mb-1 block text-xs text-muted">Category *</span>
          <select name="categoryId" required className={field}><option value="">Choose</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      )}
      {type === "LOCATION" && (
        <label className="block"><span className="mb-1 block text-xs text-muted">Rack *</span>
          <select name="rack" required className={field}><option value="">Choose</option>{racks.map((r) => <option key={r} value={r}>{r}</option>)}</select>
          {racks.length === 0 && <span className="mt-1 block text-xs text-muted">This place has no racks yet (see the Locations / Racks page).</span>}</label>
      )}
      <label className="block"><span className="mb-1 block text-xs text-muted">Notes</span>
        <textarea name="notes" rows={2} maxLength={500} placeholder="Enter notes (optional)" className={`${field} py-2`} /></label>
      <p className="text-xs text-muted">The system quantity is frozen when you create the count. Stock changes only after a manager approves the finished count.</p>
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />} Create Count
      </button>
    </form>
  );
}

// Approve / send back / cancel box.
export function CountDecision({ id, canApprove, waiting, canCancel }: { id: string; canApprove: boolean; waiting: boolean; canCancel: boolean }) {
  const [state, formAction, pending] = useActionState<CountState, FormData>(decideCount, null);
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="id" value={id} />
      {canApprove && waiting && (
        <>
          <p className="text-xs font-semibold text-muted">Decision (stock changes only when you approve)</p>
          <input name="note" maxLength={300} placeholder="Note (needed when sending back)" className="min-h-11 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" name="decision" value="reject" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--danger)] text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-60"><X size={16} aria-hidden /> Send back</button>
            <button type="submit" name="decision" value="approve" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"><Check size={16} aria-hidden /> Approve</button>
          </div>
        </>
      )}
      {canCancel && (
        <button type="submit" name="decision" value="cancel" disabled={pending}
          onClick={(e) => { if (!window.confirm("Cancel this count? Nothing will change in stock.")) e.preventDefault(); }}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">Cancel this count</button>
      )}
      {state && !state.ok && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
    </form>
  );
}

export type SheetLine = { itemId: string; code: string; name: string; unit: string; expected: number; counted: number | null; reason: string };

// The count sheet: a quantity box for every item. Reasons are needed where the count differs from the system.
export function CountSheet({ id, lines, editable }: { id: string; lines: SheetLine[]; editable: boolean }) {
  const [state, formAction, pending] = useActionState<CountState, FormData>(saveCountProgress, null);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.itemId, l.counted === null ? "" : String(l.counted)])));
  const [q, setQ] = useState("");
  const shown = lines.filter((l) => !q || l.code.toLowerCase().includes(q.toLowerCase()) || l.name.toLowerCase().includes(q.toLowerCase()));
  const done = lines.filter((l) => vals[l.itemId] !== "").length;
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">{done} of {lines.length} items counted</p>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item on this sheet" aria-label="Find an item" className="min-h-11 w-64 max-w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" />
      </div>
      <div className="overflow-x-auto">
        <table className="dash-table w-full text-left text-sm">
          <thead><tr><th>SKU</th><th>Item</th><th className="text-right">System</th><th className="text-right">Counted</th><th className="text-right">Difference</th><th>Reason (if different)</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const v = vals[l.itemId] ?? "";
              const diff = v === "" ? null : Number(v) - l.expected;
              const hidden = !!q && !(l.code.toLowerCase().includes(q.toLowerCase()) || l.name.toLowerCase().includes(q.toLowerCase()));
              return (
                <tr key={l.itemId} hidden={hidden}>
                  <td className="whitespace-nowrap text-[13px] font-semibold">{l.code}</td>
                  <td className="min-w-40">{l.name}</td>
                  <td className="text-right font-mono">{l.expected} {l.unit}</td>
                  <td className="text-right">
                    <input name={`counted_${l.itemId}`} type="number" min={0} step="any" inputMode="decimal" value={v} readOnly={!editable}
                      onChange={(e) => setVals((p) => ({ ...p, [l.itemId]: e.target.value }))} aria-label={`Counted ${l.code}`}
                      className="min-h-10 w-28 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-right font-mono text-base md:text-sm read-only:opacity-70" />
                  </td>
                  <td className={`text-right font-mono ${diff === null || diff === 0 ? "text-muted" : diff < 0 ? "text-[var(--danger)]" : "text-green-700 dark:text-green-400"}`}>{diff === null ? "-" : diff > 0 ? `+${diff}` : diff}</td>
                  <td>
                    <select name={`reason_${l.itemId}`} defaultValue={l.reason} disabled={!editable || diff === null || diff === 0} aria-label={`Reason ${l.code}`}
                      className="min-h-10 w-44 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-base md:text-sm disabled:opacity-50">
                      <option value="">-</option>
                      {COUNT_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-4 text-center text-sm text-muted">No item matches.</p>}
      </div>
      {state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-700 dark:text-green-400" : "text-[var(--danger)]"}`}>{state.message}</p>}
      {editable && (
        <div className="flex flex-wrap gap-3">
          <button type="submit" name="intent" value="save" disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface px-5 text-sm font-semibold hover:bg-brand-soft disabled:opacity-60">
            {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save progress
          </button>
          <button type="submit" name="intent" value="submit" disabled={pending}
            onClick={(e) => { if (!window.confirm("Send this count for approval? Every item must be counted.")) e.preventDefault(); }}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            <Send size={16} aria-hidden /> Save and send for approval
          </button>
        </div>
      )}
    </form>
  );
}
