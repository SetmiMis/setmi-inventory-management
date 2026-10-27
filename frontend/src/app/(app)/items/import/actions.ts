"use server";

import { revalidatePath } from "next/cache";
import { readSheet } from "read-excel-file/node";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { MAX_IMPORT_ROWS, parseItemSheet, type ImportRow } from "@/lib/import/items-sheet";

// Two steps, same as docs/features/FEATURE-002-EXCEL-IMPORT.md:
//   previewImport: read the Excel file, ask the database to check every row, save NOTHING.
//   commitImport : check everything again and create the items in one database transaction.
// Both need items.import; the database function checks that permission again.

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_SHEET_ROWS = 5000; // raw rows read from the sheet, before empty ones are skipped

export type RowProblem = { row: number; field: string; message: string };
export type CheckResult = {
  total: number;
  valid: number;
  errors: RowProblem[];
  newCategories: string[];
};
export type PreviewState =
  | { ok: false; message: string }
  | {
      ok: true;
      fileName: string;
      rows: ImportRow[];
      skippedEmpty: number;
      ignoredColumns: string[];
      tooManyRows: boolean;
      check: CheckResult;
    }
  | null;

function toCheck(data: unknown): CheckResult {
  const d = data as { total: number; valid: number; errors: RowProblem[]; new_categories: string[] };
  return { total: d.total, valid: d.valid, errors: d.errors ?? [], newCategories: d.new_categories ?? [] };
}

export async function previewImport(_prev: PreviewState, fd: FormData): Promise<PreviewState> {
  await requirePermission("items.import");

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an .xlsx file first." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "The file is larger than 3 MB." };

  const bytes = Buffer.from(await file.arrayBuffer());
  // Real .xlsx files are ZIP archives and start with "PK\x03\x04". The name alone proves nothing.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return { ok: false, message: "This is not an .xlsx file. In Google Sheets use File > Download > Microsoft Excel (.xlsx)." };
  }

  let sheet: unknown[][];
  try {
    sheet = (await readSheet(bytes)) as unknown[][]; // first sheet only
  } catch {
    return { ok: false, message: "The Excel file could not be read. Save it again as .xlsx and retry." };
  }
  if (sheet.length > MAX_SHEET_ROWS) {
    return { ok: false, message: `The sheet has more than ${MAX_SHEET_ROWS} rows. Remove empty rows or split the file.` };
  }

  const parsed = parseItemSheet(sheet);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_items", {
    p_rows: parsed.rows,
    p_dry_run: true,
    p_skip_invalid: true,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };

  return {
    ok: true,
    fileName: file.name.slice(0, 120),
    rows: parsed.rows,
    skippedEmpty: parsed.skippedEmpty,
    ignoredColumns: parsed.ignoredColumns,
    tooManyRows: parsed.tooManyRows,
    check: toCheck(data),
  };
}

// The browser sends the rows back, so they are treated as untrusted and validated again.
const rowSchema = z.object({
  row: z.number().int().min(1).max(1_000_000),
  internal_item_code: z.string().max(300),
  import_item_code: z.string().max(300),
  item_name: z.string().max(500),
  selling_item_name: z.string().max(500),
  category: z.string().max(300),
  purchase_source: z.string().max(50),
  remarks: z.string().max(5000),
  barcodes: z.array(z.string().max(200)).max(50),
});
const commitSchema = z.object({
  rows: z.array(rowSchema).min(1).max(MAX_IMPORT_ROWS),
  skipInvalid: z.boolean(),
  generateBarcodes: z.boolean(),
});

export type CommitResult =
  | { ok: false; message: string; errors?: RowProblem[] }
  | { ok: true; created: number; skipped: number; categoriesCreated: number };

export async function commitImport(input: unknown): Promise<CommitResult> {
  await requirePermission("items.import");

  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid import data. Please upload the file again." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_items", {
    p_rows: v.rows,
    p_dry_run: false,
    p_skip_invalid: v.skipInvalid,
    p_generate_barcodes: v.generateBarcodes,
  });
  if (error) return { ok: false, message: friendlyDbError(error) };

  const d = data as {
    ok: boolean;
    created: number;
    skipped?: number;
    categories_created?: number;
    errors?: RowProblem[];
  };
  if (!d.ok && d.created === 0) {
    return { ok: false, message: "Nothing was imported because some rows have problems.", errors: d.errors };
  }

  revalidatePath("/items");
  return { ok: true, created: d.created, skipped: d.skipped ?? 0, categoriesCreated: d.categories_created ?? 0 };
}
