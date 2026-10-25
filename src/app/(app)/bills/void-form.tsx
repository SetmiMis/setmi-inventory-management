"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidBill } from "../billing/actions";
import { inputClass, secondaryButton } from "@/lib/ui";

export function VoidForm({ billId }: { billId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2 rounded border border-neutral-300 p-4 text-sm">
      <label htmlFor="reason" className="block font-medium">Void this bill (the goods come back into stock)</label>
      <input id="reason" value={reason} maxLength={300} placeholder="Reason, e.g. customer returned the goods" onChange={(e) => setReason(e.target.value)} className={inputClass} />
      <button type="button" disabled={busy} className={secondaryButton}
        onClick={() => {
          if (!window.confirm("Void this bill? This cannot be undone. The bill stays in the list as voided.")) return;
          start(async () => { const r = await voidBill({ id: billId, reason }); setMsg({ ok: r.ok, text: r.message }); if (r.ok) router.refresh(); });
        }}>
        {busy ? "Working..." : "Void bill"}
      </button>
      {msg && <p role="status" className={msg.ok ? "text-green-700" : "text-red-600"}>{msg.text}</p>}
    </div>
  );
}
