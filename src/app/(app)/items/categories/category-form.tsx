"use client";

import { useActionState } from "react";
import { saveCategory, type CategoryState } from "./actions";
import { inputClass, primaryButton } from "@/lib/ui";

export function CategoryForm({ category }: { category?: { id: string; name: string; isActive: boolean } }) {
  const [state, formAction, pending] = useActionState<CategoryState, FormData>(saveCategory, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      {category && <input type="hidden" name="id" value={category.id} />}
      <input
        name="name"
        defaultValue={category?.name ?? ""}
        placeholder="Category name"
        required
        maxLength={100}
        aria-label="Category name"
        className={`${inputClass} !mt-0 max-w-xs`}
      />
      {category && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={category.isActive} /> Active
        </label>
      )}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving..." : category ? "Save" : "Add category"}
      </button>
      {state && (
        <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
