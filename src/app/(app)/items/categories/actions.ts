"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type CategoryState = { ok: boolean; message: string } | null;

const schema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Category name is required.").max(100, "Category name is too long."),
  // Optional short code: capital letters, digits and "-", at most 12 characters.
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{0,11}$/, "Use up to 12 capital letters, digits or - for the code.").or(z.literal("")),
  description: z.string().trim().max(300, "The description can have at most 300 characters."),
  isActive: z.boolean(),
});

// One action for create (no id) and update (id). Needs categories.manage (the database checks it again).
export async function saveCategory(_prev: CategoryState, fd: FormData): Promise<CategoryState> {
  await requirePermission("categories.manage");

  const rawId = fd.get("id");
  const parsed = schema.safeParse({
    id: rawId ? String(rawId) : null,
    name: fd.get("name"),
    code: String(fd.get("code") ?? ""),
    description: String(fd.get("description") ?? ""),
    isActive: rawId ? fd.get("isActive") === "on" : true,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const fields = { name: v.name, code: v.code || null, description: v.description || null };

  const supabase = await createClient();
  const result = v.id
    ? await supabase.from("categories").update({ ...fields, is_active: v.isActive }).eq("id", v.id).select("id")
    : await supabase.from("categories").insert(fields).select("id");

  if (result.error) {
    // A code that is already used by another category gets a plain message.
    if (result.error.code === "23505" && result.error.message.includes("categories_code_uq")) return { ok: false, message: "This category code is already used." };
    return { ok: false, message: friendlyDbError(result.error) };
  }
  if (!result.data || result.data.length === 0) return { ok: false, message: "Nothing was saved." };

  revalidatePath("/items/categories");
  redirect(`/items/categories?sel=${result.data[0].id}`);
}

// Switch a category on or off (categories are never deleted: items keep pointing at them).
export async function setCategoryActive(fd: FormData): Promise<void> {
  await requirePermission("categories.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const active = fd.get("active") === "1";
  const supabase = await createClient();
  await supabase.from("categories").update({ is_active: active }).eq("id", id.data);
  revalidatePath("/items/categories");
  redirect(`/items/categories?sel=${id.data}`);
}
