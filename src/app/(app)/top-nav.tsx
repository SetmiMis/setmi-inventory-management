"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ReceiptText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ICONS, type NavItem } from "./nav-links";

// Desktop top menu, the same pattern as the owner's ERP (Masters / Purchase / Stock drop-downs).
// Links without a group stay in the bar; a group with several links becomes a drop-down.
type Entry = { kind: "link"; item: NavItem } | { kind: "group"; name: string; items: NavItem[] };

function build(items: NavItem[]): Entry[] {
  const out: Entry[] = [];
  for (const it of items) {
    if (!it.group) { out.push({ kind: "link", item: it }); continue; }
    const last = out[out.length - 1];
    if (last && last.kind === "group" && last.name === it.group) last.items.push(it);
    else out.push({ kind: "group", name: it.group, items: [it] });
  }
  // A group with one link (for example Help) needs no drop-down.
  return out.map((e) => (e.kind === "group" && e.items.length === 1 ? { kind: "link", item: e.items[0] } : e));
}

export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const entries = build(items);
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const activeHref = items.filter((it) => matches(it.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpenGroup(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenGroup(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [openGroup]);

  const linkClass = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
      active ? "bg-brand-soft text-[var(--brand-text)]" : "text-foreground hover:bg-surface-muted"
    }`;

  return (
    <nav ref={root} aria-label="Main" className="hidden flex-wrap items-center gap-1 lg:flex">
      {entries.map((e) => {
        if (e.kind === "link") {
          const Icon = ICONS[e.item.icon] ?? ReceiptText;
          return (
            <Link key={e.item.href} href={e.item.href} aria-current={e.item.href === activeHref ? "page" : undefined} className={linkClass(e.item.href === activeHref)}>
              <Icon size={16} aria-hidden /> {e.item.label}
            </Link>
          );
        }
        const open = openGroup === e.name;
        const groupActive = e.items.some((i) => i.href === activeHref);
        return (
          <div key={e.name} className="relative">
            <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpenGroup(open ? null : e.name)} className={linkClass(groupActive || open)}>
              {e.name} <ChevronDown size={14} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <ul className="absolute left-0 top-full z-40 mt-1 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
                {e.items.map((it) => {
                  const Icon = ICONS[it.icon] ?? ReceiptText;
                  const active = it.href === activeHref;
                  return (
                    <li key={it.href}>
                      <Link href={it.href} onClick={() => setOpenGroup(null)} aria-current={active ? "page" : undefined}
                        className={`flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm ${active ? "bg-brand-soft font-semibold text-[var(--brand-text)]" : "hover:bg-surface-muted"}`}>
                        <Icon size={16} aria-hidden /> {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
