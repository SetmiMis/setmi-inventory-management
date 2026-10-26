"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Ellipsis, Eye, Loader2, Plus, Save, Search, Trash2, UserPlus, X } from "lucide-react";
import { useActionState } from "react";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/validation/sales-order";
import { decideSalesOrder, saveSalesOrder, searchSalesItems, type DecisionState, type SalesItem } from "./actions";

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";
const money = (v: number) => v.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export type FormCustomer = { id: string; name: string; address: string };
export type FormLine = { itemId: string; code: string; name: string; unit: string; decimals: number; available: number; quantity: string; rate: string };
export type OrderInitial = { id: string | null; customerId: string; channel: string; orderDate: string; expectedDispatch: string; shippingAddress: string; remarks: string; discount: string; shippingCharges: string; lines: FormLine[] };

// "Create New Sales Order" / edit of a waiting order. The order only records what the customer wants: no stock is touched.
export function OrderForm({ customers, today, initial, cancelHref }: { customers: FormCustomer[]; today: string; initial?: OrderInitial; cancelHref: string }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "");
  const [orderDate, setOrderDate] = useState(initial?.orderDate ?? today);
  const [expected, setExpected] = useState(initial?.expectedDispatch ?? "");
  const [address, setAddress] = useState(initial?.shippingAddress ?? "");
  const [remarks, setRemarks] = useState(initial?.remarks ?? "");
  const [discount, setDiscount] = useState(initial?.discount ?? "");
  const [shipping, setShipping] = useState(initial?.shippingCharges ?? "");
  const [lines, setLines] = useState<FormLine[]>(initial?.lines ?? []);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SalesItem[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(text: string) {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => setFound(await searchSalesItems({ q: text })), 250);
  }
  function addItem(it: SalesItem) {
    setLines((prev) => prev.some((l) => l.itemId === it.id) ? prev.map((l) => (l.itemId === it.id ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l))
      : [...prev, { itemId: it.id, code: it.code, name: it.name, unit: it.unit, decimals: it.decimals, available: it.available, quantity: "1", rate: String(it.price) }]);
    setQ(""); setFound([]);
  }
  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c && !address.trim()) setAddress(c.address);
  }
  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));
  const sub = lines.reduce((a, l) => a + (num(l.quantity) || 0) * (num(l.rate) || 0), 0);
  const total = sub - (num(discount) || 0) + (num(shipping) || 0);

  function reset() {
    setCustomerId(initial?.customerId ?? ""); setChannel(initial?.channel ?? ""); setOrderDate(initial?.orderDate ?? today); setExpected(initial?.expectedDispatch ?? "");
    setAddress(initial?.shippingAddress ?? ""); setRemarks(initial?.remarks ?? ""); setDiscount(initial?.discount ?? ""); setShipping(initial?.shippingCharges ?? "");
    setLines(initial?.lines ?? []); setFeedback(null);
  }
  function save() {
    if (!customerId) { setFeedback({ ok: false, text: "Choose a customer." }); return; }
    if (!channel) { setFeedback({ ok: false, text: "Choose the sales channel." }); return; }
    if (lines.length === 0) { setFeedback({ ok: false, text: "Add at least one item." }); return; }
    start(async () => {
      const r = await saveSalesOrder({
        id: initial?.id ?? null, customerId, channel, orderDate, expectedDispatch: expected, shippingAddress: address, remarks,
        discount: num(discount), shippingCharges: num(shipping), lines: lines.map((l) => ({ itemId: l.itemId, quantity: num(l.quantity), rate: num(l.rate) })),
      });
      if (!r.ok) { setFeedback({ ok: false, text: r.message }); return; }
      router.push(`/sales-orders?sel=${r.id}&p=details`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Customer *</span>
          <select value={customerId} onChange={(e) => pickCustomer(e.target.value)} className={field}><option value="">Select customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <Link href="/customers?new=1" aria-label="Add a new customer" title="Add a new customer" className="mt-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand)] text-white hover:bg-brand-strong"><UserPlus size={18} aria-hidden /></Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Order Date *</span><input type="date" value={orderDate} max="2999-12-31" onChange={(e) => setOrderDate(e.target.value)} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Sales Channel *</span>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={field}><option value="">Select Channel</option>{CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select></label>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Expected Dispatch Date</span><input type="date" value={expected} min={orderDate} onChange={(e) => setExpected(e.target.value)} className={field} /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted">Shipping Address</span>
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} placeholder="Enter or select shipping address" className={`${field} py-2`} /></label>

      <div>
        <p className="mb-1 text-sm font-bold">Add Items</p>
        <div className="relative">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search SKU or item name..." autoComplete="off" className={`${field} pl-9`} aria-label="Search item" />
          {found.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
              {found.map((it) => (
                <li key={it.id}><button type="button" onClick={() => addItem(it)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm hover:bg-brand-soft">
                  <span className="min-w-0"><span className="block font-semibold">{it.code}</span><span className="block truncate text-xs text-muted">{it.name}</span></span>
                  <span className="shrink-0 text-right text-xs"><span className="block font-mono">{money(it.price)}</span><span className="block text-muted">in stock {it.available}</span></span></button></li>
              ))}
            </ul>
          )}
        </div>
        {lines.length === 0 ? <p className="mt-2 text-xs text-muted">No items yet. Search above and tap an item.</p> : (
          <ul className="mt-2 space-y-2">
            {lines.map((l) => (
              <li key={l.itemId} className="rounded-xl border border-line p-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm"><span className="block font-semibold">{l.code}</span><span className="block truncate text-xs text-muted">{l.name} · in stock {l.available}</span></span>
                  <button type="button" onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))} aria-label={`Remove ${l.code}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--danger)] hover:bg-red-500/10"><Trash2 size={16} aria-hidden /></button>
                </div>
                <div className="mt-1 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="block text-xs text-muted">Qty ({l.unit})<input value={l.quantity} onChange={(e) => setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, quantity: e.target.value } : x)))} inputMode="decimal" className={`${field} !min-h-11 text-right font-mono`} /></label>
                  <label className="block text-xs text-muted">Rate<input value={l.rate} onChange={(e) => setLines((p) => p.map((x) => (x.itemId === l.itemId ? { ...x, rate: e.target.value } : x)))} inputMode="decimal" className={`${field} !min-h-11 text-right font-mono`} /></label>
                  <span className="pb-2 text-right font-mono text-sm">{money((num(l.quantity) || 0) * (num(l.rate) || 0))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="block"><span className="mb-1 block text-xs text-muted">Remarks (optional)</span>
        <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={500} placeholder="Enter remarks..." className={`${field} py-2`} /></label>
      <dl className="space-y-1 rounded-xl border border-line bg-surface-muted p-3 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Sub Total</dt><dd className="font-mono">{money(sub)}</dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-muted">Discount</dt><dd><input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Discount" className="min-h-10 w-28 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-right font-mono text-base md:text-sm" /></dd></div>
        <div className="flex items-center justify-between gap-2"><dt className="text-muted">Shipping Charges</dt><dd><input value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Shipping charges" className="min-h-10 w-28 rounded-lg border border-[var(--line-strong)] bg-surface px-2 text-right font-mono text-base md:text-sm" /></dd></div>
        <div className="flex justify-between border-t border-line pt-1 font-bold"><dt>Grand Total</dt><dd className="font-mono">{money(total)}</dd></div>
        <p className="text-xs text-muted">No tax is added yet (tax will be set up later with the accountant).</p>
      </dl>
      {feedback && <p role={feedback.ok ? "status" : "alert"} className={`rounded-lg border p-2 text-sm ${feedback.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{feedback.text}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={save} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Order
        </button>
        {initial ? <Link href={cancelHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Cancel</Link>
          : <button type="button" onClick={reset} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Reset</button>}
      </div>
    </div>
  );
}

// Confirm / cancel box of an order.
export function OrderDecision({ id, canConfirm, canCancel, pending }: { id: string; canConfirm: boolean; canCancel: boolean; pending: boolean }) {
  const [state, formAction, busy] = useActionState<DecisionState, FormData>(decideSalesOrder, null);
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="id" value={id} />
      {canCancel && <input name="note" maxLength={300} placeholder="Note when cancelling (optional)" className="min-h-11 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" />}
      <div className={`grid gap-2 ${canConfirm && pending && canCancel ? "grid-cols-2" : "grid-cols-1"}`}>
        {canCancel && (
          <button type="submit" name="decision" value="cancel" disabled={busy}
            onClick={(e) => { if (!window.confirm("Cancel this order?")) e.preventDefault(); }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--danger)] text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-60"><X size={16} aria-hidden /> Cancel Order</button>
        )}
        {canConfirm && pending && (
          <button type="submit" name="decision" value="confirm" disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"><Check size={16} aria-hidden /> Confirm Order</button>
        )}
      </div>
      {state && !state.ok && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
    </form>
  );
}

export function OrderRowMenu({ viewHref }: { viewHref: string }) {
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
          <li><Link href="/customers" className={itemClass}><Plus size={16} aria-hidden /> Customers</Link></li>
        </ul>
      )}
    </div>
  );
}
