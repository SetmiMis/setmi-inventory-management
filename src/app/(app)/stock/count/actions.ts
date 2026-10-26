"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { COUNT_REASONS } from "@/lib/validation/count";

export type CountState = { ok: boolean; message: string } | null;
const fail = (message: string): CountState => ({ ok: false, message });

// Make a count sheet for the place the person works in. The database freezes the system quantities on it.
export async function createCount(_prev: CountState, fd: FormData): Promise<CountState> {
  const user = await requirePermission("stock.adjust");
  const loc = await getCurrentLocation(user);
  if (!loc) return fail("You are not assigned to a warehouse or shop.");
  const type = z.enum(["FULL", "CYCLE", "LOCATION"]).safeParse(fd.get("countType"));
  if (!type.success) return fail("Choose the type of count.");
  const category = type.data === "CYCLE" ? z.uuid("Choose a category.").safeParse(fd.get("categoryId")) : null;
  if (category && !category.success) return fail("Choose a category.");
  const rack = type.data === "LOCATION" ? z.string().regex(/^[A-Z0-9]{1,6}$/, "Choose a rack.").safeParse(String(fd.get("rack") ?? "").toUpperCase()) : null;
  if (rack && !rack.success) return fail("Choose a rack.");
  const notes = String(fd.get("notes") ?? "").trim();
  if (notes.length > 500) return fail("Notes are too long (max 500).");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_physical_count", {
    p_header: { location_id: loc.id, count_type: type.data, category_id: category?.data ?? null, rack: rack?.data ?? null, notes: notes || null },
  });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/stock/count");
  redirect(`/stock/count?sel=${(data as { id: string }).id}&p=details`);
}

// Save the quantities typed so far (counted_<itemId> and reason_<itemId>); blank = not counted yet.
export async function saveCountProgress(_prev: CountState, fd: FormData): Promise<CountState> {
  await requirePermission("stock.adjust");
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return fail("Invalid form data.");
  const rows: { item_id: string; counted: number | null; reason: string | null }[] = [];
  for (const [key, raw] of fd.entries()) {
    const m = /^counted_([0-9a-f-]{36})$/.exec(key);
    if (!m || typeof raw !== "string") continue;
    const text = raw.trim();
    const n = text === "" ? null : Number(text);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return fail("A counted quantity is not valid.");
    const reason = String(fd.get(`reason_${m[1]}`) ?? "");
    rows.push({ item_id: m[1], counted: n, reason: (COUNT_REASONS as readonly string[]).includes(reason) ? reason : null });
  }
  const submit = fd.get("intent") === "submit";
  const supabase = await createClient();
  const saved = await supabase.rpc("save_physical_count_progress", { p_id: id.data, p_rows: rows });
  if (saved.error) return fail(friendlyDbError(saved.error));
  if (submit) {
    const sent = await supabase.rpc("submit_physical_count", { p_id: id.data });
    if (sent.error) return fail(`Saved, but not sent: ${friendlyDbError(sent.error)}`);
    revalidatePath("/stock");
    revalidatePath("/stock/count");
    redirect(`/stock/count?sel=${id.data}&p=details`);
  }
  const d = saved.data as { counted: number; total: number };
  revalidatePath("/stock/count");
  return { ok: true, message: `Saved. ${d.counted} of ${d.total} items counted.` };
}

// A manager approves a count (stock changes now) or sends it back; anybody with stock.adjust may cancel it before it is approved.
export async function decideCount(_prev: CountState, fd: FormData): Promise<CountState> {
  const id = z.uuid().safeParse(fd.get("id"));
  const decision = z.enum(["approve", "reject", "cancel"]).safeParse(fd.get("decision"));
  if (!id.success || !decision.success) return fail("Invalid form data.");
  await requirePermission(decision.data === "cancel" ? "stock.adjust" : "stock.approve");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);
  const supabase = await createClient();
  const { error } = decision.data === "approve" ? await supabase.rpc("approve_physical_count", { p_id: id.data, p_note: note || null })
    : decision.data === "reject" ? await supabase.rpc("reject_physical_count", { p_id: id.data, p_note: note })
    : await supabase.rpc("cancel_physical_count", { p_id: id.data });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/stock");
  revalidatePath("/stock/count");
  redirect(`/stock/count?sel=${id.data}&p=details`);
}
