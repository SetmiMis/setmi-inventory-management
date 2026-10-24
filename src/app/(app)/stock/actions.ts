"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { COUNT_MAX_ROWS, parseQuantity } from "@/lib/validation/stock";

export type StockState = { ok: boolean; message: string; problems?: { code: string; message: string }[] } | null;
const fail = (message: string, problems?: { code: string; message: string }[]): StockState => ({ ok: false, message, problems });

// The place is ALWAYS the user's current working location chosen on the server, never a value
// from the form, so a forged form cannot count stock somewhere else (the database checks again).

// ---------- stock count sheet ----------
// Form fields: c_<itemId> = counted now, o_<itemId> = what the page showed. Only rows whose
// counted value differs from the shown value are sent. All or nothing in one transaction.
export async function submitCount(_prev: StockState, fd: FormData): Promise<StockState> {
  const user = await requirePermission("stock.adjust");
  const loc = await getCurrentLocation(user);
  if (!loc) return fail("You are not assigned to a warehouse or shop.");

  const kind = fd.get("kind") === "OPENING" ? "OPENING" : "ADJUSTMENT";
  const reason = String(fd.get("reason") ?? "").trim();
  if (kind === "ADJUSTMENT" && reason.length < 3) return fail("Please write a reason (at least 3 letters).");
  if (reason.length > 300) return fail("The reason is too long (max 300).");

  const rows: { item_id: string; counted: number }[] = [];
  const bad: { code: string; message: string }[] = [];
  for (const [key, value] of fd.entries()) {
    if (!key.startsWith("c_") || typeof value !== "string") continue;
    const id = z.uuid().safeParse(key.slice(2));
    if (!id.success || value.trim() === "") continue;
    const counted = parseQuantity(value);
    if (counted === null) {
      bad.push({ code: key.slice(2, 10), message: `"${value.slice(0, 20)}" is not a valid number (digits and a dot only, no minus)` });
      continue;
    }
    const shown = parseQuantity(String(fd.get(`o_${id.data}`) ?? ""));
    if (shown !== null && shown === counted) continue; // unchanged
    rows.push({ item_id: id.data, counted });
  }
  if (bad.length > 0) return fail("Some numbers are not valid.", bad);
  if (rows.length === 0) return fail("Nothing changed: no count differs from the current stock.");
  if (rows.length > COUNT_MAX_ROWS) return fail(`Too many changed rows (max ${COUNT_MAX_ROWS}). Save in parts.`);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_stock_count", {
    p_location: loc.id,
    p_rows: rows,
    p_reason: reason || null,
    p_kind: kind,
  });
  if (error) return fail(friendlyDbError(error));

  const d = data as { ok: boolean; changed: number; errors: { code?: string; message: string }[] };
  if (!d.ok) {
    return fail("Nothing was saved because some rows have problems.", d.errors.map((e) => ({ code: e.code ?? "?", message: e.message })));
  }
  revalidatePath("/stock");
  revalidatePath("/stock/count");
  revalidatePath("/stock/movements");
  return { ok: true, message: `Saved. ${d.changed} item${d.changed === 1 ? "" : "s"} updated in ${loc.name}.` };
}

// ---------- minimum / maximum level ----------
export async function saveLevel(_prev: StockState, fd: FormData): Promise<StockState> {
  const user = await requirePermission("stock.min_levels");
  const loc = await getCurrentLocation(user);
  if (!loc) return fail("You are not assigned to a warehouse or shop.");
  const itemId = z.uuid().safeParse(fd.get("itemId"));
  if (!itemId.success) return fail("Invalid form data.");

  const minText = String(fd.get("min") ?? "").trim();
  const maxText = String(fd.get("max") ?? "").trim();
  const supabase = await createClient();

  // Empty minimum = remove the level for this item here.
  if (minText === "" && maxText === "") {
    const { error } = await supabase.from("reorder_levels").delete().eq("item_id", itemId.data).eq("location_id", loc.id);
    if (error) return fail(friendlyDbError(error));
    revalidatePath("/stock");
    return { ok: true, message: "Level removed." };
  }
  const min = parseQuantity(minText);
  const max = maxText === "" ? null : parseQuantity(maxText);
  if (min === null || (maxText !== "" && max === null)) return fail("Use numbers like 5 or 12.5.");
  if (max !== null && max < min) return fail("Maximum cannot be lower than minimum.");

  const { error } = await supabase
    .from("reorder_levels")
    .upsert({ item_id: itemId.data, location_id: loc.id, min_qty: min, max_qty: max }, { onConflict: "item_id,location_id" });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/stock");
  return { ok: true, message: "Saved." };
}
