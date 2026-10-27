import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// A friendly "nothing here yet" box: says what this screen is for and offers the next step,
// instead of a bare "No items found." (a dead end for a first-time user).
export function EmptyState({
  icon: Icon, title, text, actionHref, actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-[var(--brand-text)]">
        <Icon size={24} aria-hidden />
      </span>
      <p className="text-base font-semibold">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-strong sm:min-h-10"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
