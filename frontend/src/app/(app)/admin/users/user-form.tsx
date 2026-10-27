"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Ellipsis, Eye, Loader2, Save, Trash2, UserPlus } from "lucide-react";
import {
  applyRoleAction, cancelInviteAction, inviteUserAction, saveDepartmentAction, saveProfileAction, saveRoleAction, saveUser, setRoleActiveAction, type SaveUserState,
} from "./actions";

export type PermissionOption = { key: string; module: string; description: string };
export type LocationOption = { id: string; label: string };
export type Option = { id: string; name: string };

const field = "min-h-12 w-full rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm";
const primary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60";
const msg = (s: SaveUserState) => s && <p role={s.ok ? "status" : "alert"} className={`rounded-lg border p-2 text-sm ${s.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}>{s.message}</p>;

export function UserRowMenu({ viewHref, accessHref }: { viewHref: string; accessHref: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-brand-soft";
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label="More actions"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface hover:bg-surface-muted"><Ellipsis size={18} aria-hidden /></button>
      {open && (
        <ul className="absolute right-0 z-40 mt-2 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <li><Link href={viewHref} className={itemClass} onClick={() => setOpen(false)}><Eye size={16} aria-hidden /> View details</Link></li>
          <li><Link href={accessHref} className={itemClass} onClick={() => setOpen(false)}>Change access</Link></li>
        </ul>
      )}
    </div>
  );
}

// Checkboxes of permissions, grouped by module.
export function PermissionGrid({ options, selected, name = "permissions" }: { options: PermissionOption[]; selected: string[]; name?: string }) {
  const modules = [...new Set(options.map((p) => p.module))];
  return (
    <div className="space-y-3">
      {modules.map((module) => (
        <fieldset key={module} className="text-sm">
          <legend className="mb-1 font-semibold capitalize">{module}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {options.filter((p) => p.module === module).map((p) => (
              <label key={p.key} className="flex items-start gap-2 py-0.5">
                <input type="checkbox" name={name} value={p.key} defaultChecked={selected.includes(p.key)} className="mt-0.5 h-4 w-4" />
                <span>{p.description} <span className="text-xs text-muted">({p.key})</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function LocationGrid({ options, selected }: { options: LocationOption[]; selected: string[] }) {
  if (options.length === 0) return <p className="text-sm text-muted">No locations created yet.</p>;
  return (
    <div className="grid gap-1 sm:grid-cols-2 text-sm">
      {options.map((l) => (
        <label key={l.id} className="flex items-center gap-2 py-0.5"><input type="checkbox" name="locations" value={l.id} defaultChecked={selected.includes(l.id)} className="h-4 w-4" />{l.label}</label>
      ))}
    </div>
  );
}

// Name, role label and department.
export function ProfileForm({ userId, fullName, roleId, departmentId, roles, departments }: { userId: string; fullName: string; roleId: string; departmentId: string; roles: Option[]; departments: Option[] }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(saveProfileAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <label className="block"><span className="mb-1 block text-xs text-muted">Full name</span><input name="fullName" defaultValue={fullName} maxLength={100} className={field} /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted">Role label</span>
        <select name="roleId" defaultValue={roleId} className={field}><option value="">No role</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="block"><span className="mb-1 block text-xs text-muted">Department</span>
        <select name="departmentId" defaultValue={departmentId} className={field}><option value="">No department</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <p className="text-xs text-muted">This only changes the name, the label and the department. To give the permissions of a role use Change Role.</p>
      {msg(state)}
      <button type="submit" disabled={pending} className={`${primary} w-full`}>{pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Profile</button>
    </form>
  );
}

// Change Role: copies the permissions of the role to the user.
export function ChangeRoleForm({ userId, roleId, roles }: { userId: string; roleId: string; roles: Option[] }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(applyRoleAction, null);
  return (
    <form action={formAction} className="space-y-2 rounded-xl border border-line bg-surface-muted p-3">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm font-bold">Change Role</p>
      <select name="roleId" defaultValue={roleId} required aria-label="Role" className={field}><option value="">Choose a role...</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      <p className="text-xs text-muted">The permissions of this person are replaced by the permissions of the role (an Admin role also makes the person an administrator). Places are not changed.</p>
      {msg(state)}
      <button type="submit" disabled={pending} onClick={(e) => { if (!window.confirm("Give this role? The person's permissions are replaced by the role's permissions.")) e.preventDefault(); }} className={`${primary} w-full`}>
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />} Give This Role
      </button>
    </form>
  );
}

// Active / administrator / permissions / places of one user.
export function AccessForm({ userId, isActive, isAdmin, isSelf, permissions, locationIds, permissionOptions, locationOptions }: {
  userId: string; isActive: boolean; isAdmin: boolean; isSelf: boolean; permissions: string[]; locationIds: string[]; permissionOptions: PermissionOption[]; locationOptions: LocationOption[];
}) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(saveUser, null);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={isActive} className="h-4 w-4" /> Allow Login (active: can sign in and use the system)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isAdmin" defaultChecked={isAdmin} className="h-4 w-4" /> Administrator (all permissions, manages users)</label>
        {isSelf && <p className="text-xs text-muted">This is you: you cannot switch yourself off or remove your own admin right.</p>}
      </div>
      <div><h3 className="mb-2 text-sm font-bold">Permissions</h3><PermissionGrid options={permissionOptions} selected={permissions} /></div>
      <div><h3 className="mb-2 text-sm font-bold">Warehouses / shops this person can work in</h3><LocationGrid options={locationOptions} selected={locationIds} /></div>
      {msg(state)}
      <button type="submit" disabled={pending} className={`${primary} w-full`}>{pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} Save Access</button>
    </form>
  );
}

// Add User = write the invite. The login itself is made in the Supabase dashboard.
export function AddUserForm({ roles, departments, locationOptions }: { roles: Option[]; departments: Option[]; locationOptions: LocationOption[] }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(inviteUserAction, null);
  return (
    <form action={formAction} className="space-y-3">
      <label className="block"><span className="mb-1 block text-xs text-muted">Email *</span><input name="email" type="email" required maxLength={200} autoComplete="off" placeholder="name@company.com" className={field} /></label>
      <label className="block"><span className="mb-1 block text-xs text-muted">Full name</span><input name="fullName" maxLength={100} className={field} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Role *</span>
          <select name="roleId" required defaultValue="" className={field}><option value="">Choose...</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Department</span>
          <select name="departmentId" defaultValue="" className={field}><option value="">None</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      </div>
      <div><h3 className="mb-1 text-sm font-bold">Warehouses / shops</h3><LocationGrid options={locationOptions} selected={[]} /></div>
      <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-muted">
        <p className="font-semibold text-[var(--foreground)]">How it works</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Save here. The person shows in the list as Invited.</li>
          <li>In the Supabase dashboard (Authentication, Users) make the login with the same email.</li>
          <li>At the first sign-in the role&apos;s permissions, department and places are set and the person is switched on.</li>
        </ol>
      </div>
      {msg(state)}
      <button type="submit" disabled={pending} className={`${primary} w-full`}>{pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <UserPlus size={16} aria-hidden />} Save Invite</button>
    </form>
  );
}

export function CancelInvite({ inviteId }: { inviteId: string }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(cancelInviteAction, null);
  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="inviteId" value={inviteId} />
      {msg(state)}
      <button type="submit" disabled={pending} onClick={(e) => { if (!window.confirm("Cancel this invite?")) e.preventDefault(); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">
        <Trash2 size={16} aria-hidden /> Cancel Invite
      </button>
    </form>
  );
}

// A role: name, description and its permissions (a template).
export function RoleEditor({ roleId, name, description, keys, system, permissionOptions }: { roleId: string; name: string; description: string; keys: string[]; system: boolean; permissionOptions: PermissionOption[] }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(saveRoleAction, null);
  return (
    <form action={formAction} className="space-y-3" key={roleId || "new"}>
      <input type="hidden" name="roleId" value={roleId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Role name *</span><input name="name" defaultValue={name} required minLength={2} maxLength={60} readOnly={system} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Description</span><input name="description" defaultValue={description} maxLength={200} readOnly={system} className={field} /></label>
      </div>
      {system ? <p className="rounded-lg border border-line bg-surface-muted p-3 text-sm">The Admin role has every permission and cannot be changed.</p> : (
        <>
          <PermissionGrid options={permissionOptions} selected={keys} />
          <p className="text-xs text-muted">Saving a role does NOT change people who already have it. Use Change Role on a person to give them the new permissions.</p>
          {msg(state)}
          <button type="submit" disabled={pending} className={primary}>{pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Save size={16} aria-hidden />} {roleId ? "Save Role" : "Create Role"}</button>
        </>
      )}
    </form>
  );
}

export function RoleActiveButton({ roleId, active }: { roleId: string; active: boolean }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(setRoleActiveAction, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="roleId" value={roleId} /><input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" disabled={pending} className="min-h-10 rounded-lg border border-line bg-surface px-3 text-xs font-semibold hover:bg-surface-muted disabled:opacity-60">{active ? "Switch off" : "Switch on"}</button>
      {state && !state.ok && <span role="alert" className="ml-2 text-xs text-[var(--danger)]">{state.message}</span>}
    </form>
  );
}

// Add or rename a department / switch it off.
export function DepartmentForm({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [state, formAction, pending] = useActionState<SaveUserState, FormData>(saveDepartmentAction, null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2" key={id || "new"}>
      <input type="hidden" name="departmentId" value={id} />
      <input name="name" defaultValue={name} required minLength={2} maxLength={60} placeholder="Department name" aria-label="Department name" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--line-strong)] bg-surface px-3 text-base md:text-sm" />
      {id && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="active" value="true" defaultChecked={active} className="h-4 w-4" /> Active</label>}
      <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">{id ? "Save" : "Add"}</button>
      {state && <span role={state.ok ? "status" : "alert"} className={`w-full text-xs ${state.ok ? "text-green-700" : "text-[var(--danger)]"}`}>{state.message}</span>}
    </form>
  );
}
