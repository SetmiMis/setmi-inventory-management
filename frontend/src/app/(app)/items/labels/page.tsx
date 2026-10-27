import Link from "next/link";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidEan13 } from "@/lib/barcode/ean13";
import { LABEL_PRESETS, findPreset, labelPrintCss } from "@/lib/barcode/label-presets";
import { BarcodeLabel } from "@/components/barcode-label";
import { inputClass, secondaryButton } from "@/lib/ui";
import { PrintButton } from "../[id]/labels/print-button";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Barcode labels for several products at once (ticked in the product list). One label per product per copy.
export default async function BulkLabelsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission("items.view");
  const sp = await searchParams;
  const ids = [...new Set((first(sp.ids) ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 100);
  const valid = ids.filter((id) => z.uuid().safeParse(id).success);
  const preset = findPreset(first(sp.size));
  const copiesRaw = parseInt(first(sp.copies) ?? "", 10);
  const copies = Number.isFinite(copiesRaw) ? Math.min(Math.max(copiesRaw, 1), 20) : 1;

  const supabase = await createClient();
  const { data } = valid.length
    ? await supabase.from("items").select("id, internal_item_code, selling_item_name, item_barcodes(barcode, is_generated)").in("id", valid).order("internal_item_code")
    : { data: [] };

  const labels: { id: string; name: string; code: string }[] = [];
  const skipped: string[] = [];
  for (const it of data ?? []) {
    const drawable = ([...(it.item_barcodes ?? [])] as { barcode: string; is_generated: boolean }[])
      .filter((b) => isValidEan13(b.barcode))
      .sort((a, b) => Number(b.is_generated) - Number(a.is_generated))[0];
    if (drawable) labels.push({ id: it.id, name: it.selling_item_name, code: drawable.barcode });
    else skipped.push(it.internal_item_code);
  }

  return (
    <main className="space-y-4">
      <style>{labelPrintCss(preset)}</style>
      <div className="space-y-3 print:hidden">
        <p className="text-sm"><Link href="/items" className="text-blue-700 underline">Products / SKU</Link> / Labels</p>
        <h1 className="text-xl font-semibold">Print barcode labels ({labels.length} product{labels.length === 1 ? "" : "s"})</h1>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="ids" value={valid.join(",")} />
          <label className="text-sm">Label size
            <select name="size" defaultValue={preset.key} className={inputClass}>
              {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-sm">Copies of each
            <input name="copies" type="number" min={1} max={20} defaultValue={copies} className={`${inputClass} w-24`} />
          </label>
          <button type="submit" className={secondaryButton}>Update preview</button>
          <PrintButton />
        </form>
        {skipped.length > 0 && (
          <p role="status" className="rounded border border-amber-500 p-3 text-sm">
            No printable (EAN-13) barcode yet, so no label for: {skipped.join(", ")}. Open the product and press &quot;Generate barcode&quot;.
          </p>
        )}
        {valid.length === 0 && <p className="text-sm text-muted">No product chosen. Tick products in the list, then press Print labels.</p>}
        <p className="text-xs text-neutral-500">Print one label first and scan it before printing a full roll.</p>
      </div>
      <div className={preset.mode === "sheet" ? "flex flex-wrap" : "flex flex-wrap gap-2 print:gap-0"}>
        {labels.flatMap((l) => Array.from({ length: copies }, (_, i) => <BarcodeLabel key={`${l.id}-${i}`} name={l.name} code={l.code} preset={preset} />))}
      </div>
    </main>
  );
}

export const metadata = { title: "Print Labels" };
