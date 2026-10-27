"use client";

import { primaryButton } from "@/lib/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={primaryButton}>
      Print
    </button>
  );
}
