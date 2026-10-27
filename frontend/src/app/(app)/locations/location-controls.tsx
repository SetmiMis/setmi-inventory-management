"use client";

import Link from "next/link";
import { ChevronDown, Ellipsis, Eye, Plus, Power, SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toggleLocationActive } from "./actions";

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

// "Add Warehouse" split button.
export function AddPlaceMenu() {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative flex">
      <Link href="/locations/new" className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
        <Plus size={18} aria-hidden /> Add Warehouse
      </Link>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More"
        className="inline-flex min-h-12 items-center rounded-r-xl border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong">
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href="/locations/new" className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New warehouse or shop</Link></li>
          <li><Link href="/stock" className={itemClass} onClick={() => setOpen(false)}>Current stock</Link></li>
        </ul>
      )}
    </div>
  );
}

export function PlaceRowMenu({ id, active, canManage, viewHref }: { id: string; active: boolean; canManage: boolean; viewHref: string }) {
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
          <li><Link href={`/locations/${id}`} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> {canManage ? "Edit" : "Open full page"}</Link></li>
          {canManage && (
            <li>
              <form action={toggleLocationActive}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="active" value={active ? "0" : "1"} />
                <button type="submit" className={itemClass}><Power size={16} aria-hidden /> {active ? "Archive" : "Restore"}</button>
              </form>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
