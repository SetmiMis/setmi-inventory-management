import { Suspense } from "react";
import Image from "next/image";
import { LanguageSwitch } from "@/components/language-switch";
import { getLang, tr } from "@/lib/i18n";
import { LoginForm } from "./login-form";

// Reading the language cookie is a request-time read, so with Cache Components it sits inside <Suspense>.
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--sidebar)] via-[#06405e] to-[#0a6a9a] px-4">
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </main>
  );
}

async function LoginCard() {
  const lang = await getLang();
  return (
    <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-2xl">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <Image src="/brand/setmi-badge-256.png" alt="SETMI INDIA" width={96} height={96} priority className="h-24 w-24 rounded-full shadow-md" />
        <div>
          <h1 className="text-xl font-semibold leading-tight">SETMI INDIA</h1>
          <p className="text-sm text-muted">{tr(lang, "login_subtitle")}</p>
        </div>
      </div>
      <LoginForm
        labels={{ email: tr(lang, "login_email"), password: tr(lang, "login_password"), button: tr(lang, "login_button"), busy: tr(lang, "login_busy") }}
      />
      <div className="mt-5 flex justify-center">
        <LanguageSwitch lang={lang} label={tr(lang, "top_language")} />
      </div>
    </div>
  );
}
