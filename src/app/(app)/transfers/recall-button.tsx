"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recallTransfer } from "./actions";
import { secondaryButton } from "@/lib/ui";

export function RecallButton({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <button type="button" disabled={busy} className={secondaryButton}
        onClick={() => {
          if (!window.confirm("Recall this transfer? The goods go back to your stock. Do this only if they have not been received.")) return;
          start(async () => { const r = await recallTransfer({ id: transferId }); if (r.ok) router.refresh(); else setMsg(r.message); });
        }}>
        {busy ? "Working..." : "Recall (take the goods back)"}
      </button>
      {msg && <span role="alert" className="text-sm text-red-600">{msg}</span>}
    </div>
  );
}
