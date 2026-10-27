"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { bulkItems, type FormState } from "./actions";

type Category = { id: string; name: string };

// Wraps the product table: the row tick boxes (name="ids") and the bar with the actions for the ticked rows.
export function BulkForm({ categories, canArchive, canEdit, children }: { categories: Category[]; canArchive: boolean; canEdit: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(bulkItems, null);
  const boxes = () => Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? []);
  const ticked = () => boxes().filter((b) => b.checked).map((b) => b.value);
  const btn = "inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-surface-muted disabled:opacity-50";

  return (
    <form ref={formRef} action={action}>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-muted p-2.5 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" aria-label="Select all products on this page" onChange={(e) => boxes().forEach((b) => (b.checked = e.target.checked))} /> Select all
        </label>
        <span className="text-muted">then:</span>
        <button type="button" className={btn} onClick={() => { const ids = ticked(); if (ids.length) router.push(`/items/labels?ids=${ids.join(",")}`); }}>Print labels</button>
        {canArchive && <button type="submit" name="op" value="archive" disabled={pending} className={btn} onClick={(e) => { if (!window.confirm("Archive the ticked products? They stop being used on new orders; stock and history stay.")) e.preventDefault(); }}>Archive</button>}
        {canArchive && <button type="submit" name="op" value="restore" disabled={pending} className={btn}>Restore</button>}
        {canEdit && (
          <span className="flex items-center gap-1.5">
            <select name="categoryId" aria-label="New category" className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm">
              <option value="">Change category to...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" name="op" value="category" disabled={pending} className={btn}>Apply</button>
          </span>
        )}
        {state && <span role={state.ok ? "status" : "alert"} className={`ml-auto text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>}
      </div>
      {children}
    </form>
  );
}
