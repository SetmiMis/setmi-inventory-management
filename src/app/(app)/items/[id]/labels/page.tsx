import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidEan13 } from "@/lib/barcode/ean13";
import { LABEL_PRESETS, findPreset, labelPrintCss } from "@/lib/barcode/label-presets";
import { BarcodeLabel } from "@/components/barcode-label";
import { inputClass, secondaryButton } from "@/lib/ui";
import { PrintButton } from "./print-button";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const clampInt = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("items.view");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const sp = await searchParams;

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("items")
    .select("id, internal_item_code, selling_item_name, item_barcodes(barcode, is_generated)")
    .eq("id", id.data)
    .maybeSingle();
  if (!item) notFound();

  // Only barcodes that are valid EAN-13 can be drawn here. Generated one first.
  const drawable = ([...(item.item_barcodes ?? [])] as { barcode: string; is_generated: boolean }[])
    .filter((b) => isValidEan13(b.barcode))
    .sort((a, b) => Number(b.is_generated) - Number(a.is_generated));
  const chosen = drawable.find((b) => b.barcode === first(sp.barcode)) ?? drawable[0];

  const preset = findPreset(first(sp.size));
  const copies = clampInt(first(sp.copies), 1, 200, 1);

  if (!chosen) {
    return (
      <main className="space-y-3">
        <p className="text-sm">
          <Link href={`/items/${item.id}`} className="text-blue-700 underline">Back to item</Link>
        </p>
        <p role="status" className="rounded border border-amber-500 p-3 text-sm">
          This item has no printable (EAN-13) barcode yet. Open the item and press &quot;Generate barcode&quot;.
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-4">
      <style>{labelPrintCss(preset)}</style>

      <div className="space-y-3 print:hidden">
        <p className="text-sm">
          <Link href={`/items/${item.id}`} className="text-blue-700 underline">Back to item</Link> / Labels
        </p>
        <h1 className="text-xl font-semibold">Print barcode labels</h1>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Label size
            <select name="size" defaultValue={preset.key} className={inputClass}>
              {LABEL_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Copies
            <input name="copies" type="number" min={1} max={200} defaultValue={copies} className={`${inputClass} w-24`} />
          </label>
          {drawable.length > 1 && (
            <label className="text-sm">
              Barcode
              <select name="barcode" defaultValue={chosen.barcode} className={inputClass}>
                {drawable.map((b) => (
                  <option key={b.barcode} value={b.barcode}>{b.barcode}{b.is_generated ? " (generated)" : ""}</option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className={secondaryButton}>Update preview</button>
          <PrintButton />
        </form>
        <p className="text-xs text-neutral-500">
          In the print window choose your label printer, set margins to &quot;None&quot; and scale to 100%.
          Print one label first and scan it before printing a full roll. Scan the PRINTED label, not the
          screen: simple scanners often cannot read a barcode shown on a monitor.
        </p>
      </div>

      <div className={preset.mode === "sheet" ? "flex flex-wrap" : "flex flex-wrap gap-2 print:gap-0"}>
        {Array.from({ length: copies }, (_, i) => (
          <BarcodeLabel key={i} name={item.selling_item_name} code={chosen.barcode} preset={preset} />
        ))}
      </div>
    </main>
  );
}
