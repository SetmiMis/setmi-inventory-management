"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { setLanguage } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n";

export function LanguageDropdown({ lang, label }: { lang: Lang; label: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    // Both mousedown & touchstart for perfect desktop + mobile support
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const options: { value: Lang; text: string }[] = [
    { value: "en", text: "English" },
    { value: "hi", text: "हिन्दी" },
  ];

  const current = options.find((o) => o.value === lang)?.text ?? "English";

  const handleSelectLanguage = (newLang: Lang) => {
    setOpen(false);
    if (newLang === lang) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("lang", newLang);
      await setLanguage(formData);
    });
  };

  return (
    <div ref={root} className="relative inline-block text-left" aria-label={label}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={isPending}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#cfe0dd] bg-white px-3.5 text-sm font-medium text-[#0b2540] shadow-sm transition hover:bg-[#f2fbf9] active:bg-[#e6f4f1] disabled:opacity-60"
      >
        <Globe size={18} className="text-[#0b8a7b]" aria-hidden />
        <span>{current}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`text-[#4a6572] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-xl border border-[#cfe0dd] bg-white py-1 shadow-xl ring-1 ring-black/5"
        >
          {options.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelectLanguage(o.value)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-sm font-medium text-[#0b2540] transition hover:bg-[#e6f4f1] active:bg-[#d6f0ea]"
              >
                <span>{o.text}</span>
                {o.value === lang && <Check size={16} className="text-[#0b8a7b]" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}