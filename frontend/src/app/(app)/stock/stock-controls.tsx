"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Ellipsis, ExternalLink, Eye, History, Plus, SquarePen } from "lucide-react";

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

const menuClass = "absolute right-0 z-40 mt-2 min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl";
const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-brand-soft";

// "Add Item" split button: new product first, then the other ways to put stock in.
export function AddItemMenu({ canAddItem, canEntry, canCount }: { canAddItem: boolean; canEntry: boolean; canCount: boolean }) {
  const { open, setOpen, root } = useDropdown();
  const main = canAddItem ? { href: "/items/new", label: "Add Item" } : canEntry ? { href: "/stock/entry", label: "Stock In / Out" } : canCount ? { href: "/stock/count", label: "Count Stock" } : null;
  if (!main) return null;
  return (
    <div ref={root} className="relative flex">
      <Link href={main.href} className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> {main.label}
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          {canAddItem && <li><Link href="/items/new" className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New item</Link></li>}
          {canEntry && <li><Link href="/stock/entry" className={itemClass} onClick={() => setOpen(false)}>Quick Stock In / Out</Link></li>}
          {canCount && <li><Link href="/stock/count" className={itemClass} onClick={() => setOpen(false)}>Count stock</Link></li>}
          {canCount && <li><Link href="/stock/scan" className={itemClass} onClick={() => setOpen(false)}>Count by scanning</Link></li>}
          <li><Link href="/stock/movements" className={itemClass} onClick={() => setOpen(false)}><History size={16} aria-hidden /> Stock history</Link></li>
        </ul>
      )}
    </div>
  );
}

export function StockRowMenu({ itemId, viewHref, canEdit }: { itemId: string; viewHref: string; canEdit: boolean }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View stock details</Link></li>
          <li><Link href={`/items/${itemId}`} className={itemClass}><ExternalLink size={16} aria-hidden /> Open product</Link></li>
          {canEdit && <li><Link href={`/items/${itemId}`} className={itemClass}><SquarePen size={16} aria-hidden /> Edit product</Link></li>}
          <li><Link href="/stock/movements" className={itemClass}><History size={16} aria-hidden /> Stock history</Link></li>
        </ul>
      )}
    </div>
  );
}
