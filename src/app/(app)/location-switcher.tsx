"use client";

import { switchLocation } from "./actions";

export function LocationSwitcher({
  locations,
  currentId,
}: {
  locations: { id: string; code: string; name: string }[];
  currentId: string;
}) {
  return (
    <form action={switchLocation} className="flex items-center gap-2 text-sm">
      <label htmlFor="locationId" className="text-neutral-500">Working in</label>
      <select
        id="locationId"
        name="locationId"
        defaultValue={currentId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-neutral-400 bg-transparent px-2 py-1"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
        ))}
      </select>
    </form>
  );
}
