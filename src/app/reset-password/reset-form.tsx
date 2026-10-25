"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Save, TriangleAlert } from "lucide-react";
import { setNewPassword, type ResetState } from "../login/reset-actions";

type Labels = {
  password: string; confirm: string; button: string; busy: string; show: string; hide: string;
  errors: { short: string; mismatch: string; expired: string; rejected: string };
};

const fieldClass =
  "min-h-12 w-full rounded-xl border border-[#8aa3a0] bg-white pl-11 pr-12 text-base shadow-sm placeholder:text-[#5f7380] focus:border-[#0b8a7b] focus:outline-none focus:ring-4 focus:ring-[#0b8a7b]/20";

export function ResetForm({ labels }: { labels: Labels }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(setNewPassword, null);
  const [show, setShow] = useState(false);
  const message = state?.error ? labels.errors[state.error as keyof Labels["errors"]] ?? labels.errors.rejected : null;

  return (
    <form action={formAction} className="space-y-5">
      {(["password", "confirm"] as const).map((name) => (
        <div key={name}>
          <label htmlFor={name} className="mb-1.5 block text-sm font-semibold">{labels[name]}</label>
          <div className="relative">
            <Lock size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4a6572]" />
            <input id={name} name={name} type={show ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={72} className={fieldClass} />
            {name === "password" && (
              <button
                type="button" onClick={() => setShow((v) => !v)} aria-label={show ? labels.hide : labels.show} aria-pressed={show}
                className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#4a6572] hover:bg-[#e6f4f1]"
              >
                {show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            )}
          </div>
        </div>
      ))}
      {message && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {message}
        </p>
      )}
      <button
        type="submit" disabled={pending}
        className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0b8a7b] px-4 text-base font-semibold text-white shadow-lg shadow-[#0b8a7b]/25 transition hover:bg-[#076b60] active:scale-[0.99] disabled:opacity-70"
      >
        {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Save size={18} aria-hidden />}
        {pending ? labels.busy : labels.button}
      </button>
    </form>
  );
}
