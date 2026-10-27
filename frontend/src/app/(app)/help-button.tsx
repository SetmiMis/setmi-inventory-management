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
      aria-label={label}
      title={label}
      className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg text-muted transition hover:bg-surface-muted sm:inline-flex"
    >
      <CircleHelp size={22} aria-hidden />
    </Link>
  );
}
