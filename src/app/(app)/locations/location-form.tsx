"use client";

import { useActionState } from "react";
import { saveLocation, setLocationActive, type LocationState } from "./actions";
import { inputClass, labelClass, primaryButton, secondaryButton } from "@/lib/ui";

export type LocationValues = {
  id: string;
  updatedAt: string;
  code: string;
  name: string;
  type: "WAREHOUSE" | "SHOP";
  address: string | null;
};

function Message({ state }: { state: LocationState }) {
  if (!state) return null;
  return (
    <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.message}</span>
  );
}

export function LocationForm({ location }: { location?: LocationValues }) {
  const [state, action, pending] = useActionState<LocationState, FormData>(saveLocation, null);

  return (
    <form action={action} className="space-y-4">
      {location && <input type="hidden" name="id" value={location.id} />}
      {location && <input type="hidden" name="expectedUpdatedAt" value={location.updatedAt} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="code" className={labelClass}>Code * (short, e.g. WH-MAIN, SHOP-01)</label>
          <input id="code" name="code" required maxLength={20} defaultValue={location?.code} className={inputClass} />
        </div>
        <div>
          <label htmlFor="type" className={labelClass}>Type *</label>
          <select id="type" name="type" required defaultValue={location?.type ?? "SHOP"} className={inputClass}>
            <option value="WAREHOUSE">Warehouse</option>
            <option value="SHOP">Shop</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="name" className={labelClass}>Name *</label>
          <input id="name" name="name" required maxLength={100} defaultValue={location?.name} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className={labelClass}>Address</label>
          <textarea id="address" name="address" rows={3} maxLength={500} defaultValue={location?.address ?? ""} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Saving..." : location ? "Save changes" : "Create location"}
        </button>
        <Message state={state} />
      </div>
    </form>
  );
}

export function LocationArchiveControl({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, action, pending] = useActionState<LocationState, FormData>(setLocationActive, null);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={isActive ? "false" : "true"} />
      <button type="submit" disabled={pending} className={secondaryButton}>
        {isActive ? "Archive location" : "Restore location"}
      </button>
      <Message state={state} />
    </form>
  );
}
