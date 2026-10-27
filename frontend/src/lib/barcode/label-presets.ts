// Label sizes are the printer's decision, so they are choices, not fixed. Default: a common
// 50 x 25 mm thermal label. "sheet" mode lays labels out on an A4 page for a normal printer.
export const LABEL_PRESETS = [
  { key: "50x25", label: "Thermal 50 x 25 mm", w: 50, h: 25, mode: "thermal" },
  { key: "38x25", label: "Thermal 38 x 25 mm", w: 38, h: 25, mode: "thermal" },
  { key: "60x40", label: "Thermal 60 x 40 mm", w: 60, h: 40, mode: "thermal" },
  { key: "a4-65", label: "A4 sheet, 65 labels (38 x 21 mm)", w: 38, h: 21, mode: "sheet" },
  { key: "a4-24", label: "A4 sheet, 24 labels (70 x 37 mm)", w: 70, h: 37, mode: "sheet" },
] as const;

export type LabelPreset = (typeof LABEL_PRESETS)[number];

export function findPreset(key: string | undefined): LabelPreset {
  return LABEL_PRESETS.find((p) => p.key === key) ?? LABEL_PRESETS[0];
}

export const LABEL_PAD_MM = 1.5; // blank border inside each label
export const LABEL_NAME_MM = 5.5; // height reserved for the item name

// CSS for the print dialog. Only numbers from the preset table go into it.
export function labelPrintCss(p: LabelPreset): string {
  return p.mode === "thermal"
    ? `@media print { @page { size: ${p.w}mm ${p.h}mm; margin: 0; } .label { break-after: page; } }`
    : `@media print { @page { size: A4; margin: 8mm; } }`;
}

// Bar height is chosen so the picture fills the free space of THIS label size, which keeps each
// bar wide enough for scanners (EAN-13 should print at 80% or more of its nominal size).
export function labelBarHeight(p: LabelPreset): number {
  const innerW = p.w - LABEL_PAD_MM * 2;
  const innerH = p.h - LABEL_PAD_MM * 2 - LABEL_NAME_MM;
  return Math.min(60, Math.max(22, Math.round((innerH * 113) / innerW) - 12));
}
