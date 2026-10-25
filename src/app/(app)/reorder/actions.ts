"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

const schema = z.object({
  locationId: z.uuid(),
  supplierId: z.uuid("Choose a supplier."),
  lines: z.array(z.object({ itemId: z.uuid(), quantity: z.number().gt(0).max(99999999) })).min(1, "Tick at least one item.").max(500),
});

// Turns the ticked reorder suggestions into ONE draft purchase order for one supplier and one place.
// Nothing is sent: the draft opens so the buyer can check quantities and prices, then send it.
// The database function checks purchase.create, the place, the items and the quantities again.
export async function createDraftPoFromReorder(input: unknown): Promise<{ ok: false; message: string }> {
  await requirePermission("purchase.create");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_purchase_order", {
    p_id: null,
    p_header: { supplier_id: v.supplierId, location_id: v.locationId, notes: "Made from the reorder list" },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity, unit_cost: null })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; id?: string; errors?: { code?: string; message: string }[] };
  if (!d.ok || !d.id) {
    const first = d.errors?.[0];
    return { ok: false, message: first ? `${first.code ?? ""} ${first.message}`.trim() : "The order was not created." };
  }
  redirect(`/purchase-orders/${d.id}`);
}
