"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Ellipsis, Eye, Loader2, Save, XCircle } from "lucide-react";
import { CONDITIONS, CONDITION_LABEL, MOVABLE_STATUSES, REASONS, REASON_LABEL, RESOLUTIONS, RESOLUTION_LABEL, STATUS_LABEL } from "@/lib/validation/returns";
import { approveReturnAction, createReturnAction, rejectReturnAction, saveInspectionAction, setReturnStatusAction, type ReturnState } from "./actions";

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";
const msgClass = (ok: boolean) => `rounded-lg border p-2 text-sm ${ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`;

export function ReturnRowMenu({ viewHref, inspectHref }: { viewHref: string; inspectHref: string }) {
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
          <li><Link href={inspectHref} className={itemClass} onClick={() => setOpen(false)}><CheckCircle2 size={16} aria-hidden /> Inspection &amp; Resolution</Link></li>
        </ul>
      )}
    </div>
  );
}

export type OrderItem = { item_id: string; code: string; name: string; unit: string; ordered: number; returned: number; remaining: number };

// "Return Details" for a NEW return: pick the dispatched order, then the items that come back.
export function CreateReturnForm({ orders, orderId, baseHref, today, info, items }: {
  orders: { id: string; label: string }[]; orderId: string; baseHref: string; today: string;
  info: { orderDate: string; customer: string; channel: string } | null; items: OrderItem[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ReturnState, FormData>(createReturnAction, null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const readonly = `${field} bg-surface-muted`;
  return (
    <form action={formAction} className="space-y-3" key={orderId || "none"}>
      <label className="block"><span className="mb-1 block text-xs text-muted">Original Order No. *</span>
        <select name="orderId" required value={orderId} onChange={(e) => router.push(`${baseHref}${baseHref.includes("?") ? "&" : "?"}p=create${e.target.value ? `&order=${e.target.value}` : ""}`)} className={field}>
          <option value="">Search order no. or select...</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select></label>
      {info && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-xs text-muted">Order Date</span><input readOnly value={info.orderDate} className={readonly} /></label>
          <label className="block"><span className="mb-1 block text-xs text-muted">Sales Channel</span><input readOnly value={info.channel} className={readonly} /></label>
          <label className="col-span-2 block"><span className="mb-1 block text-xs text-muted">Customer</span><input readOnly value={info.customer} className={readonly} /></label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Return Date *</span><input type="date" name="returnDate" required defaultValue={today} max={today} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Return Reason *</span>
          <select name="reason" required defaultValue="" className={field}><option value="">Select reason</option>{REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}</select></label>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Pickup AWB (optional)</span>
        <input name="pickupAwb" maxLength={60} placeholder="Type the courier's AWB" autoComplete="off" className={`${field} font-mono`} /></label>
      {orderId && (
        <div>
          <p className="mb-1 text-sm font-bold">Item Details</p>
          {items.length === 0 ? <p className="text-xs text-muted">This order has no items.</p> : (
            <ul className="divide-y divide-line text-sm">
              {items.map((it) => {
                const none = it.remaining <= 0;
                return (
                  <li key={it.item_id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-2 py-2">
                    <input type="checkbox" name={`inc_${it.item_id}`} disabled={none} checked={!!picked[it.item_id]} onChange={(e) => setPicked({ ...picked, [it.item_id]: e.target.checked })}
                      aria-label={`Return ${it.code}`} className="mt-3 h-5 w-5" />
                    <div className="min-w-0">
                      <span className="block font-semibold">{it.code}</span>
                      <span className="block truncate text-xs text-muted">{it.name} · ordered {it.ordered} {it.unit}{it.returned > 0 ? `, ${it.returned} already returned` : ""}</span>
                      {picked[it.item_id] && !none && (
                        <span className="mt-1 grid grid-cols-2 gap-2">
                          <input name={`qty_${it.item_id}`} inputMode="decimal" defaultValue={it.remaining} aria-label={`Quantity of ${it.code}`} className="min-h-11 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-right font-mono text-base md:text-sm" />
                          <select name={`cond_${it.item_id}`} defaultValue="GOOD" aria-label={`Condition of ${it.code}`} className="min-h-11 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-base md:text-sm">
                            {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
                          </select>
                        </span>
                      )}
                      {none && <span className="block text-xs text-muted">Everything of this item is already returned.</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <label className="block"><span className="mb-1 block text-xs text-muted">Customer Remarks</span>
        <textarea name="remarks" rows={2} maxLength={300} placeholder="Product received in damaged condition." className={`${field} py-2`} /></label>
      <p className="text-xs text-muted">Making a return does not change stock. Good items go back into stock only when the return is approved.</p>
      {state && !state.ok && <p role="alert" className={msgClass(false)}>{state.message}</p>}
      <button type="submit" disabled={pending || !orderId} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Return
      </button>
    </form>
  );
}

// Move forward by hand.
export function ReturnStatusForm({ returnId, current }: { returnId: string; current: string }) {
  const [state, formAction, pending] = useActionState<ReturnState, FormData>(setReturnStatusAction, null);
  const order = ["PICKUP_PENDING", "IN_TRANSIT", "UNDER_INSPECTION"];
  const options = MOVABLE_STATUSES.filter((s) => order.indexOf(s) > order.indexOf(current));
  if (options.length === 0) return null;
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="returnId" value={returnId} />
      <p className="text-sm font-bold">Update Status</p>
      <select name="status" required defaultValue="" aria-label="New status" className={field}>
        <option value="">Choose...</option>{options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      {state && <p role={state.ok ? "status" : "alert"} className={msgClass(state.ok)}>{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Update Status
      </button>
    </form>
  );
}

export type InspectLine = { itemId: string; code: string; name: string; unit: string; quantity: number; condition: string };

// "Inspection & Resolution": the condition of each item, Refund or Replacement, a note.
export function InspectionForm({ returnId, lines, resolution, note, pickupAwb, editable }: {
  returnId: string; lines: InspectLine[]; resolution: string; note: string; pickupAwb: string; editable: boolean;
}) {
  const [state, formAction, pending] = useActionState<ReturnState, FormData>(saveInspectionAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="returnId" value={returnId} />
      <div>
        <p className="mb-1 text-sm font-bold">Condition of Each Item</p>
        <ul className="divide-y divide-line text-sm">
          {lines.map((l) => (
            <li key={l.itemId} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 py-2">
              <span className="min-w-0"><span className="block font-semibold">{l.code}</span><span className="block truncate text-xs text-muted">{l.name} · {l.quantity} {l.unit}</span></span>
              <select name={`cond_${l.itemId}`} defaultValue={l.condition} disabled={!editable} aria-label={`Condition of ${l.code}`} className="min-h-11 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-base md:text-sm">
                {CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">Only items marked Good go back into stock when the return is approved.</p>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Refund / Replacement</span>
        <select name="resolution" defaultValue={resolution} disabled={!editable} className={field}><option value="">Choose...</option>{RESOLUTIONS.map((r) => <option key={r} value={r}>{RESOLUTION_LABEL[r]}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-xs text-muted">Pickup AWB</span>
        <input name="pickupAwb" maxLength={60} defaultValue={pickupAwb} readOnly={!editable} autoComplete="off" className={`${field} font-mono`} /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted">Inspection Note</span>
        <textarea name="note" rows={2} maxLength={300} defaultValue={note} readOnly={!editable} className={`${field} py-2`} /></label>
      <p className="text-xs text-muted">Refund or Replacement is a record only. No money moves and no new order is made here.</p>
      {state && <p role={state.ok ? "status" : "alert"} className={msgClass(state.ok)}>{state.message}</p>}
      {editable && (
        <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Inspection
        </button>
      )}
    </form>
  );
}

// Approve (good items back into stock) or reject with a reason.
export function DecisionForm({ returnId, canApprove }: { returnId: string; canApprove: boolean }) {
  const [approveState, approveAction, approving] = useActionState<ReturnState, FormData>(approveReturnAction, null);
  const [rejectState, rejectAction, rejecting] = useActionState<ReturnState, FormData>(rejectReturnAction, null);
  if (!canApprove) return <p className="text-xs text-muted">A person who may approve returns decides this one.</p>;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-muted p-3">
      <p className="text-sm font-bold">Decision</p>
      <form action={approveAction} className="space-y-2">
        <input type="hidden" name="returnId" value={returnId} />
        {approveState && <p role={approveState.ok ? "status" : "alert"} className={msgClass(approveState.ok)}>{approveState.message}</p>}
        <button type="submit" disabled={approving} onClick={(e) => { if (!window.confirm("Approve this return? Items marked Good go back into stock now. This cannot be undone here.")) e.preventDefault(); }}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {approving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CheckCircle2 size={16} aria-hidden />} Approve Return
        </button>
      </form>
      <form action={rejectAction} className="space-y-2">
        <input type="hidden" name="returnId" value={returnId} />
        <input name="rejectNote" maxLength={300} placeholder="Reason to reject" aria-label="Reason to reject" className={field} />
        {rejectState && <p role={rejectState.ok ? "status" : "alert"} className={msgClass(rejectState.ok)}>{rejectState.message}</p>}
        <button type="submit" disabled={rejecting} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">
          <XCircle size={16} aria-hidden /> Reject Return
        </button>
      </form>
    </div>
  );
}
