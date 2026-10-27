"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBill, lookupBillItem, searchBillItems, type BillItem, type Problem } from "./actions";
import { MIN_SCAN_GAP_MS, beep } from "@/lib/client/beep";
import { PAYMENT_MODES, lineTotal, parseMoney } from "@/lib/validation/billing";
import { parseQuantity } from "@/lib/validation/stock";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

type Line = { itemId: string; code: string; name: string; unit: string; decimals: number; listPrice: number | null; priceText: string; qty: string; available: number | null };

export type BillCustomer = { id: string; code: string; name: string; phone: string | null };

export function BillingScreen({ placeName, canOverridePrice, customers = [] }: { placeName: string; canOverridePrice: boolean; customers?: BillCustomer[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [mode, setMode] = useState("CASH");
  const [customerId, setCustomerId] = useState("");
  const [cname, setCname] = useState("");
  const [cphone, setCphone] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [found, setFound] = useState<BillItem[]>([]);
  const [busy, start] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);
  const lastScan = useRef(0);
  // Focus the scan box when the page opens, without scrolling the page down to it.
  useEffect(() => { scanRef.current?.focus({ preventScroll: true }); }, []);

  function addItem(it: BillItem) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.itemId === it.id);
      const step = it.decimals === 0 ? 1 : 0; // metre / kg items: type the quantity
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: String((parseQuantity(copy[i].qty) ?? 0) + step), available: it.available };
        return copy;
      }
      return [{ itemId: it.id, code: it.code, name: it.name, unit: it.unit, decimals: it.decimals, listPrice: it.price,
        priceText: it.price === null ? "" : String(it.price), qty: step ? "1" : "", available: it.available }, ...prev];
    });
  }

  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (now - lastScan.current < MIN_SCAN_GAP_MS) return;
    lastScan.current = now;
    const res = await lookupBillItem({ code });
    if (res.ok) {
      addItem(res.item);
      setFeedback(res.item.price === null ? { ok: false, text: `${res.item.code} has no selling price: it cannot be billed` } : { ok: true, text: `${res.item.name}  ${res.item.price}` });
      beep(res.item.price !== null);
    } else { setFeedback({ ok: false, text: res.message }); beep(false); }
    scanRef.current?.focus();
  }

  const set = (id: string, patch: Partial<Line>) => setLines((p) => p.map((l) => (l.itemId === id ? { ...l, ...patch } : l)));
  const priceOf = (l: Line) => parseMoney(l.priceText);
  const lineSum = (l: Line) => { const q = parseQuantity(l.qty); const p = priceOf(l); return q && p !== null ? lineTotal(q, p) : 0; };
  const subtotal = Math.round(lines.reduce((s, l) => s + lineSum(l), 0) * 100) / 100;
  const disc = discount.trim() === "" ? 0 : parseMoney(discount);
  const total = disc === null ? null : Math.round((subtotal - disc) * 100) / 100;

  function validate(): string | null {
    if (lines.length === 0) return "Add at least one item.";
    for (const l of lines) {
      if (!(parseQuantity(l.qty) ?? 0)) return `Enter a quantity for ${l.code}.`;
      if (priceOf(l) === null) return `${l.code} has no valid price.`;
    }
    if (disc === null) return "Discount is not a valid amount.";
    if (total === null || total < 0) return "Discount cannot be more than the bill.";
    return null;
  }

  function complete() {
    const err = validate();
    if (err) { setFeedback({ ok: false, text: err }); return; }
    if (!window.confirm(`Complete this bill for ${total?.toFixed(2)}? Stock of ${placeName} goes down now.`)) return;
    start(async () => {
      setProblems([]);
      const r = await createBill({
        paymentMode: mode, customerId: customerId || null, customerName: cname, customerPhone: cphone, discount: disc ?? 0,
        lines: lines.map((l) => ({
          itemId: l.itemId, quantity: parseQuantity(l.qty) as number,
          unitPrice: l.listPrice !== null && priceOf(l) === l.listPrice ? null : (priceOf(l) as number),
        })),
      });
      if (!r.ok) { setFeedback({ ok: false, text: r.message }); setProblems(r.problems ?? []); return; }
      router.push(`/bills/${r.id}?new=1`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded border border-neutral-300 p-4">
        <div>
          <label htmlFor="scan" className="block text-sm font-medium">Scan an item (keep this box selected)</label>
          <input id="scan" ref={scanRef} autoComplete="off" inputMode="none" placeholder="Scan here" className={`${inputClass} font-mono`}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; const v = el.value; el.value = ""; void onScan(v); } }} />
          <p role="status" className={`mt-1 min-h-5 text-sm ${feedback ? (feedback.ok ? "text-green-700" : "text-red-600") : "text-neutral-500"}`}>{feedback ? feedback.text : "Each scan adds one piece."}</p>
        </div>
        <div>
          <label htmlFor="find" className="block text-sm font-medium">Or search by code or name</label>
          <input id="find" autoComplete="off" placeholder="Type at least 2 letters" className={inputClass}
            onChange={async (e) => setFound(e.target.value.trim().length >= 2 ? await searchBillItems({ q: e.target.value }) : [])} />
          {found.length > 0 && (
            <ul className="mt-1 divide-y divide-neutral-200 rounded border border-neutral-300 text-sm">
              {found.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-1">
                  <span>{it.name} <span className="text-neutral-500">({it.code}) {it.price ?? "no price"}</span></span>
                  <button type="button" className={secondaryButton} onClick={() => { addItem(it); setFound([]); }}>Add</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {lines.length === 0 ? <p className="text-sm text-neutral-500">No items yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-neutral-300"><th className="py-2 pr-3">Item (as on the bill)</th><th className="pr-3">Quantity</th><th className="pr-3">Price</th><th className="pr-3 text-right">Amount</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => {
                const q = parseQuantity(l.qty);
                const short = l.available !== null && q !== null && q > l.available;
                return (
                  <tr key={l.itemId} className="border-b border-neutral-200">
                    <td className="py-2 pr-3">{l.name}<span className="block text-xs text-neutral-500">{l.code}{l.available !== null ? ` | in stock ${l.available}` : ""}</span>{short && <span className="block text-xs text-red-600">More than in stock</span>}</td>
                    <td className="pr-3">
                      <input onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("scan")?.focus(); } }} value={l.qty} inputMode="decimal" aria-label={`Quantity ${l.code}`} onChange={(e) => set(l.itemId, { qty: e.target.value })}
                        className={`w-20 rounded border bg-transparent px-2 min-h-11 text-base sm:min-h-9 sm:text-sm text-right font-mono ${l.qty !== "" && q === null ? "border-red-500" : "border-neutral-400"}`} /> {l.unit}
                    </td>
                    <td className="pr-3">
                      {canOverridePrice ? (
                        <input onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("scan")?.focus(); } }} value={l.priceText} inputMode="decimal" aria-label={`Price ${l.code}`} onChange={(e) => set(l.itemId, { priceText: e.target.value })}
                          className="w-24 rounded border border-neutral-400 bg-transparent px-2 min-h-11 text-base sm:min-h-9 sm:text-sm text-right font-mono" />
                      ) : <span className="font-mono">{l.listPrice ?? "no price"}</span>}
                    </td>
                    <td className="pr-3 text-right font-mono">{lineSum(l).toFixed(2)}</td>
                    <td><button type="button" className={secondaryButton} onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 rounded border border-neutral-300 p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="discount" className={labelClass}>Discount (rupees)</label>
          <input id="discount" value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="mode" className={labelClass}>Payment *</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {customers.length > 0 && (
          <div className="sm:col-span-2">
            <label htmlFor="customer" className={labelClass}>Customer from your list (optional)</label>
            <select
              id="customer"
              value={customerId}
              onChange={(e) => {
                const c = customers.find((x) => x.id === e.target.value);
                setCustomerId(e.target.value);
                // fills the two boxes below; they can still be changed for this bill
                setCname(c ? c.name.slice(0, 100) : "");
                setCphone(c?.phone ? c.phone.slice(0, 30) : "");
              }}
              className={inputClass}
            >
              <option value="">No customer / walk-in</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="cname" className={labelClass}>Customer name (optional)</label>
          <input id="cname" value={cname} maxLength={100} onChange={(e) => setCname(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="cphone" className={labelClass}>Customer phone (optional)</label>
          <input id="cphone" value={cphone} maxLength={30} inputMode="tel" onChange={(e) => setCphone(e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2 text-right text-sm">
          <p>Subtotal: <strong>{subtotal.toFixed(2)}</strong></p>
          {disc !== null && disc > 0 && <p>Discount: -{disc.toFixed(2)}</p>}
          <p className="text-lg">Total: <strong>{total === null ? "?" : total.toFixed(2)}</strong></p>
        </div>
      </div>

      {problems.length > 0 && <ul role="alert" className="list-inside list-disc text-sm text-red-600">{problems.map((p, i) => <li key={i}>{p.code}: {p.message}</li>)}</ul>}
      {feedback && !feedback.ok && <p role="alert" className="text-sm text-red-600">{feedback.text}</p>}
      <button type="button" disabled={busy || lines.length === 0} onClick={complete} className={primaryButton}>{busy ? "Working..." : "Complete bill (stock goes down)"}</button>
    </div>
  );
}
