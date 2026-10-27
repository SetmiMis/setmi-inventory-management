"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Ellipsis, Eye, Printer } from "lucide-react";

// "Print" button of the page header: prints what is on the screen.
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold shadow-sm hover:bg-surface-muted print:hidden">
      <Printer size={18} aria-hidden /> Print
    </button>
  );
}

export function LedgerRowMenu({ viewHref, itemId }: { viewHref: string; itemId: string }) {
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
  const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-brand-soft";
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className="absolute right-0 z-40 mt-2 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View product ledger</Link></li>
          <li><Link href={`/items/${itemId}`} className={itemClass}>Open product</Link></li>
          <li><Link href="/stock" className={itemClass}>Current stock</Link></li>
        </ul>
      )}
    </div>
  );
}
