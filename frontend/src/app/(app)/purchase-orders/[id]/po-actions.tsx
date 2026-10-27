"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCheck, Send } from "lucide-react";
import { cancelPurchaseOrder, closePurchaseOrder, sendPurchaseOrder } from "../actions";
import { dangerButton, inputClass, primaryButton, secondaryButton } from "@/lib/ui";

// Buttons on the order page. The database re-checks everything; these only call it.
export function PoActions({ id, status, canApprove }: { id: string; status: string; canApprove: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!canApprove) return null;

  function act(fn: () => Promise<{ ok: boolean; message: string }>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {status === "DRAFT" && (
          <button type="button" disabled={busy} className={primaryButton}
            onClick={() => act(() => sendPurchaseOrder({ id }), "Send this order? It can no longer be edited after sending.")}>
            <Send size={16} aria-hidden /> Send order
          </button>
        )}
        {(status === "DRAFT" || status === "SENT") && (
          <button type="button" disabled={busy} className={dangerButton}
            onClick={() => act(() => cancelPurchaseOrder({ id }), "Cancel this order?")}>
            <Ban size={16} aria-hidden /> Cancel order
          </button>
        )}
      </div>
      {status === "PARTIAL" && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="closeNote" className="block text-sm font-medium">Close the order (the rest will not come). Reason:</label>
            <input id="closeNote" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={`${inputClass} w-80`} />
          </div>
          <button type="button" disabled={busy} className={secondaryButton}
            onClick={() => act(() => closePurchaseOrder({ id, note }), "Close this order? Nothing more can be received against it.")}>
            <CheckCheck size={16} aria-hidden /> Close order
          </button>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
