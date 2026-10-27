"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, Eye, Loader2, Plus, Save, SquarePen } from "lucide-react";
import { CHARGE_TYPES, INCOTERMS } from "@/lib/validation/shipment";
import { addShipmentCharge, saveShipment, updateShipmentStatus, type ShipmentState } from "./actions";

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
const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

// "Add Import Shipment" split button.
export function AddShipmentMenu({ addHref }: { addHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href={addHref} className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Add Import Shipment
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={addHref} className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New shipment</Link></li>
          <li><Link href="/purchase-orders" className={itemClass} onClick={() => setOpen(false)}>Purchase orders</Link></li>
        </ul>
      )}
    </div>
  );
}

export function ShipmentRowMenu({ viewHref, editHref, poHref }: { viewHref: string; editHref: string | null; poHref: string }) {
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
          {editHref && <li><Link href={editHref} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> Edit</Link></li>}
          <li><Link href={poHref} className={itemClass} onClick={() => setOpen(false)}>Open purchase order</Link></li>
        </ul>
      )}
    </div>
  );
}

export type FormLine = { poLineId: number; code: string; name: string; unit: string; ordered: number; free: number; qty: string };
type Shipment = {
  id: string; containerNo: string | null; blNo: string | null; portLoading: string | null; portDischarge: string | null; etd: string | null; eta: string | null;
  shippingLine: string | null; vessel: string | null; incoterms: string | null; notes: string | null;
};

// Add or edit a shipment in the side panel. The order is chosen first (step 1, plain page), so the item list arrives ready.
export function ShipmentForm({ poId, poNo, shipment, lines, cancelHref }: { poId: string; poNo: string; shipment?: Shipment; lines: FormLine[]; cancelHref: string }) {
  const [state, formAction, pending] = useActionState<ShipmentState, FormData>(saveShipment, null);
  const text = (name: string, label: string, value: string | null | undefined, max: number, extra?: { type?: string; upper?: boolean }) => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input name={name} type={extra?.type ?? "text"} maxLength={max} defaultValue={value ?? ""} className={`${field} ${extra?.upper ? "font-mono uppercase" : ""}`} />
    </label>
  );
  return (
    <form action={formAction} className="space-y-3">
      {shipment && <input type="hidden" name="id" value={shipment.id} />}
      <input type="hidden" name="poId" value={poId} />
      <p className="text-sm"><span className="text-muted">Purchase order:</span> <span className="font-semibold">{poNo}</span></p>
      <div className="grid grid-cols-2 gap-2">
        {text("containerNo", "Container no.", shipment?.containerNo, 40, { upper: true })}
        {text("blNo", "BL / AWB no.", shipment?.blNo, 60)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {text("portLoading", "Port of loading", shipment?.portLoading, 80)}
        {text("portDischarge", "Port of discharge", shipment?.portDischarge, 80)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {text("etd", "ETD", shipment?.etd, 10, { type: "date" })}
        {text("eta", "ETA (expected)", shipment?.eta, 10, { type: "date" })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {text("shippingLine", "Shipping line", shipment?.shippingLine, 80)}
        {text("vessel", "Vessel / flight", shipment?.vessel, 80)}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Incoterms</span>
        <select name="incoterms" defaultValue={shipment?.incoterms ?? ""} className={field}>
          <option value="">-</option>
          {INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <fieldset className="rounded-xl border border-line p-3">
        <legend className="px-1 text-xs font-semibold text-muted">Items on this shipment</legend>
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.poLineId} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2 text-sm">
              <label htmlFor={`qty_${l.poLineId}`} className="min-w-0"><span className="block truncate font-semibold">{l.code}</span><span className="block truncate text-xs text-muted">{l.name} · open {l.free} of {l.ordered} {l.unit}</span></label>
              <input id={`qty_${l.poLineId}`} name={`qty_${l.poLineId}`} type="number" min={0} max={l.free} step="any" inputMode="decimal" defaultValue={l.qty} placeholder="0" className={`${field} !min-h-11 text-right font-mono`} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Leave blank or 0 for items that are not on this shipment.</p>
      </fieldset>
      <label className="block"><span className="mb-1 block text-xs text-muted">Notes</span>
        <textarea name="notes" rows={2} maxLength={1000} defaultValue={shipment?.notes ?? ""} className={`${field} py-2`} /></label>
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Link href={cancelHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Cancel</Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} {shipment ? "Save Shipment" : "Add Shipment"}
        </button>
      </div>
    </form>
  );
}

// Move a shipment to its next status with the date it happened.
export function StatusForm({ id, options, today }: { id: string; options: readonly (readonly [string, string])[]; today: string }) {
  const [state, formAction, pending] = useActionState<ShipmentState, FormData>(updateShipmentStatus, null);
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs font-semibold text-muted">Update status</p>
      <div className="grid grid-cols-2 gap-2">
        <select name="status" aria-label="New status" defaultValue={options[0]?.[0]} className={`${field} !min-h-11`}>
          {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <input type="date" name="date" aria-label="Date" defaultValue={today} max={today} className={`${field} !min-h-11`} />
      </div>
      <input name="note" maxLength={300} placeholder="Note (optional)" className={`${field} !min-h-11`} />
      {state && !state.ok && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Update
      </button>
    </form>
  );
}

export function ChargeForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ShipmentState, FormData>(addShipmentCharge, null);
  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs font-semibold text-muted">Add a charge</p>
      <div className="grid grid-cols-2 gap-2">
        <select name="type" aria-label="Charge type" className={`${field} !min-h-11`}>
          {CHARGE_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <input name="amount" type="number" min={0} step="any" inputMode="decimal" required aria-label="Amount" placeholder="Amount" className={`${field} !min-h-11 text-right font-mono`} />
      </div>
      <input name="note" maxLength={200} placeholder="Note (optional)" className={`${field} !min-h-11`} />
      {state && !state.ok && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft disabled:opacity-60">
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Add charge
      </button>
    </form>
  );
}
