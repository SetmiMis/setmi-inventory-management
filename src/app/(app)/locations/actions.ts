"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { locationFromForm } from "@/lib/validation/location";

export type LocationState = { ok: boolean; message: string } | null;
const fail = (message: string): LocationState => ({ ok: false, message });

// Create (no id) or update (id). Needs locations.manage; the database checks it again.
// On update, expectedUpdatedAt stops two people overwriting each other's change.
export async function saveLocation(_prev: LocationState, fd: FormData): Promise<LocationState> {
  await requirePermission("locations.manage");

  const parsed = locationFromForm(fd);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const supabase = await createClient();

  const rawId = fd.get("id");
  if (!rawId) {
    const { data, error } = await supabase
      .from("locations")
      .insert({ code: v.code, name: v.name, type: v.type, address: v.address })
      .select("id")
      .single();
    if (error) return fail(friendlyDbError(error));
    revalidatePath("/locations");
    redirect(`/locations/${data.id}`);
  }

  const id = z.uuid().safeParse(rawId);
  const expected = z.string().min(1).max(64).safeParse(fd.get("expectedUpdatedAt"));
  if (!id.success || !expected.success) return fail("Invalid form data.");

  const { data, error } = await supabase
    .from("locations")
    .update({ code: v.code, name: v.name, type: v.type, address: v.address })
    .eq("id", id.data)
    .eq("updated_at", expected.data)
    .select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) {
    return fail("This location was changed by someone else (or you may not edit it). Reload the page and try again.");
  }

  revalidatePath("/locations");
  revalidatePath(`/locations/${id.data}`);
  return { ok: true, message: "Saved." };
}

export async function setLocationActive(_prev: LocationState, fd: FormData): Promise<LocationState> {
  await requirePermission("locations.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid form data.");
  const active = fd.get("active") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase.from("locations").update({ is_active: active }).eq("id", id.data).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data || data.length === 0) return fail("Nothing was changed.");

  revalidatePath("/locations");
  revalidatePath(`/locations/${id.data}`);
  return { ok: true, message: active ? "Location restored." : "Location archived." };
}
