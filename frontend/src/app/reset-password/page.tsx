import { Suspense } from "react";
import { getLang, tr } from "@/lib/i18n";
import { AuthCard } from "../login/auth-card";
import { ResetForm } from "./reset-form";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <Screen />
    </Suspense>
  );
}

async function Screen() {
  const lang = await getLang();

  return (
    <AuthCard
      lang={lang}
      languageLabel={tr(lang, "top_language")}
      title={tr(lang, "reset_title")}
      subtitle={tr(lang, "reset_sub")}
    >
      <ResetForm
        labels={{
          password: tr(lang, "reset_new"),
          confirm: tr(lang, "reset_confirm"),
          button: tr(lang, "reset_button"),
          busy: tr(lang, "reset_busy"),
          show: tr(lang, "login_show"),
          hide: tr(lang, "login_hide"),
          errors: {
            short: tr(lang, "reset_short"),
            mismatch: tr(lang, "reset_mismatch"),
            expired: tr(lang, "reset_expired"),
            rejected: tr(lang, "reset_rejected"),
          },
        }}
      />
    </AuthCard>
  );
}

export const metadata = { title: "Reset password" };