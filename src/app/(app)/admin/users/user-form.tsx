"use client";

import { useActionState } from "react";
import { saveUser, type SaveUserState } from "./actions";

export type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  permissions: string[];
  locationIds: string[];
};
export type PermissionOption = { key: string; module: string; description: string };
export type LocationOption = { id: string; label: string };

export function UserForm({
  user,
  permissionOptions,
  locationOptions,
}: {
  user: UserRow;
  permissionOptions: PermissionOption[];
  locationOptions: LocationOption[];
}) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(saveUser, null);
  const modules = [...new Set(permissionOptions.map((p) => p.module))];

  return (
    <details className="rounded border border-neutral-300 p-3" open={!user.isActive}>
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{user.email}</span>
        {user.fullName ? ` (${user.fullName})` : ""}
        {user.isSelf ? " - you" : ""}
        <span className="ml-2 text-xs text-neutral-500">
          {user.isAdmin ? "admin" : user.isActive ? "active" : "waiting for activation"}
        </span>
      </summary>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="userId" value={user.id} />

        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isActive" defaultChecked={user.isActive} /> Active (can sign in and use the system)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isAdmin" defaultChecked={user.isAdmin} /> Administrator (all permissions, manages users)
          </label>
        </div>

        {modules.map((module) => (
          <fieldset key={module} className="text-sm">
            <legend className="mb-1 font-medium capitalize">{module}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {permissionOptions
                .filter((p) => p.module === module)
                .map((p) => (
                  <label key={p.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={p.key}
                      defaultChecked={user.permissions.includes(p.key)}
                    />
                    <span>
                      {p.description} <span className="text-xs text-neutral-500">({p.key})</span>
                    </span>
                  </label>
                ))}
            </div>
          </fieldset>
        ))}

        <fieldset className="text-sm">
          <legend className="mb-1 font-medium">Warehouses / shops this user can work in</legend>
          {locationOptions.length === 0 ? (
            <p className="text-neutral-500">No locations created yet.</p>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2">
              {locationOptions.map((l) => (
                <label key={l.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="locations"
                    value={l.id}
                    defaultChecked={user.locationIds.includes(l.id)}
                  />
                  {l.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          {state && (
            <span role="status" className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
              {state.message}
            </span>
          )}
        </div>
      </form>
    </details>
  );
}
