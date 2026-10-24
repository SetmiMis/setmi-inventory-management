"use client";

import { useActionState } from "react";
import { submitCount, type StockState } from "../actions";
import { inputClass, primaryButton } from "@/lib/ui";

export type CountRow = { itemId: string; code: string; name: string; unit: string; quantity: number };

export function CountForm({ rows, placeName }: { rows: CountRow[]; placeName: string }) {
  const [state, action, pending] = useActionState<StockState, FormData>(submitCount, null);

  return (
    <form action={action} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300">
              <th className="py-2 pr-3">Code</th><th className="pr-3">Item</th>
              <th className="pr-3 text-right">System shows</th><th className="pr-3">You counted</th><th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.itemId} className="border-b border-neutral-200">
                <td className="py-1 pr-3">{r.code}</td>
                <td className="pr-3">{r.name}</td>
                <td className="pr-3 text-right font-mono">{r.quantity}</td>
                <td className="pr-3">
                  <input type="hidden" name={`o_${r.itemId}`} value={r.quantity} />
                  <input name={`c_${r.itemId}`} defaultValue={r.quantity} inputMode="decimal" aria-label={`Counted ${r.code}`}
                    className="w-28 rounded border border-neutral-400 bg-transparent px-2 py-1 text-right font-mono" />
                </td>
                <td>{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 rounded border border-neutral-300 p-4 text-sm">
        <p>Type the number you actually counted in <strong>{placeName}</strong>. Only changed numbers are saved.</p>
        <label className="block font-medium" htmlFor="reason">Reason *</label>
        <input id="reason" name="reason" maxLength={300} placeholder="e.g. Monthly count, damaged, found extra" className={inputClass} />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="kind" value="OPENING" />
          This is opening stock (the first entry for these items in this place)
        </label>
        <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving..." : "Save counts"}</button>
        {state && (
          <div role="status" className={state.ok ? "text-green-700" : "text-red-600"}>
            <p>{state.message}</p>
            {state.problems && (
              <ul className="list-inside list-disc">
                {state.problems.map((p, i) => <li key={i}>{p.code}: {p.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
