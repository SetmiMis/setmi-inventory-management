"use client";

import { useActionState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { decideStockEntry, type DecisionState } from "./actions";

// Approve / Reject box for a manager. A note is optional when approving and needed when rejecting.
export function DecisionForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<DecisionState, FormData>(decideStockEntry, null);
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="id" value={id} />
      <p className="text-xs font-semibold text-muted">Decision (stock changes only when you approve)</p>
      <input name="note" maxLength={300} placeholder="Note (needed when rejecting)" className="min-h-11 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" />
      {state && !state.ok && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="submit" name="decision" value="reject" disabled={pending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--danger)] text-sm font-semibold text-[var(--danger)] hover:bg-red-500/10 disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <X size={16} aria-hidden />} Reject
        </button>
        <button type="submit" name="decision" value="approve" disabled={pending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />} Approve
        </button>
      </div>
    </form>
  );
}
