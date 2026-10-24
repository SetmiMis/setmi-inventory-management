import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";

export type MyLocation = { id: string; code: string; name: string; type: "WAREHOUSE" | "SHOP" };

export const LOCATION_COOKIE = "ims_location";

// The places this user may work in: an admin can use every active location, anyone else only
// the ones an admin assigned (user_locations). Database rules (RLS) filter this list again.
export const getMyLocations = cache(async (user: CurrentUser): Promise<MyLocation[]> => {
  if (!user.isActive) return [];
  const supabase = await createClient();

  if (user.isAdmin) {
    const { data } = await supabase
      .from("locations")
      .select("id, code, name, type")
      .eq("is_active", true)
      .neq("type", "TRANSIT") // the hidden "in transit" system place is never a working place
      .order("name");
    return (data ?? []) as MyLocation[];
  }

  const { data } = await supabase
    .from("user_locations")
    .select("locations(id, code, name, type, is_active)")
    .eq("user_id", user.id);
  const places = (data ?? [])
    .map((row) => row.locations as unknown as (MyLocation & { is_active: boolean }) | null)
    .filter((l): l is MyLocation & { is_active: boolean } => Boolean(l) && l!.is_active);
  return places
    .map(({ id, code, name, type }) => ({ id, code, name, type }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// The chosen working location. The cookie is only a preference: it is accepted only if it is
// one of the user's own locations right now, otherwise the first allowed location is used.
export async function getCurrentLocation(user: CurrentUser): Promise<MyLocation | null> {
  const mine = await getMyLocations(user);
  const wanted = (await cookies()).get(LOCATION_COOKIE)?.value;
  return mine.find((l) => l.id === wanted) ?? mine[0] ?? null;
}
