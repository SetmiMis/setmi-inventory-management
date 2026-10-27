import Image from "next/image";
import { LanguageDropdown } from "@/components/language-dropdown";
import type { Lang } from "@/lib/i18n";

// The white card used by the small sign-in helper pages (forgot password, new password).
// Light colours only, the same teal-on-mint look as the login page.
export function AuthCard({ lang, languageLabel, title, subtitle, children }: {
  lang: Lang; languageLabel: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <main data-auth className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#eefaf7] via-[#f2fbf9] to-[#e3f4f0] px-4 py-8 text-[#0b2540] [color-scheme:light]">
      <div className="login-rise w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_20px_60px_-15px_rgba(11,37,64,0.25)] sm:p-10">
        <div className="mb-4 flex justify-end">
          <LanguageDropdown lang={lang} label={languageLabel} />
        </div>
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/brand/setmi-round-192.png" alt="SETMI INDIA" width={96} height={96} priority className="h-24 w-24" />
          <h1 className="mt-4 text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-[#3d5565]">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
