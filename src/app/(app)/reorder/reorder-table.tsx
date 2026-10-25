"use client";

import { useMemo, useState, useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { createDraftPoFromReorder } from "./actions";
import { parseQuantity } from "@/lib/validation/stock";
import { inputClass, primaryButton } from "@/lib/ui";

export type ReorderRow = {
  item_id: string; internal_item_code: string; item_name: string; unit: string; location_id: string; location_code: string;
  on_hand: number; incoming_po: number; incoming_transfer: number; consumed: number; avg_daily: number; days_of_cover: number | null;
  lead_time_days: number | null; safety_factor: number | null; moq: number | null; max_qty: number | null;
  target: number | null; target_source: string | null; suggested: number;
};

const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: unknown) => n(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });

// The reorder table. When one place is chosen and the person may make purchase orders, the rows with a
// suggestion can be ticked and turned into one draft purchase order for a chosen supplier.
export function ReorderTable({
  rows, days, canCreate, placeId, suppliers,
}: {
  rows: ReorderRow[];
  days: number;
  canCreate: boolean;
  placeId: string | null;
  suppliers: { id: string; name: string }[];
}) {
  const orderable = useMemo(() => rows.filter((r) => n(r.suggested) > 0), [rows]);
  // Quantities are kept as typed text (so "2." and "0.5" can be typed) and parsed only when the order is made.
  const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries(orderable.map((r) => [r.item_id, String(n(r.suggested))])));
  const [supplierId, setSupplierId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const selectable = canCreate && !!placeId;

  function toggle(r: ReorderRow) {
    setPicked((p) => {
      const copy = { ...p };
      if (r.item_id in copy) delete copy[r.item_id];
      else copy[r.item_id] = String(n(r.suggested));
      return copy;
    });
  }

  function create() {
    const bad = Object.entries(picked).filter(([, q]) => parseQuantity(q) === null);
    if (bad.length) { setMsg("A quantity is not a valid number."); return; }
    const lines = Object.entries(picked)
      .map(([itemId, q]) => ({ itemId, quantity: parseQuantity(q) ?? 0 }))
      .filter((l) => l.quantity > 0);
    if (!supplierId) { setMsg("Choose a supplier."); return; }
    if (lines.length === 0) { setMsg("Tick at least one item."); return; }
    start(async () => {
      const r = await createDraftPoFromReorder({ locationId: placeId, supplierId, lines });
      if (r && !r.ok) setMsg(r.message);
    });
  }

  return (
    <div className="space-y-4">
      {selectable && orderable.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-brand bg-brand-soft p-4">
          <div>
            <label htmlFor="supplier" className="block text-sm font-medium">Supplier for the draft purchase order</label>
            <select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${inputClass} w-64`}>
              <option value="">(choose)</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button type="button" disabled={busy} onClick={create} className={primaryButton}>
            <ClipboardList size={16} aria-hidden /> {busy ? "Creating..." : `Create draft order (${Object.keys(picked).length} items)`}
          </button>
          <p className="text-xs text-muted">Nothing is sent: the draft opens so you can check quantities and prices first.</p>
          {msg && <p role="alert" className="w-full text-sm text-red-600">{msg}</p>}
        </div>
      )}
      {canCreate && !placeId && orderable.length > 0 && (
        <p className="text-sm text-muted">To make a purchase order from this list, choose one place above (an order is for one place).</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {selectable && <th className="w-8"><span className="sr-only">Pick</span></th>}
              <th>Item</th><th>Place</th>
              <th className="text-right">In stock</th>
              <th className="text-right">Coming</th>
              <th className="text-right">Used ({days}d)</th>
              <th className="text-right">Per day</th>
              <th className="text-right">Days left</th>
              <th className="text-right">Target</th>
              <th className="text-right">Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const coming = n(r.incoming_po) + n(r.incoming_transfer);
              const short = r.days_of_cover !== null && r.lead_time_days !== null && n(r.days_of_cover) < n(r.lead_time_days);
              return (
                <tr key={`${r.item_id}-${r.location_id}`} className="border-b border-line">
                  {selectable && (
                    <td>
                      {n(r.suggested) > 0 && (
                        <input type="checkbox" checked={r.item_id in picked} onChange={() => toggle(r)} aria-label={`Order ${r.internal_item_code}`} className="h-4 w-4" />
                      )}
                    </td>
                  )}
                  <td>
                    <span className="block font-medium">{r.internal_item_code}</span>
                    <span className="block text-xs text-muted">{r.item_name}</span>
                  </td>
                  <td>{r.location_code}</td>
                  <td className="text-right font-mono">{fmt(r.on_hand)} {r.unit}</td>
                  <td className="text-right font-mono" title={`On order ${fmt(r.incoming_po)}, on the way ${fmt(r.incoming_transfer)}`}>{coming ? fmt(coming) : ""}</td>
                  <td className="text-right font-mono">{fmt(r.consumed)}</td>
                  <td className="text-right font-mono">{n(r.avg_daily) ? fmt(r.avg_daily) : ""}</td>
                  <td className={`text-right font-mono ${short ? "font-semibold text-red-600" : ""}`}>{r.days_of_cover === null ? "" : fmt(r.days_of_cover)}</td>
                  <td className="text-right font-mono">
                    {r.target === null ? <span className="text-xs text-muted">set lead time</span> : (
                      <>
                        {fmt(r.target)}
                        <span className="block text-[11px] text-muted">
                          {r.target_source === "formula" ? `${fmt(r.avg_daily)} x ${r.lead_time_days}d x ${n(r.safety_factor) || 1.5}` : "manual max"}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="text-right">
                    {n(r.suggested) > 0 ? (
                      selectable && r.item_id in picked ? (
                        <input
                          value={picked[r.item_id]}
                          inputMode="decimal"
                          aria-label={`Quantity ${r.internal_item_code}`}
                          onChange={(e) => { const value = e.target.value; setPicked((p) => ({ ...p, [r.item_id]: value })); }}
                          className={`w-24 rounded-lg border bg-surface px-2 py-1 text-right font-mono font-semibold ${picked[r.item_id] !== "" && parseQuantity(picked[r.item_id]) === null ? "border-red-500" : "border-line"}`}
                        />
                      ) : <span className="font-mono font-semibold">{fmt(r.suggested)}</span>
                    ) : <span className="text-muted">0</span>}
                    {r.moq ? <span className="block text-[11px] text-muted">MOQ {fmt(r.moq)}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
