"use client";

import { useActionState } from "react";
import { saveSupplier, setSupplierActive, type SupplierState } from "./actions";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

export type SupplierValues = {
  id: string; updatedAt: string; name: string; supplierType: "LOCAL" | "IMPORT";
  contactPerson: string | null; phone: string | null; email: string | null; address: string | null;
  country: string | null; gstin: string | null; notes: string | null;
  city: string | null; website: string | null; paymentTerms: string | null; currency: string;
};

function Message({ state }: { state: SupplierState }) {
  if (!state) return null;
  return <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>;
}

export function SupplierForm({ supplier }: { supplier?: SupplierValues }) {
  const [state, action, pending] = useActionState<SupplierState, FormData>(saveSupplier, null);
  const f = (k: keyof SupplierValues) => (supplier?.[k] as string | null | undefined) ?? "";
  return (
    <form action={action} className="space-y-4">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      {supplier && <input type="hidden" name="expectedUpdatedAt" value={supplier.updatedAt} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className={labelClass}>Supplier name *</label>
          <input id="name" name="name" required maxLength={150} defaultValue={f("name")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="supplierType" className={labelClass}>Type *</label>
          <select id="supplierType" name="supplierType" defaultValue={supplier?.supplierType ?? "LOCAL"} className={inputClass}>
            <option value="LOCAL">LOCAL (Indian supplier)</option>
            <option value="IMPORT">IMPORT (foreign supplier)</option>
          </select>
        </div>
        <div>
          <label htmlFor="country" className={labelClass}>Country (for imports)</label>
          <input id="country" name="country" maxLength={60} defaultValue={f("country")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="city" className={labelClass}>City</label>
          <input id="city" name="city" maxLength={60} defaultValue={f("city")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="website" className={labelClass}>Website</label>
          <input id="website" name="website" maxLength={200} defaultValue={f("website")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="paymentTerms" className={labelClass}>Payment terms (for example 30 Days)</label>
          <input id="paymentTerms" name="paymentTerms" maxLength={60} defaultValue={f("paymentTerms")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="currency" className={labelClass}>Currency</label>
          <input id="currency" name="currency" maxLength={3} defaultValue={supplier?.currency ?? "INR"} className={`${inputClass} uppercase`} />
        </div>
        <div>
          <label htmlFor="contactPerson" className={labelClass}>Contact person</label>
          <input id="contactPerson" name="contactPerson" maxLength={100} defaultValue={f("contactPerson")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input id="phone" name="phone" maxLength={30} defaultValue={f("phone")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" name="email" type="email" maxLength={150} defaultValue={f("email")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="gstin" className={labelClass}>GSTIN (Indian suppliers)</label>
          <input id="gstin" name="gstin" maxLength={15} defaultValue={f("gstin")} className={`${inputClass} uppercase`} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className={labelClass}>Address</label>
          <textarea id="address" name="address" rows={2} maxLength={500} defaultValue={f("address")} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>Notes</label>
          <textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={f("notes")} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>{pending ? "Saving..." : supplier ? "Save changes" : "Create supplier"}</button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function SupplierArchiveControl({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, action, pending] = useActionState<SupplierState, FormData>(setSupplierActive, null);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={isActive ? "false" : "true"} />
      <button type="submit" disabled={pending} className={secondaryButton}>{isActive ? "Archive supplier" : "Restore supplier"}</button>
      <Message state={state} />
    </form>
  );
}
