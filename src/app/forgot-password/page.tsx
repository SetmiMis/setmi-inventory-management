import { Suspense } from "react";
import { getLang, tr } from "@/lib/i18n";
import { AuthCard } from "../login/auth-card";
import { ForgotForm } from "./forgot-form";

type SearchParams = Record<string, string | string[] | undefined>;

// Reading the language cookie and the address is a request-time read, so it sits inside <Suspense>.
export default function ForgotPasswordPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={null}>
      <Screen searchParams={searchParams} />
    </Suspense>
  );
}

async function Screen({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const lang = await getLang();
  const sp = await searchParams;
  const expired = sp.expired === "1";
  return (
    <AuthCard lang={lang} languageLabel={tr(lang, "top_language")} title={tr(lang, "forgot_title")} subtitle={tr(lang, "forgot_sub")}>
      {expired && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{tr(lang, "forgot_expired")}</p>
      )}
      <ForgotForm
        labels={{
          email: tr(lang, "login_email_label"), emailPlaceholder: tr(lang, "login_email_ph"),
          button: tr(lang, "forgot_button"), busy: tr(lang, "forgot_busy"), back: tr(lang, "forgot_back"),
          sent: tr(lang, "forgot_sent"), invalid: tr(lang, "forgot_invalid"),
        }}
      />
    </AuthCard>
  );
}
