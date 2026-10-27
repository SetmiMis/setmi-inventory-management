"use client";

import Link from "next/link";
import { ChevronDown, Ellipsis, Eye, Plus, Power, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setCategoryActive } from "./actions";

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

// "Add Category" split button.
export function AddCategoryMenu({ addHref }: { addHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href={addHref} className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Add Category
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={addHref} className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New category</Link></li>
          <li><Link href="/items" className={itemClass} onClick={() => setOpen(false)}>Back to Products</Link></li>
        </ul>
      )}
    </div>
  );
}

// The three dots at the end of a row.
export function CategoryRowMenu({ id, active, viewHref, editHref }: { id: string; active: boolean; viewHref: string; editHref: string }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted">
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View</Link></li>
          <li><Link href={editHref} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> Edit</Link></li>
          <li>
            <form action={setCategoryActive}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="active" value={active ? "0" : "1"} />
              <button type="submit" className={itemClass}><Power size={16} aria-hidden /> {active ? "Deactivate" : "Activate"}</button>
            </form>
          </li>
        </ul>
      )}
    </div>
  );
}
