"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, History, Package, Search, Zap } from "lucide-react";
import { searchItemsForPalette, type FoundItem } from "./search-actions";

export type PaletteEntry = { href: string; label: string; kind: "page" | "action" };
export type PaletteLabels = {
  button: string; title: string; placeholder: string; items: string; pages: string; actions: string; recent: string;
  none: string; hint: string; typing: string;
};

type Row = { key: string; href: string; label: string; sub?: string; icon: "item" | "page" | "action" | "recent"; section: string };
const RECENT_KEY = "ims_recent_pages";

// A search-and-jump box for the whole app: press Ctrl+K (or "/") anywhere. Finds items by code, name or barcode,
// jumps to any page the person may open, and starts common jobs. Recently opened pages are remembered in this browser.
export function CommandPalette({ entries, canSearchItems, labels }: { entries: PaletteEntry[]; canSearchItems: boolean; labels: PaletteLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Search result of the LAST finished search: it is only shown while it still matches what is typed.
  const [result, setResult] = useState<{ q: string; items: FoundItem[] }>({ q: "", items: [] });
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<{ href: string; label: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openIt = useCallback(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")); } catch { setRecent([]); }
    setOpen(true);
  }, []);
  const close = useCallback(() => { setOpen(false); setQ(""); setCursor(0); }, []);

  // Ctrl/Cmd+K anywhere; "/" when not typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openIt(); }
      else if (e.key === "/" && !typing && !open) { e.preventDefault(); openIt(); }
      else if (e.key === "Escape" && open) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openIt, close]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Item search: wait a moment after typing, so a fast typist or a scanner makes one call.
  const wantSearch = open && canSearchItems && q.trim().length >= 2;
  useEffect(() => {
    if (!wantSearch) return;
    let cancelled = false;
    timer.current = setTimeout(async () => {
      let items: FoundItem[] = [];
      try { items = await searchItemsForPalette({ q }); } catch { items = []; }
      if (!cancelled) setResult({ q, items });
    }, 200);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [q, wantSearch]);
  const found = useMemo(() => (wantSearch && result.q === q ? result.items : []), [wantSearch, result, q]);
  const busy = wantSearch && result.q !== q;

  const rows: Row[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    if (needle.length >= 2) {
      for (const f of found) out.push({ key: `i-${f.id}`, href: `/items/${f.id}`, label: f.code, sub: `${f.name}${f.active ? "" : " (archived)"}`, icon: "item", section: labels.items });
    }
    const match = (e: PaletteEntry) => !needle || e.label.toLowerCase().includes(needle);
    for (const e of entries.filter((x) => x.kind === "action" && match(x))) out.push({ key: `a-${e.href}`, href: e.href, label: e.label, icon: "action", section: labels.actions });
    for (const e of entries.filter((x) => x.kind === "page" && match(x))) out.push({ key: `p-${e.href}`, href: e.href, label: e.label, icon: "page", section: labels.pages });
    if (!needle) for (const r of recent.slice(0, 5)) out.unshift({ key: `r-${r.href}`, href: r.href, label: r.label, icon: "recent", section: labels.recent });
    return out;
  }, [q, found, entries, recent, labels]);

  function go(row: Row) {
    try {
      const next = [{ href: row.href, label: row.label }, ...recent.filter((r) => r.href !== row.href)].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* storage may be blocked: the app works without it */ }
    close();
    router.push(row.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (rows[active]) go(rows[active]); }
  }

  const active = Math.min(cursor, Math.max(rows.length - 1, 0));
  const icons = { item: Package, page: Search, action: Zap, recent: History } as const;

  return (
    <>
      <button
        type="button"
        onClick={openIt}
        className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted shadow-sm transition hover:bg-surface-muted"
        aria-label={labels.button}
      >
        <Search size={16} aria-hidden />
        <span className="hidden sm:inline">{labels.button}</span>
        <kbd className="hidden rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[11px] md:inline">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh] print:hidden" role="dialog" aria-modal="true" aria-label={labels.title}>
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-black/50" tabIndex={-1} />
          <div className="relative flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search size={18} className="text-muted" aria-hidden />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setCursor(0); }}
                onKeyDown={onInputKey}
                placeholder={labels.placeholder}
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={rows[active] ? `pal-${rows[active].key}` : undefined}
                autoComplete="off"
                className="min-h-14 w-full bg-transparent text-base outline-none"
              />
              {busy && <span className="shrink-0 text-xs text-muted">{labels.typing}</span>}
            </div>
            <ul id="palette-list" role="listbox" className="overflow-y-auto p-2">
              {rows.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted">{busy ? labels.typing : labels.none}</li>
              ) : (
                rows.map((r, i) => {
                  const Icon = icons[r.icon];
                  const newSection = r.section !== rows[i - 1]?.section;
                  return (
                    <li key={r.key} role="presentation">
                      {newSection && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{r.section}</p>}
                      <div
                        id={`pal-${r.key}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setCursor(i)}
                        onClick={() => go(r)}
                        className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-brand-soft text-[var(--brand-text)]" : ""}`}
                      >
                        <Icon size={16} aria-hidden className="shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.label}</span>
                          {r.sub && <span className="block truncate text-xs text-muted">{r.sub}</span>}
                        </span>
                        {i === active && <CornerDownLeft size={14} aria-hidden className="shrink-0" />}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
            <p className="border-t border-line px-4 py-2 text-xs text-muted">{labels.hint}</p>
          </div>
        </div>
      )}
    </>
  );
}
