"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

export type CategoryState = { ok: boolean; message: string } | null;

const schema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Category name is required.").max(100, "Category name is too long."),
  isActive: z.boolean(),
});

// One action for create (no id) and update (id). Needs categories.manage.
export async function saveCategory(_prev: CategoryState, fd: FormData): Promise<CategoryState> {
  await requirePermission("categories.manage");

  const rawId = fd.get("id");
  const parsed = schema.safeParse({
    id: rawId ? String(rawId) : null,
    name: fd.get("name"),
    isActive: rawId ? fd.get("isActive") === "on" : true,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;

  const supabase = await createClient();
  const result = v.id
    ? await supabase.from("categories").update({ name: v.name, is_active: v.isActive }).eq("id", v.id).select("id")
    : await supabase.from("categories").insert({ name: v.name }).select("id");

  if (result.error) return { ok: false, message: friendlyDbError(result.error) };
  if (!result.data || result.data.length === 0) return { ok: false, message: "Nothing was saved." };

  revalidatePath("/items/categories");
  return { ok: true, message: v.id ? "Saved." : "Category added." };
}
