"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeSearch } from "@/lib/validation/item";
import { stockEntrySchema } from "@/lib/validation/stock-entry";

export type EntryItem = { id: string; code: string; name: string; unit: string; decimals: number };
export type Problem = { code: string; message: string };

const scanCodeSchema = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/);

// Scan: exact barcode match. An unknown barcode creates nothing.
export async function lookupEntryItem(input: { code: string }): Promise<{ ok: true; item: EntryItem } | { ok: false; message: string }> {
  await requirePermission("stock.entry");
  const code = scanCodeSchema.safeParse(input?.code);
  if (!code.success) return { ok: false, message: "That does not look like a barcode." };
  const supabase = await createClient();
  const { data: bc } = await supabase.from("item_barcodes").select("item_id").eq("barcode", code.data).maybeSingle();
  if (!bc) return { ok: false, message: `Unknown barcode ${code.data}` };
  const { data: it } = await supabase.from("items").select("id, internal_item_code, item_name, unit, is_active").eq("id", bc.item_id).maybeSingle();
  if (!it) return { ok: false, message: "You cannot see this item." };
  if (!it.is_active) return { ok: false, message: `${it.internal_item_code} is archived` };
  const { data: u } = await supabase.from("units").select("decimals").eq("code", it.unit).maybeSingle();
  return { ok: true, item: { id: it.id, code: it.internal_item_code, name: it.item_name, unit: it.unit, decimals: u?.decimals ?? 0 } };
}

export async function searchEntryItems(input: { q: string }): Promise<EntryItem[]> {
  await requirePermission("stock.entry");
  const q = sanitizeSearch(String(input?.q ?? ""));
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const supabase = await createClient();
  const [{ data }, { data: units }] = await Promise.all([
    supabase.from("items").select("id, internal_item_code, item_name, unit")
      .eq("is_active", true).or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like}`)
      .order("internal_item_code").limit(10),
    supabase.from("units").select("code, decimals"),
  ]);
  const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));
  return (data ?? []).map((i) => ({ id: i.id, code: i.internal_item_code, name: i.item_name, unit: i.unit, decimals: dec.get(i.unit) ?? 0 }));
}

export type SaveEntryResult = { ok: true; entryNo: string } | { ok: false; message: string; problems?: Problem[] };

// Saves and applies the entry at once (stock changes now). The place is the user's working place,
// chosen on the server. The database checks permission, place, quantities and stock again.
export async function saveStockEntry(input: unknown): Promise<SaveEntryResult> {
  const user = await requirePermission("stock.entry");
  const parsed = stockEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const loc = await getCurrentLocation(user);
  if (!loc) return { ok: false, message: "You are not assigned to a warehouse or shop." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_stock_entry", {
    p_header: { location_id: loc.id, direction: v.direction, reason: v.reason, reference: v.reference, remarks: v.remarks },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; entry_no?: string; errors?: { code?: string; message: string }[] };
  if (!d.ok) {
    return { ok: false, message: "Nothing was saved because some lines have problems.", problems: (d.errors ?? []).map((e) => ({ code: e.code ?? "?", message: e.message })) };
  }
  revalidatePath("/stock");
  revalidatePath("/stock/entry");
  return { ok: true, entryNo: d.entry_no ?? "" };
}
