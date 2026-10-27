"use client";

import { useActionState } from "react";
import { Loader2, Save } from "lucide-react";
import { saveCompanyAction, type SettingState } from "./actions";
import type { Company } from "@/lib/company";

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

// Company information: shown on the printed papers.
export function CompanyForm({ company }: { company: Company }) {
  const [state, formAction, pending] = useActionState<SettingState, FormData>(saveCompanyAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Company Name *</span><input name="name" defaultValue={company.name} required minLength={2} maxLength={100} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Tagline</span><input name="tagline" defaultValue={company.tagline} maxLength={100} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">GST Number</span><input name="gst" defaultValue={company.gst} maxLength={15} placeholder="07ABCDE1234F1Z5" className={`${field} font-mono uppercase`} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">PAN Number</span><input name="pan" defaultValue={company.pan} maxLength={10} placeholder="ABCDE1234F" className={`${field} font-mono uppercase`} /></label>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Address</span><textarea name="address" defaultValue={company.address} rows={3} maxLength={300} className={`${field} py-2`} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Phone</span><input name="phone" defaultValue={company.phone} maxLength={30} inputMode="tel" className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Email</span><input name="email" type="email" defaultValue={company.email} maxLength={100} className={field} /></label>
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Website</span><input name="website" defaultValue={company.website} maxLength={100} placeholder="https://" className={field} /></label>
      <p className="text-xs text-muted">The GST number and PAN are only printed on papers; they are not checked with the government.</p>
      {state && <p role={state.ok ? "status" : "alert"} className={`rounded-lg border p-2 text-sm ${state.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{state.message}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Company Information
      </button>
    </form>
  );
}
