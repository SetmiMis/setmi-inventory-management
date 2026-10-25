"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, Eye, Loader2, Lock, LockOpen, Plus, Save, SquarePen } from "lucide-react";
import { assignItemToBin, saveBin, toggleBinBlocked, type BinState } from "./actions";

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

// "Add Location" split button.
export function AddBinMenu({ addHref }: { addHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href={addHref} className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Add Location
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={addHref} className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New rack / bin</Link></li>
          <li><Link href="/locations" className={itemClass} onClick={() => setOpen(false)}>Warehouses and shops</Link></li>
        </ul>
      )}
    </div>
  );
}

// The three dots at the end of a row.
export function BinRowMenu({ id, blocked, viewHref, editHref }: { id: string; blocked: boolean; viewHref: string; editHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View</Link></li>
          <li><Link href={editHref} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> Edit</Link></li>
          <li>
            <form action={toggleBinBlocked}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="block" value={blocked ? "0" : "1"} />
              <button type="submit" className={itemClass}>{blocked ? <LockOpen size={16} aria-hidden /> : <Lock size={16} aria-hidden />} {blocked ? "Unblock" : "Block"}</button>
            </form>
          </li>
        </ul>
      )}
    </div>
  );
}

type Bin = { id: string; locationId: string; rack: string; level: string; binNo: string; binType: string; capacity: number | null; notes: string | null; blocked: boolean; blockReason: string | null };

// Add or edit a rack / shelf / bin in the side panel.
export function BinForm({ bin, places, defaultPlace, cancelHref }: { bin?: Bin; places: { id: string; code: string; name: string }[]; defaultPlace: string; cancelHref: string }) {
  const [state, formAction, pending] = useActionState<BinState, FormData>(saveBin, null);
  const [blocked, setBlocked] = useState(bin?.blocked ?? false);
  return (
    <form action={formAction} className="space-y-3">
      {bin && <input type="hidden" name="id" value={bin.id} />}
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Warehouse / shop *</span>
        <select name="locationId" required defaultValue={bin?.locationId ?? defaultPlace} className={field}>
          {places.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Rack *</span>
          <input name="rack" required maxLength={6} defaultValue={bin?.rack ?? ""} autoCapitalize="characters" placeholder="A" className={`${field} font-mono uppercase`} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Level *</span>
          <input name="level" required maxLength={6} defaultValue={bin?.level ?? ""} autoCapitalize="characters" placeholder="01" className={`${field} font-mono uppercase`} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Bin *</span>
          <input name="binNo" required maxLength={6} defaultValue={bin?.binNo ?? ""} autoCapitalize="characters" placeholder="01" className={`${field} font-mono uppercase`} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Location type</span>
          <select name="binType" defaultValue={bin?.binType ?? "BIN"} className={field}>
            <option value="BIN">Bin</option><option value="SHELF">Shelf</option><option value="PALLET">Pallet</option>
          </select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Capacity (units, optional)</span>
          <input name="capacity" type="number" min={0} step="any" inputMode="decimal" defaultValue={bin?.capacity ?? ""} className={field} /></label>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Notes (optional)</span>
        <textarea name="notes" rows={2} maxLength={500} defaultValue={bin?.notes ?? ""} className={`${field} py-2`} /></label>
      {bin && (
        <>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="blocked" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" /> Blocked / reserved
          </label>
          {blocked && (
            <label className="block"><span className="mb-1 block text-xs text-muted">Reason (optional)</span>
              <input name="blockReason" maxLength={200} defaultValue={bin.blockReason ?? ""} className={field} /></label>
          )}
        </>
      )}
      <p className="text-xs text-muted">The location code is made for you, for example <span className="font-mono">WH01-A-01-01</span>.</p>
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Link href={cancelHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Cancel</Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} {bin ? "Save Location" : "Add Location"}
        </button>
      </div>
    </form>
  );
}

// "Put a product in this bin" by SKU code.
export function AssignForm({ binId }: { binId: string }) {
  const [state, formAction, pending] = useActionState<BinState, FormData>(assignItemToBin, null);
  return (
    <form action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="binId" value={binId} />
      <div className="flex gap-2">
        <input name="sku" required maxLength={60} placeholder="SKU code to add" aria-label="SKU code of the product to add" autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" />
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />} Add
        </button>
      </div>
      {state && <p role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}
