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

  return runCount(loc, rows, reason, kind);
}

// Shared by the count sheet and the scan-count screen: one call to the database function.
async function runCount(
  loc: { id: string; name: string },
  rows: { item_id: string; counted: number }[],
  reason: string,
  kind: "OPENING" | "ADJUSTMENT",
): Promise<StockState> {
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

// ---------- counting by scanning barcodes ----------
// The scan screen asks the server what a scanned barcode is. Exact match only; an unknown
// barcode never creates anything.
export type ScanLookup =
  | { ok: true; item: { id: string; code: string; name: string; unit: string; decimals: number; current: number | null } }
  | { ok: false; message: string };

const scanCodeSchema = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/, "Not a barcode");

export async function lookupBarcode(input: { code: string }): Promise<ScanLookup> {
  const user = await requirePermission("stock.adjust");
  const loc = await getCurrentLocation(user);
  if (!loc) return { ok: false, message: "You are not assigned to a warehouse or shop." };
  const code = scanCodeSchema.safeParse(input?.code);
  if (!code.success) return { ok: false, message: "That does not look like a barcode." };

  const supabase = await createClient();
  const { data: bc } = await supabase.from("item_barcodes").select("item_id").eq("barcode", code.data).maybeSingle();
  if (!bc) return { ok: false, message: `Unknown barcode ${code.data}` };

  const { data: item } = await supabase
    .from("items")
    .select("id, internal_item_code, item_name, unit, is_active")
    .eq("id", bc.item_id)
    .maybeSingle();
  if (!item) return { ok: false, message: "You cannot see this item." };
  if (!item.is_active) return { ok: false, message: `${item.internal_item_code} is archived` };

  const [{ data: unit }, { data: bal }] = await Promise.all([
    supabase.from("units").select("decimals").eq("code", item.unit).maybeSingle(),
    supabase.from("stock_balances").select("quantity").eq("item_id", item.id).eq("location_id", loc.id).maybeSingle(),
  ]);
  return {
    ok: true,
    item: {
      id: item.id,
      code: item.internal_item_code,
      name: item.item_name,
      unit: item.unit,
      decimals: unit?.decimals ?? 0,
      current: bal ? Number(bal.quantity) : 0,
    },
  };
}

const scanSaveSchema = z.object({
  rows: z.array(z.object({ itemId: z.uuid(), counted: z.number().min(0).max(99999999) })).min(1).max(COUNT_MAX_ROWS),
  reason: z.string().trim().max(300),
  opening: z.boolean(),
});

export async function saveScanCount(input: unknown): Promise<StockState> {
  const user = await requirePermission("stock.adjust");
  const loc = await getCurrentLocation(user);
  if (!loc) return fail("You are not assigned to a warehouse or shop.");
  const parsed = scanSaveSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid data. Please check the numbers.");
  const v = parsed.data;
  const kind = v.opening ? "OPENING" : "ADJUSTMENT";
  if (kind === "ADJUSTMENT" && v.reason.length < 3) return fail("Please write a reason (at least 3 letters).");

  return runCount(loc, v.rows.map((r) => ({ item_id: r.itemId, counted: r.counted })), v.reason, kind);
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
