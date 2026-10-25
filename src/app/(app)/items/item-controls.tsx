"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Ellipsis, FileSpreadsheet, Plus, Printer, SquarePen, Tags } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Small drop-down helper: closes on a click outside and on Escape.
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
const itemClass = "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm hover:bg-brand-soft";

// "Add Product" split button: the main part opens the new item form, the arrow lists the other ways in.
export function AddMenu({ canCreate, canImport, canCategories }: { canCreate: boolean; canImport: boolean; canCategories: boolean }) {
  const { open, setOpen, root } = useDropdown();
  if (!canCreate && !canImport && !canCategories) return null;
  return (
    <div ref={root} className="relative flex">
      {canCreate && (
        <Link href="/items/new" className="inline-flex min-h-12 items-center gap-2 rounded-l-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md hover:bg-brand-strong">
          <Plus size={18} aria-hidden /> Add Product
        </Link>
      )}
      <button
        type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More ways to add products"
        className={`inline-flex min-h-12 items-center border-l border-white/30 bg-[var(--brand)] px-3 text-white shadow-md hover:bg-brand-strong ${canCreate ? "rounded-r-xl" : "rounded-xl"}`}
      >
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className={menuClass}>
          {canCreate && <li><Link href="/items/new" className={itemClass} onClick={() => setOpen(false)}><Plus size={16} aria-hidden /> New product</Link></li>}
          {canImport && <li><Link href="/items/import" className={itemClass} onClick={() => setOpen(false)}><FileSpreadsheet size={16} aria-hidden /> Import from Excel</Link></li>}
          {canCategories && <li><Link href="/items/categories" className={itemClass} onClick={() => setOpen(false)}><Tags size={16} aria-hidden /> Manage categories</Link></li>}
        </ul>
      )}
    </div>
  );
}

// The three dots at the end of a table row.
export function RowMenu({ id, canEdit }: { id: string; canEdit: boolean }) {
  const { open, setOpen, root } = useDropdown();
  return (
    <div ref={root} className="relative">
      <button
        type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"
      >
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <ul className={menuClass}>
          <li><Link href={`/items/${id}`} className={itemClass} onClick={() => setOpen(false)}>Open full page</Link></li>
          {canEdit && <li><Link href={`/items/${id}`} className={itemClass} onClick={() => setOpen(false)}><SquarePen size={16} aria-hidden /> Edit</Link></li>}
          <li><Link href={`/items/${id}/labels`} className={itemClass} onClick={() => setOpen(false)}><Printer size={16} aria-hidden /> Print barcode</Link></li>
        </ul>
      )}
    </div>
  );
}

// "Rows per page": changing it reloads the list with the same filters.
export function RowsPerPage({ size, sizes, basePath }: { size: number; sizes: number[]; basePath: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Rows per page
      <select
        value={size}
        onChange={(e) => router.push(`${basePath}${basePath.includes("?") ? "&" : "?"}size=${e.target.value}`)}
        className="min-h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-[var(--foreground)]"
      >
        {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </label>
  );
}
