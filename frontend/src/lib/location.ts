import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth";

export type LocationType = "WAREHOUSE" | "SHOP";
export type MyLocation = { id: string; code: string; name: string; type: LocationType };

type RawLocation = {
  id: string;
  code: string;
  name: string;
  type: LocationType | "TRANSIT";
  is_active: boolean;
};

export const LOCATION_COOKIE = "ims_location";

// Database query cached strictly by user primitives to prevent cache-miss on object recreation
const fetchUserLocations = cache(
  async (userId: string, isAdmin: boolean, isActive: boolean): Promise<MyLocation[]> => {
    if (!isActive) return [];
    const supabase = await createClient();

    if (isAdmin) {
      const { data } = await supabase
        .from("locations")
        .select("id, code, name, type")
        .eq("is_active", true)
        .neq("type", "TRANSIT")
        .order("name");
      return (data ?? []) as MyLocation[];
    }

    const { data } = await supabase
      .from("user_locations")
      .select("locations(id, code, name, type, is_active)")
      .eq("user_id", userId);

    const places: MyLocation[] = [];

    for (const row of data ?? []) {
      const loc = row.locations as unknown as RawLocation | null;
      if (loc && loc.is_active && loc.type !== "TRANSIT") {
        places.push({
          id: loc.id,
          code: loc.code,
          name: loc.name,
          type: loc.type,
        });
      }
    }

    return places.sort((a, b) => a.name.localeCompare(b.name));
  }
);

// Wrapper for backwards compatibility across existing pages
export const getMyLocations = cache(async (user: CurrentUser): Promise<MyLocation[]> => {
  return fetchUserLocations(user.id, user.isAdmin, user.isActive);
});

// The chosen working location, cached per request
export const getCurrentLocation = cache(async (user: CurrentUser): Promise<MyLocation | null> => {
  const mine = await getMyLocations(user);
  if (mine.length === 0) return null;

  const cookieStore = await cookies();
  const wanted = cookieStore.get(LOCATION_COOKIE)?.value;

  return mine.find((l) => l.id === wanted) ?? mine[0] ?? null;
});