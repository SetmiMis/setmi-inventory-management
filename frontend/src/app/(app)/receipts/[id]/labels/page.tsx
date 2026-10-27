import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAnyPermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidEan13 } from "@/lib/barcode/ean13";
import { LABEL_PRESETS, findPreset, labelPrintCss } from "@/lib/barcode/label-presets";
import { BarcodeLabel } from "@/components/barcode-label";
import { PrintButton } from "@/app/(app)/items/[id]/labels/print-button";
import { inputClass, secondaryButton } from "@/lib/ui";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MAX_PER_ITEM = 200;
const MAX_TOTAL = 600;

type LineRow = {
  quantity: number;
  items: { internal_item_code: string; selling_item_name: string; unit: string; item_barcodes: { barcode: string; is_generated: boolean }[] } | null;
};

// One sticker per received piece, so every piece that arrives can be labelled in one print job.
// Only whole-number units with a valid EAN-13 barcode get labels; the rest are listed as skipped.
export default async function ReceiptLabelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  await requireAnyPermission("receipts.view", "receipts.create", "receipts.post");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const preset = findPreset(first((await searchParams).size));

  const supabase = await createClient();
  const { data: r } = await supabase.from("goods_receipts").select("id, receipt_no, status").eq("id", id.data).maybeSingle();
  if (!r) notFound();
  const { data } = await supabase
    .from("goods_receipt_lines")
    .select("quantity, items(internal_item_code, selling_item_name, unit, item_barcodes(barcode, is_generated))")
    .eq("receipt_id", r.id).order("id");
  const lines = (data ?? []) as unknown as LineRow[];
  const { data: units } = await supabase.from("units").select("code, decimals");
  const dec = new Map((units ?? []).map((u) => [u.code, u.decimals]));

  const labels: { key: string; name: string; code: string }[] = [];
  const skipped: string[] = [];
  let capped = false;
  for (const l of lines) {
    const it = l.items;
    if (!it) continue;
    const bc = [...(it.item_barcodes ?? [])].filter((b) => isValidEan13(b.barcode)).sort((a, b) => Number(b.is_generated) - Number(a.is_generated))[0];
    if (!bc) { skipped.push(`${it.internal_item_code} (no EAN-13 barcode yet)`); continue; }
    if ((dec.get(it.unit) ?? 0) > 0) { skipped.push(`${it.internal_item_code} (sold by ${it.unit}: label the roll or box by hand)`); continue; }
    let n = Math.min(Math.floor(Number(l.quantity)), MAX_PER_ITEM);
    if (n < Number(l.quantity)) capped = true;
    for (let i = 0; i < n && labels.length < MAX_TOTAL; i++) labels.push({ key: `${bc.barcode}-${i}`, name: it.selling_item_name, code: bc.barcode });
    if (labels.length >= MAX_TOTAL) { capped = true; n = 0; }
  }

  return (
    <main className="space-y-4">
      <style>{labelPrintCss(preset)}</style>
      <div className="space-y-3 print:hidden">
        <p className="text-sm"><Link href={`/receipts/${r.id}`} className="text-blue-700 underline">Back to {r.receipt_no}</Link> / Labels</p>
        <h1 className="text-xl font-semibold">Labels for {r.receipt_no}</h1>
        {r.status !== "POSTED" && <p role="status" className="rounded border border-amber-500 p-2 text-sm">This receipt is not posted yet. Labels are shown for planning only.</p>}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Label size
            <select name="size" defaultValue={preset.key} className={inputClass}>
              {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <button type="submit" className={secondaryButton}>Update preview</button>
          <PrintButton />
        </form>
        <p className="text-sm">{labels.length} label{labels.length === 1 ? "" : "s"} ready (one per piece, up to {MAX_PER_ITEM} per item and {MAX_TOTAL} in total).{capped ? " Some items were capped: print the rest separately." : ""}</p>
        {skipped.length > 0 && <p className="text-sm text-neutral-500">No label for: {skipped.join("; ")}.</p>}
        <p className="text-xs text-neutral-500">Print one label first and scan it before printing the whole job. Scan the printed label, not the screen.</p>
      </div>
      <div className={preset.mode === "sheet" ? "flex flex-wrap" : "flex flex-wrap gap-2 print:gap-0"}>
        {labels.map((l) => <BarcodeLabel key={l.key} name={l.name} code={l.code} preset={preset} />)}
      </div>
    </main>
  );
}
