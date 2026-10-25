"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, Eye, Loader2, Plus, Power, Save, SquarePen } from "lucide-react";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL } from "@/lib/validation/customer";
import { saveCustomer, toggleCustomerActive, type CustomerState } from "./actions";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, root };
}

const menuClass = "absolute right-0 z-40 mt-2 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl";
const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-brand-soft";
const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";

// "Add Customer" split button.
export function AddCustomerMenu({ addHref }: { addHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href={addHref} className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Add Customer
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={addHref} className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New customer</Link></li>
          <li><Link href="/bills" className={itemClass} onClick={() => setOpen(false)}>Bills</Link></li>
        </ul>
      )}
    </div>
  );
}

export function CustomerRowMenu({ id, active, canManage, viewHref, editHref }: { id: string; active: boolean; canManage: boolean; viewHref: string; editHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View</Link></li>
          {canManage && <li><Link href={editHref} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> Edit</Link></li>}
          {canManage && (
            <li>
              <form action={toggleCustomerActive}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="active" value={active ? "0" : "1"} />
                <button type="submit" className={itemClass}><Power size={16} aria-hidden /> {active ? "Deactivate" : "Activate"}</button>
              </form>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

type Customer = {
  id: string; name: string; customerType: string; gstin: string | null; contactPerson: string | null; phone: string | null; email: string | null;
  address: string | null; city: string | null; state: string | null; creditLimit: number | null; paymentTerms: string | null; notes: string | null; isActive: boolean;
};

// Add or edit a customer in the side panel.
export function CustomerForm({ customer, cancelHref }: { customer?: Customer; cancelHref: string }) {
  const [state, formAction, pending] = useActionState<CustomerState, FormData>(saveCustomer, null);
  const text = (name: string, label: string, value: string | null | undefined, extra: { max: number; type?: string; required?: boolean; upper?: boolean }) => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}{extra.required ? " *" : ""}</span>
      <input name={name} type={extra.type ?? "text"} required={extra.required} maxLength={extra.max} defaultValue={value ?? ""} className={`${field} ${extra.upper ? "font-mono uppercase" : ""}`} />
    </label>
  );
  return (
    <form action={formAction} className="space-y-3">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      {text("name", "Company / customer name", customer?.name, { max: 150, required: true })}
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Customer type</span>
        <select name="customerType" defaultValue={customer?.customerType ?? "RETAILER"} className={field}>
          {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{CUSTOMER_TYPE_LABEL[t]}</option>)}
        </select>
      </label>
      {text("gstin", "GST number (optional, only stored)", customer?.gstin, { max: 15, upper: true })}
      <div className="grid grid-cols-2 gap-2">
        {text("contactPerson", "Contact person", customer?.contactPerson, { max: 100 })}
        {text("phone", "Phone", customer?.phone, { max: 30 })}
      </div>
      {text("email", "Email", customer?.email, { max: 150, type: "email" })}
      <label className="block"><span className="mb-1 block text-xs text-muted">Address</span>
        <textarea name="address" rows={2} maxLength={500} defaultValue={customer?.address ?? ""} className={`${field} py-2`} /></label>
      <div className="grid grid-cols-2 gap-2">
        {text("city", "City", customer?.city, { max: 60 })}
        {text("state", "State", customer?.state, { max: 60 })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Credit limit (a note)</span>
          <input name="creditLimit" type="number" min={0} step="any" inputMode="decimal" defaultValue={customer?.creditLimit ?? ""} className={field} /></label>
        {text("paymentTerms", "Payment terms", customer?.paymentTerms, { max: 60 })}
      </div>
      <label className="block"><span className="mb-1 block text-xs text-muted">Notes</span>
        <textarea name="notes" rows={2} maxLength={1000} defaultValue={customer?.notes ?? ""} className={`${field} py-2`} /></label>
      {customer && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="isActive" defaultChecked={customer.isActive} className="h-5 w-5 accent-[var(--brand)]" /> Active
        </label>
      )}
      {state && !state.ok && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700">{state.message}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Link href={cancelHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted">Cancel</Link>
        <button type="submit" disabled={pending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} {customer ? "Save Customer" : "Add Customer"}
        </button>
      </div>
    </form>
  );
}
