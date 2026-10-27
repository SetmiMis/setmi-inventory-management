"use client";

import { MapPin } from "lucide-react";
import { switchLocation } from "./actions";

export function LocationSwitcher({
  locations,
  currentId,
  label = "Working in",
}: {
  locations: { id: string; code: string; name: string }[];
  currentId: string;
  label?: string;
}) {
  return (
    <form action={switchLocation} className="flex items-center gap-2 text-sm">
      <label htmlFor="locationId" className="flex items-center gap-1.5 text-muted">
        <MapPin size={16} aria-hidden /> {label}
      </label>
      <select
        id="locationId"
        name="locationId"
        defaultValue={currentId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-line bg-surface px-2 py-1.5 font-medium shadow-sm"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
        ))}
      </select>
    </form>
  );
}
