// Shared Tailwind class strings so forms look the same everywhere.
// Touch targets are at least 44px high on phones and tablets (40px on a desktop mouse).
export const inputClass =
  "mt-1 min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-surface px-3 py-2 text-base shadow-sm transition placeholder:text-muted disabled:opacity-60 sm:min-h-10 sm:text-sm";
export const labelClass = "block text-sm font-medium";
export const primaryButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-strong active:scale-[0.98] disabled:opacity-60 sm:min-h-10";
export const secondaryButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-surface-muted active:scale-[0.98] disabled:opacity-60 sm:min-h-10";
// For actions that cancel or undo something: red, so they do not look like a harmless button.
export const dangerButton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--danger)] bg-surface px-3 py-1.5 text-sm font-medium text-[var(--danger)] shadow-sm transition hover:bg-surface-muted active:scale-[0.98] disabled:opacity-60 sm:min-h-10";
// A white card to group related content.
export const cardClass = "rounded-xl border border-line bg-surface p-4 shadow-sm";
