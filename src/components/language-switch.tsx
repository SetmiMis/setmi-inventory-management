import { Languages } from "lucide-react";
import { setLanguage } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n";

// English / Hindi switch. Plain forms, so it works without any client code.
export function LanguageSwitch({ lang, label, light = false }: { lang: Lang; label: string; light?: boolean }) {
  const btn = (value: Lang, text: string) => (
    <button
      type="submit"
      name="lang"
      value={value}
      aria-pressed={lang === value}
      className={`px-2.5 py-1 text-sm font-medium ${
        light
          ? lang === value ? "bg-[#0b8a7b] text-white" : "bg-white text-[#0b2540] hover:bg-[#e6f4f1]"
          : lang === value ? "bg-brand text-white" : "bg-surface hover:bg-surface-muted"
      }`}
    >
      {text}
    </button>
  );
  return (
    <form action={setLanguage} className="inline-flex items-center gap-1.5" aria-label={label}>
      <Languages size={16} className={light ? "text-[#3d5565]" : "text-muted"} aria-hidden />
      <span className={`inline-flex overflow-hidden rounded-lg border shadow-sm ${light ? "border-[#8aa3a0]" : "border-line"}`}>
        {btn("en", "English")}
        {btn("hi", "हिन्दी")}
      </span>
    </form>
  );
}
