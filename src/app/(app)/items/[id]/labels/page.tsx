import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidEan13 } from "@/lib/barcode/ean13";
import { Ean13Barcode } from "@/components/ean13-barcode";
import { inputClass, secondaryButton } from "@/lib/ui";
import { PrintButton } from "./print-button";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const clampInt = (raw: string | undefined, min: number, max: number, fallback: number) => {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

// Label sizes are the printer's decision, so they are choices, not fixed. Default: a common
// 50 x 25 mm thermal label. "sheet" mode lays labels out on an A4 page for a normal printer.
const PRESETS = [
  { key: "50x25", label: "Thermal 50 x 25 mm", w: 50, h: 25, mode: "thermal" },
  { key: "38x25", label: "Thermal 38 x 25 mm", w: 38, h: 25, mode: "thermal" },
  { key: "60x40", label: "Thermal 60 x 40 mm", w: 60, h: 40, mode: "thermal" },
  { key: "a4-65", label: "A4 sheet, 65 labels (38 x 21 mm)", w: 38, h: 21, mode: "sheet" },
  { key: "a4-24", label: "A4 sheet, 24 labels (70 x 37 mm)", w: 70, h: 37, mode: "sheet" },
] as const;

const PAD_MM = 1.5; // blank border inside each label
const NAME_MM = 5.5; // height reserved for the item name

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

  const preset = PRESETS.find((p) => p.key === first(sp.size)) ?? PRESETS[0];
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

  // Bar height is chosen so the picture fills the free space of THIS label size. That keeps each
  // bar wide enough for scanners (EAN-13 should print at 80% or more of its nominal size, i.e. at
  // least 0.26 mm per module) instead of squeezing the bars to fit the height.
  const innerW = preset.w - PAD_MM * 2;
  const innerH = preset.h - PAD_MM * 2 - NAME_MM;
  const barHeight = Math.min(60, Math.max(22, Math.round((innerH * 113) / innerW) - 12));

  // Numbers only (validated above), so safe to place in CSS.
  const css =
    preset.mode === "thermal"
      ? `@media print { @page { size: ${preset.w}mm ${preset.h}mm; margin: 0; } .label { break-after: page; } }`
      : `@media print { @page { size: A4; margin: 8mm; } }`;

  return (
    <main className="space-y-4">
      <style>{css}</style>

      <div className="space-y-3 print:hidden">
        <p className="text-sm">
          <Link href={`/items/${item.id}`} className="text-blue-700 underline">Back to item</Link> / Labels
        </p>
        <h1 className="text-xl font-semibold">Print barcode labels</h1>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Label size
            <select name="size" defaultValue={preset.key} className={inputClass}>
              {PRESETS.map((p) => (
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
          <div
            key={i}
            className="label overflow-hidden bg-white text-black"
            style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, boxSizing: "border-box", padding: `${PAD_MM}mm`, border: "0.1mm dashed #bbb" }}
          >
            <div style={{ fontSize: "6.5pt", lineHeight: 1.1, height: `${NAME_MM}mm`, overflow: "hidden", fontWeight: 600 }}>
              {item.selling_item_name}
            </div>
            <div style={{ height: `${innerH}mm` }}>
              <Ean13Barcode code={chosen.barcode} barHeight={barHeight} fill />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
