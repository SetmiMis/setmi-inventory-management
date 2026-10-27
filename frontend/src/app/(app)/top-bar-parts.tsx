"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Calendar, ChevronDown, LogOut, Menu, Moon, Plus, Sun } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { logout } from "./actions";

// ---- Show / hide the left menu on a computer (the phone has its own drawer) ----
const KEY = "ims_menu_hidden";
const subscribers = new Set<() => void>();
const readHidden = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
function writeHidden(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private window: the choice just is not remembered */ }
  subscribers.forEach((f) => f());
}
const subscribe = (f: () => void) => { subscribers.add(f); return () => { subscribers.delete(f); }; };

// Wraps the page body: the left menu column disappears when the person has hidden it.
export function useMenuHidden() {
  return useSyncExternalStore(subscribe, readHidden, () => false);
}

export function CollapseButton({ label }: { label: string }) {
  const hidden = useMenuHidden();
  return (
    <button
      type="button"
      onClick={() => writeHidden(!hidden)}
      aria-label={label}
      aria-pressed={hidden}
      className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted lg:inline-flex"
    >
      <Menu size={22} aria-hidden />
    </button>
  );
}

// The left column (desktop). Its content comes from the server layout.
export function SidebarColumn({ children }: { children: React.ReactNode }) {
  const hidden = useMenuHidden();
  return (
    <aside
      aria-label="Menu"
      className={`sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-line bg-[var(--sidebar)] p-3 print:hidden ${hidden ? "" : "lg:block"}`}
    >
      {children}
    </aside>
  );
}

// ---- Light / Dark switch (the choice is remembered in this browser; the default is light) ----
const themeSubs = new Set<() => void>();
const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const subscribeTheme = (f: () => void) => { themeSubs.add(f); return () => { themeSubs.delete(f); }; };

export function ThemeToggle({ lightLabel, darkLabel }: { lightLabel: string; darkLabel: string }) {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light");
  const dark = theme === "dark";
  const flip = () => {
    const next = dark ? "light" : "dark";
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("ims_theme", next); } catch { /* private window: not remembered */ }
    themeSubs.forEach((f) => f());
  };
  return (
    <button
      type="button" onClick={flip} aria-pressed={dark} aria-label={dark ? lightLabel : darkLabel} title={dark ? lightLabel : darkLabel}
      className="hidden min-h-11 items-center gap-1 rounded-xl border border-line bg-surface-muted p-1 sm:inline-flex"
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${dark ? "text-muted" : "bg-surface text-[var(--brand-text)] shadow-sm"}`}><Sun size={18} aria-hidden /></span>
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${dark ? "bg-[var(--brand)] text-white shadow-sm" : "text-muted"}`}><Moon size={18} aria-hidden /></span>
    </button>
  );
}

// ---- small drop-down helper ----
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

// ---- The bell: how many items are low on stock ----
export function NotificationBell({ count, label, text }: { count: number; label: string; text: string }) {
  return (
    <Link href="/reports?r=low" aria-label={`${label}: ${text}`} title={text} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted">
      <Bell size={22} aria-hidden />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

// ---- The person's menu: name, role, language, sign out ----
export function UserMenu({ name, role, email, children, signOut }: { name: string; role: string; email: string; children: React.ReactNode; signOut: string }) {
  const { open, setOpen, root } = useDropdown();
  const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "U";
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" className="flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 hover:bg-surface-muted sm:px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted">{role}</span>
        </span>
        <ChevronDown size={16} aria-hidden className="hidden text-muted sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="mb-3 truncate text-xs text-muted">{email}</p>
          <div className="mb-3">{children}</div>
          <form action={logout}>
            <button type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line text-sm font-medium hover:bg-surface-muted">
              <LogOut size={16} aria-hidden /> {signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---- Quick action button (dashboard) ----
export function QuickAction({ label, actions }: { label: string; actions: { href: string; label: string }[] }) {
  const { open, setOpen, root } = useDropdown();
  if (actions.length === 0) return null;
  return (
    <div ref={root} className="relative">
      <button
        type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true"
        className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-md transition hover:bg-brand-strong"
      >
        <Plus size={18} aria-hidden /> {label} <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute right-0 z-40 mt-2 min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          {actions.map((a) => (
            <li key={a.href}>
              <Link href={a.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-brand-soft">{a.label}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Dashboard filters: change the period or the place, the page reloads at once ----
export function DashboardFilters({
  range, ranges, location, locations, allLabel, warehouseLabel,
}: {
  range: string; ranges: { value: string; label: string }[];
  location: string; locations: { id: string; name: string; code: string }[]; allLabel: string; warehouseLabel: string;
}) {
  const router = useRouter();
  const go = (r: string, l: string) => router.push(`/dashboard?${new URLSearchParams({ range: r, ...(l ? { location: l } : {}) }).toString()}`);
  const box = "min-h-12 w-full appearance-none rounded-xl border border-line bg-surface text-sm font-medium shadow-sm hover:bg-surface-muted";
  return (
    <>
      <div className="relative">
        <Calendar size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <select aria-label="Period" value={range} onChange={(e) => go(e.target.value, location)} className={`${box} pl-11 pr-10`}>
          {ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
      </div>
      {locations.length > 1 && (
        <div className="relative min-w-52">
          <span className="pointer-events-none absolute left-4 top-1.5 text-[11px] text-muted">{warehouseLabel}</span>
          <select aria-label={warehouseLabel} value={location} onChange={(e) => go(range, e.target.value)} className={`${box} pb-1.5 pl-4 pr-10 pt-5`}>
            <option value="">{allLabel}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
          </select>
          <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      )}
    </>
  );
}
