import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { UserForm, type LocationOption, type PermissionOption, type UserRow } from "./user-form";

// Admin-only. requireAdmin() redirects everyone else. The database enforces it again:
// RLS lets only an admin read other users' rows, and admin_* functions re-check is_admin().
export default async function UsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const [profiles, permissions, userPermissions, locations, userLocations] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, is_active, is_admin").order("email"),
    supabase.from("permissions").select("key, module, description").order("module").order("key"),
    supabase.from("user_permissions").select("user_id, permission_key"),
    supabase.from("locations").select("id, code, name, type").eq("is_active", true).order("name"),
    supabase.from("user_locations").select("user_id, location_id"),
  ]);

  const failed = [profiles, permissions, userPermissions, locations, userLocations].find((r) => r.error);
  if (failed?.error) {
    return <p role="alert" className="text-red-600">Could not load users: {failed.error.message}</p>;
  }

  const permissionOptions: PermissionOption[] = permissions.data ?? [];
  const locationOptions: LocationOption[] = (locations.data ?? []).map((l) => ({
    id: l.id,
    label: `${l.name} (${l.type === "SHOP" ? "Shop" : "Warehouse"}, ${l.code})`,
  }));

  const users: UserRow[] = (profiles.data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    isActive: p.is_active,
    isAdmin: p.is_admin,
    isSelf: p.id === me.id,
    permissions: (userPermissions.data ?? []).filter((x) => x.user_id === p.id).map((x) => x.permission_key),
    locationIds: (userLocations.data ?? []).filter((x) => x.user_id === p.id).map((x) => x.location_id),
  }));

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Users and permissions</h1>
      <p className="text-sm text-neutral-500">
        New sign-ins start inactive with no permissions. Turn on only what each person needs.
        Create new users in the Supabase dashboard (Authentication, Users) for now.
      </p>
      {users.length === 0 ? (
        <p className="text-sm">No users yet.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <UserForm key={u.id} user={u} permissionOptions={permissionOptions} locationOptions={locationOptions} />
          ))}
        </div>
      )}
    </main>
  );
}
