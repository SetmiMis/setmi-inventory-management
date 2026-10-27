"use client";

import { useActionState } from "react";
import { setBillingEnabled, type SettingState } from "./actions";
import { primaryButton, secondaryButton } from "@/lib/ui";

export function BillingSwitch({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<SettingState, FormData>(setBillingEnabled, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={enabled ? secondaryButton : primaryButton}
        onClick={(e) => {
          const msg = enabled
            ? "Switch billing OFF? New bills will be refused. Old bills stay and can still be voided."
            : "Switch billing ON? Staff with the billing right can then make bills here, and every bill reduces stock. Do this only if you stop billing in Zoho for those sales.";
          if (!window.confirm(msg)) e.preventDefault();
        }}
      >
        {pending ? "Working..." : enabled ? "Switch billing OFF" : "Switch billing ON"}
      </button>
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</p>
      )}
    </form>
  );
}
