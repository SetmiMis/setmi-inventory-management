"use client";

import { useActionState } from "react";
import { addBarcode, removeBarcode, setItemActive, type FormState } from "./actions";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
      {state.message}
    </span>
  );
}

export function BarcodeManager({
  itemId,
  barcodes,
  canEdit,
}: {
  itemId: string;
  barcodes: { id: string; barcode: string }[];
  canEdit: boolean;
}) {
  const [addState, addAction, adding] = useActionState<FormState, FormData>(addBarcode, null);
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(removeBarcode, null);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Barcodes</h2>
      {barcodes.length === 0 ? (
        <p className="text-sm text-neutral-500">No barcode yet.</p>
      ) : (
        <ul className="space-y-1">
          {barcodes.map((b) => (
            <li key={b.id} className="flex items-center gap-3 text-sm">
              <code className="rounded bg-neutral-200 px-2 py-0.5 text-neutral-900">{b.barcode}</code>
              {canEdit && (
                <form action={removeAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="itemId" value={itemId} />
                  <button type="submit" disabled={removing} className={secondaryButton}>Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <Message state={removeState} />
      {canEdit && (
        <form action={addAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="itemId" value={itemId} />
          <input name="barcode" required maxLength={64} placeholder="Scan or type barcode"
            aria-label="New barcode" className={`${inputClass} !mt-0 max-w-xs`} />
          <button type="submit" disabled={adding} className={primaryButton}>Add barcode</button>
          <Message state={addState} />
        </form>
      )}
    </section>
  );
}

export function ArchiveControl({ itemId, isActive }: { itemId: string; isActive: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setItemActive, null);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="active" value={isActive ? "false" : "true"} />
      <button type="submit" disabled={pending} className={secondaryButton}>
        {isActive ? "Archive item" : "Restore item"}
      </button>
      <Message state={state} />
    </form>
  );
}
