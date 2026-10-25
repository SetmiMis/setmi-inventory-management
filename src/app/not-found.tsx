import Link from "next/link";
import { SearchX } from "lucide-react";
import { primaryButton } from "@/lib/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <SearchX size={48} className="text-brand" aria-hidden />
      <h1>Page not found</h1>
      <p className="max-w-sm text-sm text-muted">This page does not exist, or you do not have access to it.</p>
      <Link href="/" className={primaryButton}>Go to home</Link>
    </main>
  );
}
