import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCurrentLocation } from "@/lib/location";
import { inputClass, primaryButton, secondaryButton } from "@/lib/ui";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Everyone signed in may open this page; the database returns only the locations the user is
// allowed to see (their own, or all for admins and location managers).
export default async function LocationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const type = ["WAREHOUSE", "SHOP"].includes(first(sp.type) ?? "") ? first(sp.type)! : "";
  const status = ["active", "archived", "all"].includes(first(sp.status) ?? "") ? first(sp.status)! : "active";

  const supabase = await createClient();
  let query = supabase.from("locations").select("id, code, name, type, address, is_active").neq("type", "TRANSIT").order("type").order("name");
  if (type) query = query.eq("type", type);
  if (status !== "all") query = query.eq("is_active", status === "active");
  const { data, error } = await query;
  const current = await getCurrentLocation(user);
  const canManage = can(user, "locations.manage");

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Warehouses and shops</h1>
        {canManage && <Link href="/locations/new" className={primaryButton}>New location</Link>}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-3">
        <select name="type" defaultValue={type} aria-label="Type" className={`${inputClass} !mt-0 w-40`}>
          <option value="">Warehouses + shops</option>
          <option value="WAREHOUSE">Warehouses</option>
          <option value="SHOP">Shops</option>
        </select>
        <select name="status" defaultValue={status} aria-label="Status" className={`${inputClass} !mt-0 w-36`}>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button type="submit" className={secondaryButton}>Filter</button>
      </form>

      {error ? (
        <p role="alert" className="text-red-600">Could not load locations.</p>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm">
          {canManage ? "No locations yet. Create your first warehouse or shop." : "No locations are assigned to you yet. Ask an administrator."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-2 pr-3">Code</th><th className="pr-3">Name</th><th className="pr-3">Type</th>
                <th className="pr-3">Address</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((l) => (
                <tr key={l.id} className="border-b border-neutral-200">
                  <td className="py-2 pr-3">
                    <Link href={`/locations/${l.id}`} className="font-medium text-blue-700 underline">{l.code}</Link>
                  </td>
                  <td className="pr-3">{l.name}{current?.id === l.id ? " (you are working here)" : ""}</td>
                  <td className="pr-3">{l.type === "SHOP" ? "Shop" : "Warehouse"}</td>
                  <td className="pr-3">{l.address ?? ""}</td>
                  <td>{l.is_active ? "Active" : "Archived"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
