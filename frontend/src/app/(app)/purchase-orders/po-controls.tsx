"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ChevronDown, Ellipsis, ExternalLink, Eye, Plus, Printer, Send, SquarePen } from "lucide-react";
import { cancelPurchaseOrder, sendPurchaseOrder } from "./actions";

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

// "Create Purchase Order" split button.
export function CreatePoMenu() {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href="/purchase-orders/new" className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Create Purchase Order
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href="/purchase-orders/new" className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New purchase order</Link></li>
          <li><Link href="/reorder" className={itemClass} onClick={() => setOpen(false)}>From the Reorder list</Link></li>
        </ul>
      )}
    </div>
  );
}

type MenuProps = { id: string; status: string; canApprove: boolean; canEdit: boolean; viewHref: string };

// Actions of one order. Used in a table row (small ⋮ button) and in the side panel ("More" button).
export function PoMenu({ id, status, canApprove, canEdit, viewHref, variant }: MenuProps & { variant: "row" | "panel" }) {
  const { open, setOpen, root } = useDropdown();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function act(fn: () => Promise<{ ok: boolean; message: string }>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      setOpen(false);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div ref={root} className="relative">
      {variant === "row" ? (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
          <Ellipsis size={18} aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--line-strong)] bg-surface text-sm font-semibold hover:bg-brand-soft">
          More <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && (
        <ul className={`${menuClass} ${variant === "panel" ? "bottom-full mb-2 mt-0" : ""}`}>
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View details</Link></li>
          <li><Link href={`/purchase-orders/${id}`} className={itemClass}><ExternalLink size={16} aria-hidden /> Open full page</Link></li>
          {canEdit && <li><Link href={`/purchase-orders/${id}`} className={itemClass}><SquarePen size={16} aria-hidden /> Edit order</Link></li>}
          <li><Link href={`/purchase-orders/${id}/print`} className={itemClass}><Printer size={16} aria-hidden /> Print order</Link></li>
          {canApprove && status === "DRAFT" && (
            <li><button type="button" disabled={busy} className={itemClass} onClick={() => act(() => sendPurchaseOrder({ id }), "Send this order? It can no longer be edited after sending.")}><Send size={16} aria-hidden /> Send order</button></li>
          )}
          {canApprove && (status === "DRAFT" || status === "SENT") && (
            <li><button type="button" disabled={busy} className={`${itemClass} text-[var(--danger)]`} onClick={() => act(() => cancelPurchaseOrder({ id }), "Cancel this order?")}><Ban size={16} aria-hidden /> Cancel order</button></li>
          )}
        </ul>
      )}
      {msg && !msg.ok && <p role="alert" className="mt-2 text-xs text-[var(--danger)]">{msg.text}</p>}
    </div>
  );
}
