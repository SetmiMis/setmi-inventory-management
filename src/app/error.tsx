"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { primaryButton, secondaryButton } from "@/lib/ui";

// Shown when a page crashes. It never prints the technical error to the user.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <TriangleAlert size={48} className="text-red-600" aria-hidden />
      <h1>Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">Nothing was lost. Please try again. If it keeps happening, tell the administrator what you were doing.</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className={primaryButton}>Try again</button>
        <Link href="/" className={secondaryButton}>Go to home</Link>
      </div>
    </main>
  );
}
