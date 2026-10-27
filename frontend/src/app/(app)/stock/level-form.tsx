"use client";

import { useActionState } from "react";
import { saveLevel, type StockState } from "./actions";

export function LevelForm({ itemId, min, max }: { itemId: string; min: number | null; max: number | null }) {
  const [state, action, pending] = useActionState<StockState, FormData>(saveLevel, null);
  const box = "w-16 rounded border border-neutral-400 bg-transparent px-1 py-0.5 text-sm";
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="itemId" value={itemId} />
      <input name="min" defaultValue={min ?? ""} placeholder="min" aria-label="Minimum" inputMode="decimal" className={box} />
      <input name="max" defaultValue={max ?? ""} placeholder="max" aria-label="Maximum" inputMode="decimal" className={box} />
      <button type="submit" disabled={pending} className="rounded border border-neutral-400 px-2 py-0.5 text-xs">
        {pending ? "..." : "Save"}
      </button>
      {state && <span role="status" className={`text-xs ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>}
    </form>
  );
}
