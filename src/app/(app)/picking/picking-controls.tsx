"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Ellipsis, Eye, Loader2, Package, Play, ScanLine, X } from "lucide-react";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { PACKING_LABEL, PACKING_TYPES, PRIORITIES, PRIORITY_LABEL } from "@/lib/validation/picking";
import { cancelPickingAction, markPacked, scanPick, setPickQuantity, startPickingAction, type PickState } from "./actions";

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

export function PickRowMenu({ viewHref, printHref }: { viewHref: string; printHref: string }) {
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
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View</Link></li>
          <li><Link href={printHref} className={itemClass}><Package size={16} aria-hidden /> Print pick list</Link></li>
        </ul>
      )}
    </div>
  );
}

// Start picking: choose the priority (and the order, when none is chosen yet).
export function StartForm({ orders, orderId }: { orders: { id: string; label: string }[]; orderId: string | null }) {
  const [state, formAction, pending] = useActionState<PickState, FormData>(startPickingAction, null);
  return (
    <form action={formAction} className="space-y-3">
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : (
        <label className="block"><span className="mb-1 block text-xs text-muted">Confirmed order *</span>
          <select name="orderId" required className={field}><option value="">Choose an order</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      )}
      <label className="block"><span className="mb-1 block text-xs text-muted">Priority</span>
        <select name="priority" defaultValue="MEDIUM" className={field}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
      <p className="text-xs text-muted">Picking is a record only. Stock goes out when the order is dispatched.</p>
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />} Start Picking
      </button>
    </form>
  );
}

export type PickLine = { itemId: string; code: string; name: string; unit: string; required: number; picked: number; location: string };

// Scan & pick: a scan adds one piece; the number box sets the picked quantity of a line.
export function PickSheet({ jobId, lines, editable }: { jobId: string; lines: PickLine[]; editable: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const last = useRef(0);

  function scan(raw: string) {
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();
    if (now - last.current < MIN_SCAN_GAP_MS) return;
    last.current = now;
    start(async () => {
      const r = await scanPick({ jobId, code: text });
      setMsg({ ok: r.ok, text: r.message });
      beep(r.ok);
      setCode("");
      if (r.ok) router.refresh();
      scanRef.current?.focus();
    });
  }
  function setQty(itemId: string, value: string) {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n)) return;
    start(async () => {
      const r = await setPickQuantity({ jobId, itemId, qty: n });
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });
  }
  return (
    <div className="space-y-3">
      {editable && (
        <div>
          <p className="mb-1 text-sm font-bold">Scan &amp; Pick Items</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative">
              <ScanLine size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input ref={scanRef} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scan(code); } }}
                placeholder="Scan SKU / Barcode..." autoComplete="off" aria-label="Scan SKU or barcode" className={`${field} pl-9 font-mono`} />
            </div>
            <button type="button" onClick={() => scan(code)} disabled={busy} className="inline-flex min-h-12 items-center rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">Add</button>
          </div>
          <p className="mt-1 text-xs text-muted">Each scan adds one piece. For metre or kg items type the quantity in the box.</p>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg border p-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <ul className="divide-y divide-line text-sm">
        {lines.map((l) => {
          const done = l.picked >= l.required;
          return (
            <li key={l.itemId} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 py-2">
              {done ? <CheckCircle2 size={18} aria-label="Picked" className="text-green-600" /> : <Circle size={18} aria-label="Not picked yet" className="text-muted" />}
              <span className="min-w-0"><span className="block font-semibold">{l.code}</span><span className="block truncate text-xs text-muted">{l.name}{l.location ? ` · ${l.location}` : ""}</span></span>
              <span className="flex items-center gap-1.5 text-xs">
                {editable ? (
                  <input key={`${l.itemId}-${l.picked}`} defaultValue={l.picked} onBlur={(e) => { if (e.target.value !== String(l.picked)) setQty(l.itemId, e.target.value); }} inputMode="decimal"
                    aria-label={`Picked ${l.code}`} className="min-h-10 w-16 rounded-lg border border-[var(--line-strong)] bg-surface px-1 text-right font-mono text-base md:text-sm" />
                ) : <span className="font-mono">{l.picked}</span>}
                <span className="font-mono text-muted">/ {l.required} {l.unit}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Packing details + "Mark as Packed".
export function PackForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [type, setType] = useState("");
  const [box, setBox] = useState("");
  const [weight, setWeight] = useState("");
  const [dim, setDim] = useState({ l: "", w: "", h: "" });
  const [remarks, setRemarks] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  function submit() {
    if (!type) { setMsg({ ok: false, text: "Choose the packing type." }); return; }
    start(async () => {
      const r = await markPacked({ jobId, packingType: type, boxNo: box, weight: num(weight), l: num(dim.l), w: num(dim.w), h: num(dim.h), remarks });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }
  const dimBox = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-2 text-center text-base md:text-sm";
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">Packing Details</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Packing Type *</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={field}><option value="">Select Packing Type</option>{PACKING_TYPES.map((t) => <option key={t} value={t}>{PACKING_LABEL[t]}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Box / Packet No. *</span>
          <input value={box} onChange={(e) => setBox(e.target.value)} maxLength={40} placeholder="Enter box/packet no." className={field} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Weight (kg)</span>
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="0.00" className={field} /></label>
        <div><span className="mb-1 block text-xs text-muted">Dimensions (L x W x H cm)</span>
          <div className="grid grid-cols-3 gap-1">
            <input value={dim.l} onChange={(e) => setDim({ ...dim, l: e.target.value })} inputMode="decimal" placeholder="L" aria-label="Length" className={dimBox} />
            <input value={dim.w} onChange={(e) => setDim({ ...dim, w: e.target.value })} inputMode="decimal" placeholder="W" aria-label="Width" className={dimBox} />
            <input value={dim.h} onChange={(e) => setDim({ ...dim, h: e.target.value })} inputMode="decimal" placeholder="H" aria-label="Height" className={dimBox} />
          </div></div>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Remarks (optional)</span>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={300} placeholder="Enter packing remarks..." className={`${field} py-2`} /></label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-lg border p-2 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={submit} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Package size={16} aria-hidden />} Mark as Packed
        </button>
        <button type="button" onClick={() => { setType(""); setBox(""); setWeight(""); setDim({ l: "", w: "", h: "" }); setRemarks(""); setMsg(null); }}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Reset</button>
      </div>
    </div>
  );
}

// Give up before dispatch.
export function CancelPicking({ jobId, orderId }: { jobId: string; orderId: string }) {
  const [state, formAction, pending] = useActionState<PickState, FormData>(cancelPickingAction, null);
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="orderId" value={orderId} />
      <button type="submit" disabled={pending} onClick={(e) => { if (!window.confirm("Stop picking this order? It goes back to Confirmed and the picked quantities are forgotten.")) e.preventDefault(); }}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted disabled:opacity-60"><X size={16} aria-hidden /> Stop picking</button>
      {state && !state.ok && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
    </form>
  );
}
