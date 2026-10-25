import { Languages } from "lucide-react";
import { setLanguage } from "@/lib/i18n/actions";
import type { Lang } from "@/lib/i18n";

// English / Hindi switch. Plain forms, so it works without any client code.
export function LanguageSwitch({ lang, label }: { lang: Lang; label: string }) {
  const btn = (value: Lang, text: string) => (
    <button
      type="submit"
      name="lang"
      value={value}
      aria-pressed={lang === value}
      className={`px-2.5 py-1 text-sm font-medium ${lang === value ? "bg-brand text-white" : "bg-surface hover:bg-surface-muted"}`}
    >
      {text}
    </button>
  );
  return (
    <form action={setLanguage} className="inline-flex items-center gap-1.5" aria-label={label}>
      <Languages size={16} className="text-muted" aria-hidden />
      <span className="inline-flex overflow-hidden rounded-lg border border-line shadow-sm">
        {btn("en", "English")}
        {btn("hi", "हिन्दी")}
      </span>
    </form>
  );
}
