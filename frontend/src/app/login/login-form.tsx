"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, TriangleAlert, User } from "lucide-react";
import { login, type LoginState } from "./actions";

type Labels = {
  email: string;
  emailPlaceholder: string;
  password: string;
  passwordPlaceholder: string;
  button: string;
  busy: string;
  show: string;
  hide: string;
  forgot: string;
  remember: string;
};

const fieldClass =
  "w-full min-h-12 rounded-xl border border-[#8aa3a0] bg-white pl-11 pr-3 text-base text-[#0b2540] shadow-sm transition placeholder:text-[#5f7380] focus:border-[#0b8a7b] focus:outline-none focus:ring-4 focus:ring-[#0b8a7b]/20";

export function LoginForm({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, null);
  const [showPassword, setShowPassword] = useState(false);

  // Recovery token fallback: agar Supabase email se hash fragment ke sath login page par bhej de
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      router.replace(`/reset-password${window.location.hash}`);
    }
  }, [router]);

  return (
    <form action={formAction} className="space-y-5 [@media(max-height:780px)]:space-y-3">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-[#0b2540]">
          {labels.email}
        </label>
        <div className="relative">
          <User size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4a6572]" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder={labels.emailPlaceholder}
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor="password" className="block text-sm font-semibold text-[#0b2540]">
            {labels.password}
          </label>
          <Link href="/forgot-password" className="inline-flex min-h-8 items-center text-sm font-semibold text-[#075f54] hover:underline">
            {labels.forgot}
          </Link>
        </div>
        <div className="relative">
          <Lock size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4a6572]" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder={labels.passwordPlaceholder}
            className={`${fieldClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? labels.hide : labels.show}
            aria-pressed={showPassword}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#4a6572] hover:bg-[#e6f4f1]"
          >
            {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-[#0b2540]">
        <input type="checkbox" name="remember" defaultChecked className="h-5 w-5 rounded accent-[#0b8a7b]" />
        {labels.remember}
      </label>

      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#0b8a7b] px-4 text-base font-semibold text-white shadow-lg shadow-[#0b8a7b]/25 transition hover:bg-[#076b60] active:scale-[0.99] disabled:opacity-70"
      >
        {pending ? labels.busy : labels.button}
        {pending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : (
          <ArrowRight size={18} aria-hidden className="transition group-hover:translate-x-1" />
        )}
      </button>
    </form>
  );
}