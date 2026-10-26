"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

export type QcState = { ok: boolean; message: string } | null;
const fail = (message: string): QcState => ({ ok: false, message });

// Start a quality check on a posted receipt. Needs qc.manage; the database checks it again.
export async function startQualityCheck(fd: FormData): Promise<void> {
  await requirePermission("qc.manage");
  const id = z.uuid().safeParse(fd.get("receiptId"));
  if (!id.success) redirect("/quality-check?new=1");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_quality_check", { p_receipt_id: id.data });
  if (error) redirect(`/quality-check?new=1&err=${encodeURIComponent(friendlyDbError(error))}`);
  revalidatePath("/quality-check");
  redirect(`/quality-check?sel=${(data as { id: string }).id}&inspect=1`);
}

const num = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" ? Number(v) : 0);

// Save the results. Form fields per receipt line: passed_<id>, rejected_<id>, rework_<id>, reason_<id>.
export async function saveQualityResults(_prev: QcState, fd: FormData): Promise<QcState> {
  await requirePermission("qc.manage");
  const id = z.uuid().safeParse(fd.get("id"));
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the QC date.").safeParse(fd.get("date"));
  if (!id.success) return fail("Invalid form data.");
  if (!date.success) return fail(date.error.issues[0].message);
  const remarks = typeof fd.get("remarks") === "string" ? (fd.get("remarks") as string).trim() : "";
  if (remarks.length > 1000) return fail("Remarks are too long (max 1000).");

  const lineIds = new Set<number>();
  for (const key of fd.keys()) {
    const m = /^passed_(\d+)$/.exec(key);
    if (m) lineIds.add(Number(m[1]));
  }
  if (lineIds.size === 0) return fail("There are no items to check.");
  const lines = [...lineIds].map((lid) => {
    const reason = fd.get(`reason_${lid}`);
    return { receipt_line_id: lid, passed: num(fd.get(`passed_${lid}`)), rejected: num(fd.get(`rejected_${lid}`)), rework: num(fd.get(`rework_${lid}`)), reason: typeof reason === "string" ? reason.trim().slice(0, 200) : null };
  });
  if (lines.some((l) => !Number.isFinite(l.passed) || !Number.isFinite(l.rejected) || !Number.isFinite(l.rework))) return fail("A quantity is not a number.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_quality_check_results", { p_id: id.data, p_date: date.data, p_remarks: remarks || null, p_lines: lines });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/quality-check");
  redirect(`/quality-check?sel=${id.data}`);
}
