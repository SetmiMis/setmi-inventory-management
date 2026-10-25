"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Send, TriangleAlert } from "lucide-react";
import { requestPasswordReset, type ResetState } from "../login/reset-actions";

type Labels = { email: string; emailPlaceholder: string; button: string; busy: string; back: string; sent: string; invalid: string };

export function ForgotForm({ labels }: { labels: Labels }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(requestPasswordReset, null);

  return (
    <div className="space-y-5">
      {state?.ok ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden /> {labels.sent}
        </p>
      ) : (
        <form action={formAction} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">{labels.email}</label>
            <div className="relative">
              <Mail size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4a6572]" />
              <input
                id="email" name="email" type="email" autoComplete="username" required placeholder={labels.emailPlaceholder}
                className="min-h-12 w-full rounded-xl border border-[#8aa3a0] bg-white pl-11 pr-3 text-base shadow-sm placeholder:text-[#5f7380] focus:border-[#0b8a7b] focus:outline-none focus:ring-4 focus:ring-[#0b8a7b]/20"
              />
            </div>
          </div>
          {state?.error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden /> {labels.invalid}
            </p>
          )}
          <button
            type="submit" disabled={pending}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0b8a7b] px-4 text-base font-semibold text-white shadow-lg shadow-[#0b8a7b]/25 transition hover:bg-[#076b60] active:scale-[0.99] disabled:opacity-70"
          >
            {pending ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Send size={18} aria-hidden />}
            {pending ? labels.busy : labels.button}
          </button>
        </form>
      )}
      <Link href="/login" className="flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-[#075f54] hover:underline">
        <ArrowLeft size={16} aria-hidden /> {labels.back}
      </Link>
    </div>
  );
}
