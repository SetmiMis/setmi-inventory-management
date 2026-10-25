import { CircleHelp, Lightbulb } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getLang, tr } from "@/lib/i18n";
import { cardClass } from "@/lib/ui";
import { helpSections } from "./help-content";

// A plain, step-by-step guide for people who have never used the system, in English or Hindi.
// Every signed-in user can open it.
export default async function HelpPage() {
  await requireUser();
  const lang = await getLang();
  const sections = helpSections(lang);
  return (
    <main className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2"><CircleHelp size={26} className="text-brand" aria-hidden /> {tr(lang, "help_title")}</h1>
        <p className="mt-1 text-sm text-muted">{tr(lang, "help_intro")}</p>
      </div>

      <nav aria-label={tr(lang, "help_title")} className={`${cardClass} flex flex-wrap gap-2`}>
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand hover:underline">
            {s.short}
          </a>
        ))}
      </nav>

      {sections.map((s) => (
        <section key={s.id} id={s.id} className={`${cardClass} help-section scroll-mt-24 space-y-3`}>
          <h2 className="text-lg">{s.title}</h2>
          <p className="text-sm text-muted">{s.intro}</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {s.steps.map((t, i) => <li key={i}>{t}</li>)}
          </ol>
          {s.tips && (
            <ul className="space-y-1 rounded-lg bg-surface-muted p-3 text-sm">
              {s.tips.map((t, i) => (
                <li key={i} className="flex gap-2"><Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden /> <span>{t}</span></li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
