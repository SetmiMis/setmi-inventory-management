"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { LOCATION_COOKIE, getMyLocations } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  (await cookies()).delete(LOCATION_COOKIE);
  redirect("/login");
}

// "Which warehouse or shop am I working in now?" Only one of the user's OWN locations is
// accepted; anything else (a forged id, a location that was taken away) is ignored.
export async function switchLocation(fd: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(fd.get("locationId"));
  if (!id.success) return;
  const mine = await getMyLocations(user);
  if (!mine.some((l) => l.id === id.data)) return;

  (await cookies()).set(LOCATION_COOKIE, id.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}
