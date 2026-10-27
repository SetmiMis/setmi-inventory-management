"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Eye, Loader2, Plus, Printer, Truck } from "lucide-react";
import { CHANGEABLE_STATUSES, SERVICE_LABEL, SERVICE_TYPES, STATUS_LABEL } from "@/lib/validation/dispatch";
import { addCourier, createDispatchAction, setStatusAction, updateDispatchAction, type DispatchState } from "./actions";

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

export function DispatchRowMenu({ viewHref, labelHref }: { viewHref: string; labelHref: string }) {
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
        <ul className="absolute right-0 z-40 mt-2 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View</Link></li>
          <li><Link href={labelHref} className={itemClass}><Printer size={16} aria-hidden /> Print label</Link></li>
        </ul>
      )}
    </div>
  );
}

export type FormInitial = { dispatchId: string; courierId: string; serviceType: string; awb: string; insurance: boolean; pickupRef: string; remarks: string; dispatchDate: string };

// "Create / Update Dispatch": pick a packed order, then the courier details.
export function DispatchForm({ mode, couriers, ready, orderId, orderLabel, baseHref, today, initial, labelHref }: {
  mode: "create" | "update"; couriers: { id: string; name: string }[]; ready: { id: string; label: string }[]; orderId: string | null; orderLabel: string;
  baseHref: string; today: string; initial?: FormInitial; labelHref?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<DispatchState, FormData>(mode === "create" ? createDispatchAction : updateDispatchAction, null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [courierMsg, setCourierMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function pickOrder(id: string) {
    router.push(`${baseHref}${baseHref.includes("?") ? "&" : "?"}p=create${id ? `&order=${id}` : ""}`);
  }
  function saveCourier() {
    start(async () => {
      const r = await addCourier(newName);
      setCourierMsg(r?.message ?? null);
      if (r?.ok) { setNewName(""); setAdding(false); router.refresh(); }
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-3" key={initial?.dispatchId ?? orderId ?? "new"}>
      {mode === "update" && initial && <input type="hidden" name="dispatchId" value={initial.dispatchId} />}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Order No. *</span>
          {mode === "create" ? (
            <select name="orderId" required value={orderId ?? ""} onChange={(e) => pickOrder(e.target.value)} className={field}>
              <option value="">Search order no. or select...</option>
              {ready.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          ) : <input readOnly value={orderLabel} className={`${field} bg-surface-muted`} />}
        </label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Dispatch Date *</span>
          {mode === "create" ? <input type="date" name="dispatchDate" required defaultValue={today} max={today} className={field} />
            : <input readOnly value={initial?.dispatchDate ?? ""} className={`${field} bg-surface-muted`} />}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Courier Partner *</span>
          <select name="courierId" required defaultValue={initial?.courierId ?? ""} className={field}>
            <option value="">Select Courier Partner</option>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Service Type</span>
          <select name="serviceType" defaultValue={initial?.serviceType ?? ""} className={field}>
            <option value="">Select Service Type</option>{SERVICE_TYPES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
          </select></label>
      </div>
      <div className="-mt-1 text-xs">
        {adding ? (
          <span className="flex items-center gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder="New courier name" aria-label="New courier name" className="min-h-10 min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-base md:text-sm" />
            <button type="button" onClick={saveCourier} disabled={busy} className="min-h-10 rounded-lg bg-[var(--brand)] px-3 font-semibold text-white disabled:opacity-60">Add</button>
            <button type="button" onClick={() => { setAdding(false); setCourierMsg(null); }} className="min-h-10 rounded-lg border border-line px-3">Cancel</button>
          </span>
        ) : <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 font-semibold text-[var(--brand-text)]"><Plus size={14} aria-hidden /> Add a courier to the list</button>}
        {courierMsg && <span role="status" className="mt-1 block text-muted">{courierMsg}</span>}
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">AWB / Tracking ID *</span>
        <input name="awb" required minLength={3} maxLength={60} defaultValue={initial?.awb ?? ""} placeholder="Enter AWB / Tracking ID" autoComplete="off" className={`${field} font-mono`} />
        <span className="mt-1 block text-xs text-muted">Type the number the courier gave you.</span></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-12 items-center gap-2 text-sm"><input type="checkbox" name="insurance" value="true" defaultChecked={initial?.insurance} className="h-5 w-5" /> Add Insurance</label>
        {labelHref ? (
          <Link href={labelHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft"><Printer size={16} aria-hidden /> Print Label</Link>
        ) : <span title="Save the dispatch first" className="inline-flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-line text-sm text-muted"><Printer size={16} aria-hidden /> Print Label</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Pickup Reference (optional)</span>
          <input name="pickupRef" maxLength={60} defaultValue={initial?.pickupRef ?? ""} placeholder="Enter pickup reference no." className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Remarks (optional)</span>
          <textarea name="remarks" rows={2} maxLength={300} defaultValue={initial?.remarks ?? ""} placeholder="Enter remarks..." className={`${field} py-2`} /></label>
      </div>
      {mode === "create" && <p className="text-xs text-muted">Pressing Mark as Dispatched takes the packed items out of stock. It cannot be undone here.</p>}
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" disabled={pending || (mode === "create" && !orderId)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Truck size={16} aria-hidden />} {mode === "create" ? "Mark as Dispatched" : "Save Changes"}
        </button>
        <button type="button" onClick={() => formRef.current?.reset()} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Reset</button>
      </div>
    </form>
  );
}

// Change what the courier reports (by hand).
export function StatusForm({ dispatchId, current, today }: { dispatchId: string; current: string; today: string }) {
  const [state, formAction, pending] = useActionState<DispatchState, FormData>(setStatusAction, null);
  const [status, setStatus] = useState("");
  const needsDate = status === "DELIVERED" || status === "DELIVERY_FAILED" || status === "RTO";
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="dispatchId" value={dispatchId} />
      <p className="text-sm font-bold">Change Status</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">New status</span>
          <select name="status" required value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
            <option value="">Choose...</option>
            {CHANGEABLE_STATUSES.filter((s) => s !== current).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Date {needsDate ? "" : "(not needed)"}</span>
          <input type="date" name="date" defaultValue={today} max={today} disabled={!needsDate} className={`${field} disabled:opacity-50`} /></label>
      </div>
      {state && <p role={state.ok ? "status" : "alert"} className={`rounded-lg border p-2 text-sm ${state.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{state.message}</p>}
      <button type="submit" disabled={pending || !status} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Update Status
      </button>
    </form>
  );
}
