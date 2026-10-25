"use client";

import { useActionState } from "react";
import { Loader2, LogIn, TriangleAlert } from "lucide-react";
import { inputClass, labelClass, primaryButton } from "@/lib/ui";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full py-2.5`}>
        {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <LogIn size={18} aria-hidden />}
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
