import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { can, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LocationArchiveControl, LocationForm } from "../location-form";

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: loc } = await supabase
    .from("locations")
    .select("id, code, name, type, address, city, capacity, contact_person, phone, email, is_active, updated_at")
    .eq("id", id.data)
    .maybeSingle();
  if (!loc) notFound();

  const canManage = can(user, "locations.manage");
  // Only admins may read other users' rows (RLS), so only they get the "who works here" list.
  let workers: { id: string; email: string }[] = [];
  if (user.isActive && user.isAdmin) {
    const { data } = await supabase
      .from("user_locations")
      .select("profiles(id, email)")
      .eq("location_id", loc.id);
    workers = (data ?? [])
      .map((r) => r.profiles as unknown as { id: string; email: string } | null)
      .filter((p): p is { id: string; email: string } => Boolean(p));
  }

  return (
    <main className="space-y-6">
      <p className="text-sm">
        <Link href="/locations" className="text-blue-700 underline">Locations</Link> / {loc.code}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{loc.name}</h1>
        <span className="rounded border border-neutral-400 px-2 py-0.5 text-xs">{loc.type === "SHOP" ? "Shop" : "Warehouse"}</span>
        {!loc.is_active && <span className="rounded border border-amber-500 px-2 py-0.5 text-xs">Archived</span>}
      </div>

      {canManage ? (
        <LocationForm
          location={{ id: loc.id, updatedAt: loc.updated_at, code: loc.code, name: loc.name, type: loc.type, address: loc.address, city: loc.city, capacity: loc.capacity, contactPerson: loc.contact_person, phone: loc.phone, email: loc.email }}
        />
      ) : (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Code</dt><dd>{loc.code}</dd></div>
          <div><dt className="font-medium">Type</dt><dd>{loc.type === "SHOP" ? "Shop" : "Warehouse"}</dd></div>
          <div className="sm:col-span-2"><dt className="font-medium">Address</dt><dd>{loc.address ?? ""}</dd></div>
        </dl>
      )}

      {canManage && <LocationArchiveControl id={loc.id} isActive={loc.is_active} />}

      {user.isAdmin && (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Users who work here</h2>
          {workers.length === 0 ? (
            <p className="text-sm text-neutral-500">Nobody is assigned yet.</p>
          ) : (
            <ul className="list-inside list-disc text-sm">{workers.map((w) => <li key={w.id}>{w.email}</li>)}</ul>
          )}
          <p className="text-xs text-neutral-500">
            Change this on the <Link href="/admin/users" className="text-blue-700 underline">Users</Link> page.
          </p>
        </section>
      )}
    </main>
  );
}
