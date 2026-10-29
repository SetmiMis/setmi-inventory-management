"use client";

import { useActionState } from "react";
import { MENU_STEPS, type MenuStep } from "@/lib/menu-steps";
import { primaryButton } from "@/lib/ui";
import { setMenuStep, type SettingState } from "./actions";

// Which step of the menu everybody sees. Admin only (checked again in the server action and in the database).
export function MenuStepForm({ current }: { current: MenuStep }) {
  const [state, action, pending] = useActionState<SettingState, FormData>(setMenuStep, null);
  return (
    <form action={action} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">Menu step</legend>
        {MENU_STEPS.map((s) => (
          <label key={s.step} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm has-[:checked]:border-[var(--brand)] has-[:checked]:bg-brand-soft">
            <input type="radio" name="step" value={s.step} defaultChecked={s.step === current} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
            <span><span className="block font-semibold">{s.title}</span><span className="block text-xs text-muted">{s.text}</span></span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving..." : "Save step"}</button>
      {state && <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>}
    </form>
  );
}
