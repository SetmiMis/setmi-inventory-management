"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { helpSectionFor } from "./help/help-content";

// A "Help" button in the top bar that opens the Help section for the screen you are on.
export function HelpButton({ label = "Help" }: { label?: string }) {
  const pathname = usePathname();
  const id = helpSectionFor(pathname);
  return (
    <Link
      href={`/help#${id}`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-surface-muted"
    >
      <CircleHelp size={16} aria-hidden /> {label}
    </Link>
  );
}
