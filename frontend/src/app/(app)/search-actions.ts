"use server";

import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeSearch } from "@/lib/validation/item";

export type FoundItem = { id: string; code: string; name: string; unit: string; active: boolean };

// Global search box (Ctrl+K): finds items by code, name, selling name or barcode.
// Needs items.view; the database applies the same row rules as the Items screen.
export async function searchItemsForPalette(input: { q: string }): Promise<FoundItem[]> {
  await requirePermission("items.view");
  const q = sanitizeSearch(String(input?.q ?? ""));
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const supabase = await createClient();

  // An exact barcode (a scanner types it and presses Enter) goes to the top of the list.
  const [{ data: byCode }, { data: bc }] = await Promise.all([
    supabase
      .from("items")
      .select("id, internal_item_code, item_name, unit, is_active")
      .or(`internal_item_code.ilike.${like},item_name.ilike.${like},selling_item_name.ilike.${like},import_item_code.ilike.${like}`)
      .order("is_active", { ascending: false })
      .order("internal_item_code")
      .limit(8),
    supabase.from("item_barcodes").select("item_id").eq("barcode", q).maybeSingle(),
  ]);
  const rows = byCode ?? [];
  if (bc && !rows.some((r) => r.id === bc.item_id)) {
    const { data: one } = await supabase.from("items").select("id, internal_item_code, item_name, unit, is_active").eq("id", bc.item_id).maybeSingle();
    if (one) rows.unshift(one);
  } else if (bc) {
    rows.sort((a, b) => (a.id === bc.item_id ? -1 : b.id === bc.item_id ? 1 : 0));
  }
  return rows.slice(0, 8).map((r) => ({ id: r.id, code: r.internal_item_code, name: r.item_name, unit: r.unit, active: r.is_active }));
}
