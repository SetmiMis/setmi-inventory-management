"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, ExternalLink, Eye, Plus, Printer, Tag } from "lucide-react";

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

// "Create GRN" split button.
export function CreateGrnMenu() {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href="/receipts/new" className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Create GRN
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href="/receipts/new" className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New goods receipt</Link></li>
          <li><Link href="/purchase-orders" className={itemClass} onClick={() => setOpen(false)}>Receive against a purchase order</Link></li>
        </ul>
      )}
    </div>
  );
}

// Actions of one receipt. "row" is the small ⋮ button of a table row; "panel" is the "More" button of the side panel.
export function GrnMenu({ id, poId, viewHref, variant }: { id: string; poId: string | null; viewHref: string; variant: "row" | "panel" }) {
  const { open, setOpen, root } = useDropdown();
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
          <li><Link href={`/receipts/${id}`} className={itemClass}><ExternalLink size={16} aria-hidden /> Open full page</Link></li>
          <li><Link href={`/receipts/${id}/print`} className={itemClass}><Printer size={16} aria-hidden /> Print GRN</Link></li>
          <li><Link href={`/receipts/${id}/labels`} className={itemClass}><Tag size={16} aria-hidden /> Print labels</Link></li>
          {poId && <li><Link href={`/purchase-orders?sel=${poId}`} className={itemClass}>Open purchase order</Link></li>}
        </ul>
      )}
    </div>
  );
}
