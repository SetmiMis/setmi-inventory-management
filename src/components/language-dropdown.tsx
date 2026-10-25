"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setLanguage } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n";

// The language picker of the login screens: a globe, the current language and a small drop-down.
// Each choice is a plain form button that calls the same server action as the two-button switch.
export function LanguageDropdown({ lang, label }: { lang: Lang; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const options: { value: Lang; text: string }[] = [{ value: "en", text: "English" }, { value: "hi", text: "हिन्दी" }];
  const current = options.find((o) => o.value === lang)?.text ?? "English";

  return (
    <form ref={root} action={setLanguage} className="relative" aria-label={label}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#cfe0dd] bg-white px-3.5 text-sm font-medium text-[#0b2540] shadow-sm hover:bg-[#f2fbf9]"
      >
        <Globe size={18} className="text-[#0b8a7b]" aria-hidden /> {current}
        <ChevronDown size={16} aria-hidden className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute right-0 z-10 mt-1 min-w-full overflow-hidden rounded-xl border border-[#cfe0dd] bg-white py-1 shadow-lg">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="submit" name="lang" value={o.value}
                onClick={() => setTimeout(() => setOpen(false), 0)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-sm text-[#0b2540] hover:bg-[#e6f4f1]"
              >
                {o.text} {o.value === lang && <Check size={16} className="text-[#0b8a7b]" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
