"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAnyPermission, requirePermission } from "@/lib/auth";
import { getCurrentLocation } from "@/lib/location";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeSearch } from "@/lib/validation/item";

export type TransferItem = { id: string; code: string; name: string; unit: string; decimals: number };
export type Problem = { code: string; message: string };

const scanCodeSchema = z.string().trim().min(1).max(64).regex(/^[\x21-\x7e]+$/);

// Scan lookup for preparing (transfers.create) and for checking on arrival (transfers.receive).
// Exact match; an unknown barcode never creates anything.
export async function lookupTransferItem(input: { code: string }): Promise<{ ok: true; item: TransferItem } | { ok: false; message: string }> {
  await requireAnyPermission("transfers.create", "transfers.receive");
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

export async function searchTransferItems(input: { q: string }): Promise<TransferItem[]> {
  await requirePermission("transfers.create");
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

// "Fill from minimum levels": what the destination is missing, capped by what this place has.
export async function suggestLines(input: { toLocationId: string }): Promise<{ ok: true; lines: (TransferItem & { quantity: number })[] } | { ok: false; message: string }> {
  const user = await requirePermission("transfers.create");
  const loc = await getCurrentLocation(user);
  const to = z.uuid().safeParse(input?.toLocationId);
  if (!loc || !to.success) return { ok: false, message: "Choose the receiving place first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("suggest_transfer_lines", { p_from: loc.id, p_to: to.data });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const rows = (data ?? []) as { item_id: string; code: string; name: string; unit: string; decimals: number; suggested: number }[];
  return { ok: true, lines: rows.map((r) => ({ id: r.item_id, code: r.code, name: r.name, unit: r.unit, decimals: r.decimals, quantity: Number(r.suggested) })) };
}

const saveSchema = z.object({
  id: z.uuid().nullable(),
  toLocationId: z.uuid(),
  notes: z.string().trim().max(1000),
  lines: z.array(z.object({ itemId: z.uuid(), quantity: z.number().gt(0).max(99999999) })).min(1, "Add at least one item.").max(500),
});

export type SaveTransferResult = { ok: true; id: string; transferNo: string } | { ok: false; message: string; problems?: Problem[] };

// Saves a DRAFT (no stock change). A new transfer starts from the user's current working location,
// chosen on the server; an existing draft keeps the place it already starts from.
export async function saveTransfer(input: unknown): Promise<SaveTransferResult> {
  const user = await requirePermission("transfers.create");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const supabase = await createClient();

  let fromId: string;
  if (v.id) {
    const { data: t } = await supabase.from("stock_transfers").select("from_location_id").eq("id", v.id).maybeSingle();
    if (!t) return { ok: false, message: "Transfer not found." };
    fromId = t.from_location_id;
  } else {
    const loc = await getCurrentLocation(user);
    if (!loc) return { ok: false, message: "You are not assigned to a warehouse or shop." };
    fromId = loc.id;
  }

  const { data, error } = await supabase.rpc("save_stock_transfer", {
    p_id: v.id,
    p_header: { from_location_id: fromId, to_location_id: v.toLocationId, notes: v.notes },
    p_lines: v.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; id?: string; transfer_no?: string; errors?: { code?: string; message: string }[] };
  if (!d.ok || !d.id) {
    return { ok: false, message: "The transfer was not saved because some lines have problems.", problems: (d.errors ?? []).map((e) => ({ code: e.code ?? "?", message: e.message })) };
  }
  revalidatePath("/transfers");
  revalidatePath(`/transfers/${d.id}`);
  return { ok: true, id: d.id, transferNo: d.transfer_no ?? "" };
}

export type StepResult = { ok: true; message: string } | { ok: false; message: string };
const idOnly = z.object({ id: z.uuid() });

async function step(fn: "send_stock_transfer" | "recall_stock_transfer" | "cancel_stock_transfer", input: unknown, perm: string[], done: (no: string) => string): Promise<StepResult> {
  await requireAnyPermission(...perm);
  const p = idOnly.safeParse(input);
  if (!p.success) return { ok: false, message: "Invalid transfer." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_id: p.data.id });
  if (error) return { ok: false, message: friendlyDbError(error) };
  revalidatePath("/transfers");
  revalidatePath(`/transfers/${p.data.id}`);
  revalidatePath("/stock");
  return { ok: true, message: done((data as { transfer_no: string }).transfer_no) };
}

// Goods leave the sending place and are "on the way". The database locks the transfer, so a
// double click or two people sending at once cannot take the stock out twice.
export const sendTransfer = async (input: { id: string }) => step("send_stock_transfer", input, ["transfers.send"], (n) => `${n} sent: the goods are on the way.`);
export const recallTransfer = async (input: { id: string }) => step("recall_stock_transfer", input, ["transfers.send"], (n) => `${n} recalled: the goods are back in your stock.`);
export const cancelTransfer = async (input: { id: string }) => step("cancel_stock_transfer", input, ["transfers.create", "transfers.send"], (n) => `${n} cancelled.`);

const receiveSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().max(1000),
  received: z.array(z.object({ itemId: z.uuid(), received: z.number().min(0).max(99999999) })).min(1).max(500),
});

export async function receiveTransfer(input: unknown): Promise<StepResult & { problems?: Problem[] }> {
  await requirePermission("transfers.receive");
  const p = receiveSchema.safeParse(input);
  if (!p.success) return { ok: false, message: "Please check the numbers." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_stock_transfer", {
    p_id: p.data.id,
    p_received: p.data.received.map((r) => ({ item_id: r.itemId, received: r.received })),
    p_note: p.data.note || null,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  const d = data as { ok: boolean; transfer_no?: string; shortage?: boolean; errors?: { code?: string; message: string }[] };
  if (!d.ok) {
    return { ok: false, message: "Nothing was received because of the problems below.", problems: (d.errors ?? []).map((e) => ({ code: e.code ?? "", message: e.message })) };
  }
  revalidatePath("/transfers");
  revalidatePath(`/transfers/${p.data.id}`);
  revalidatePath("/stock");
  return { ok: true, message: `${d.transfer_no} received${d.shortage ? " with a shortage (recorded)" : ""}.` };
}
