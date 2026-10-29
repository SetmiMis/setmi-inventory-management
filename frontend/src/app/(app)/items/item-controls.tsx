"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Copy, Ellipsis, FileSpreadsheet, LoaderCircle, Plus, Printer, Search, SquarePen, Tags } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

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
export function RowMenu({ id, canEdit, canCreate }: { id: string; canEdit: boolean; canCreate: boolean }) {
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
          {canCreate && <li><Link href={`/items/new?from=${id}`} className={itemClass} onClick={() => setOpen(false)}><Copy size={16} aria-hidden /> Duplicate</Link></li>}
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

type Option = { value: string; label: string };

// Search box and the three drop-downs. Typing searches after 300 ms of quiet, choosing in a drop-down filters at once;
// both only change the address (?q=, ?category=, ?source=, ?status=), the server page does the real work.
export function ItemFilters({ q, category, source, status, categories, sources, statuses }: {
  q: string; category: string; source: string; status: string; categories: Option[]; sources: Option[]; statuses: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The address changed from outside (Clear, a card link): show it, unless the person is typing right now.
  useEffect(() => {
    if (document.activeElement !== input.current) setText(q);
  }, [q]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const push = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    next.delete("sel");
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const onType = (value: string) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (value.trim() !== q) push("q", value.trim()); }, 300);
  };
  const cls = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";
  const select = (label: string, key: string, value: string, options: Option[]) => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select key={value} defaultValue={value} onChange={(e) => push(key, e.target.value)} className={cls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const filtersOn = !!(q || category || source || (status && status !== "all"));

  return (
    <div className="mb-4 grid gap-3 md:grid-cols-[minmax(12rem,2.2fr)_repeat(3,minmax(0,1fr))_auto] md:items-end" aria-busy={pending}>
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input ref={input} type="search" value={text} onChange={(e) => onType(e.target.value)} placeholder="Search SKU, name, barcode" autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer.current); push("q", text.trim()); } }}
          className="min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface pl-11 pr-10 text-base md:text-sm" />
        {pending && <LoaderCircle size={18} aria-label="Searching" className="absolute right-3.5 top-1/2 -mt-[9px] animate-spin text-muted" />}
      </label>
      {select("Category", "category", category, categories)}
      {select("Source", "source", source, sources)}
      {select("Status", "status", status, statuses)}
      {filtersOn ? (
        <Link href="/items" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-muted">Clear</Link>
      ) : <span className="hidden md:block" />}
    </div>
  );
}
