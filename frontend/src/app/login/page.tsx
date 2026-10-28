import { Suspense } from "react";
import Image from "next/image";
import { BarChart3, Boxes, ShieldCheck, TrendingUp, Truck, Users, Warehouse } from "lucide-react";
import { LanguageDropdown } from "@/components/language-dropdown";
import { getLang, tr } from "@/lib/i18n";
import { LoginForm } from "./login-form";

// The login screen is designed in light colours only (teal on mint), also when the computer is in dark mode.
// Reading the language cookie is a request-time read, so with Cache Components it sits inside <Suspense>.
export default function LoginPage() {
  return (
    <main data-auth className="min-h-screen bg-[#f2fbf9] text-[#0b2540] [color-scheme:light] lg:grid lg:grid-cols-[1.12fr_0.88fr]">
      <Suspense fallback={null}>
        <LoginScreen />
      </Suspense>
    </main>
  );
}

async function LoginScreen() {
  const lang = await getLang();
  const features = [
    { icon: Boxes, text: tr(lang, "login_f1") },
    { icon: Truck, text: tr(lang, "login_f2") },
    { icon: BarChart3, text: tr(lang, "login_f3") },
    { icon: Warehouse, text: tr(lang, "login_f4") },
  ];
  const trust = [
    { icon: TrendingUp, text: tr(lang, "login_t1") },
    { icon: ShieldCheck, text: tr(lang, "login_t2") },
    { icon: Users, text: tr(lang, "login_t3") },
  ];

  return (
    <>
      {/* Left: what the system is for (desktop only; on a phone the card alone is enough). */}
      <section className="relative hidden overflow-hidden bg-[#eaf7f4] lg:flex lg:flex-col">
        <div className="login-rise px-12 pt-10 [@media(max-height:780px)]:pt-6">
          <div className="flex items-center gap-5">
            <Image
              src="/brand/setmi-round-512.png"
              alt=""
              width={112}
              height={112}
              priority
              className="h-24 w-24 xl:h-28 xl:w-28 [@media(max-height:780px)]:!h-20 [@media(max-height:780px)]:!w-20"
            />
            <div className="leading-tight">
              <p className="text-4xl font-extrabold tracking-tight xl:text-5xl">
                <span className="bg-gradient-to-r from-[#0b7fb0] to-[#12b5c9] bg-clip-text text-transparent">SETMI</span>{" "}
                <span className="text-[#16a34a]">INDIA</span>
              </p>
              <p className="mt-1 text-base font-medium text-[#0b5f7a]">Engineered for the Extraordinary.</p>
            </div>
          </div>

          <p className="mt-6 inline-block rounded-full bg-[#d6f0ea] px-4 py-1.5 text-sm font-semibold text-[#075f54]">
            {tr(lang, "login_tag")}
          </p>

          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl [@media(max-height:780px)]:xl:text-4xl">
            {tr(lang, "login_h1a")}<br />{tr(lang, "login_h1b")}
          </h1>

          <p className="mt-4 max-w-xl text-lg text-[#3d5565]">{tr(lang, "login_lead")}</p>

          <ul className="mt-7 [@media(max-height:780px)]:mt-4 grid max-w-2xl grid-cols-4 gap-4">
            {features.map(({ icon: Icon, text }, i) => (
              <li
                key={text}
                className="login-rise flex flex-col items-center gap-2 text-center text-sm font-medium"
                style={{ animationDelay: `${120 + i * 80}ms` }}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d6f0ea] text-[#0b8a7b]">
                  <Icon size={26} aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-auto min-h-[240px] flex-1">
          <Image
            src="/brand/login-hero.jpg"
            alt=""
            fill
            sizes="55vw"
            className="-mr-0.5 !w-[calc(100%+2px)] max-w-none object-cover object-[center_30%]"
          />
          {/* A soft wave where the picture meets the page. */}
          <svg aria-hidden viewBox="0 0 1200 120" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-20 w-full fill-[#eaf7f4]">
            <path d="M0 0H1200V30C1000 110 800 20 560 70C340 115 160 90 0 40Z" />
          </svg>
          <ul className="absolute inset-x-8 bottom-6 grid grid-cols-3 divide-x divide-[#0b2540]/10 rounded-2xl bg-white/85 py-4 shadow-lg backdrop-blur">
            {trust.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 px-5 text-sm font-medium">
                <Icon size={26} className="shrink-0 text-[#0b8a7b]" aria-hidden /> {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Right: the sign-in card. */}
      <section className="flex min-h-screen items-center justify-center px-3 py-8 sm:px-4 [@media(max-height:780px)]:py-4 lg:bg-[#e9f6f3]">
        <div className="login-rise relative w-full max-w-md rounded-3xl bg-white p-5 min-[400px]:p-7 shadow-[0_20px_60px_-15px_rgba(11,37,64,0.25)] sm:p-10 [@media(max-height:780px)]:sm:!p-6">
          <div className="mb-4 flex justify-end [@media(max-height:780px)]:mb-1">
            <LanguageDropdown lang={lang} label={tr(lang, "top_language")} />
          </div>
          <div className="mb-6 flex flex-col items-center text-center [@media(max-height:780px)]:mb-3">
            <Image
              src="/brand/setmi-round-512.png"
              alt=""
              width={152}
              height={152}
              priority
              className="h-28 w-28 sm:h-36 sm:w-36 [@media(max-height:780px)]:sm:!h-20 [@media(max-height:780px)]:sm:!w-20"
            />
            <p className="mt-3 text-3xl font-extrabold tracking-tight">SETMI <span className="text-[#0b6e5c]">INDIA</span></p>
            <p className="text-sm text-[#3d5565]">{tr(lang, "login_subtitle")}</p>
          </div>
          <h2 className="text-center text-2xl font-bold">{tr(lang, "login_welcome")}</h2>
          <p className="mb-6 [@media(max-height:780px)]:mb-3 mt-1 text-center text-sm text-[#3d5565]">{tr(lang, "login_welcome_sub")}</p>
          <LoginForm
            labels={{
              email: tr(lang, "login_email_label"),
              emailPlaceholder: tr(lang, "login_email_ph"),
              password: tr(lang, "login_password"),
              passwordPlaceholder: tr(lang, "login_password_ph"),
              button: tr(lang, "login_button"),
              busy: tr(lang, "login_busy"),
              show: tr(lang, "login_show"),
              hide: tr(lang, "login_hide"),
              forgot: tr(lang, "login_forgot"),
              remember: tr(lang, "login_remember"),
            }}
          />
          <div className="mt-8 [@media(max-height:780px)]:mt-4 border-t border-[#dbe7e5] pt-4 text-center text-xs text-[#3d5565]">
            <p className="flex items-center justify-center gap-1.5 font-medium">
              <ShieldCheck size={14} aria-hidden /> {tr(lang, "login_authorized")}
            </p>
            <p className="mt-0.5">{tr(lang, "login_monitored")}</p>
          </div>
        </div>
      </section>
    </>
  );
}

export const metadata = { title: "Sign in" };