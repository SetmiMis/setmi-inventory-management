import { Ean13Barcode } from "@/components/ean13-barcode";
import { LABEL_NAME_MM, LABEL_PAD_MM, labelBarHeight, type LabelPreset } from "@/lib/barcode/label-presets";

// One sticker: the name that is printed on bills, then the barcode with its digits.
export function BarcodeLabel({ name, code, preset }: { name: string; code: string; preset: LabelPreset }) {
  const innerH = preset.h - LABEL_PAD_MM * 2 - LABEL_NAME_MM;
  return (
    <div
      className="label overflow-hidden bg-white text-black"
      style={{ width: `${preset.w}mm`, height: `${preset.h}mm`, boxSizing: "border-box", padding: `${LABEL_PAD_MM}mm`, border: "0.1mm dashed #bbb" }}
    >
      <div style={{ fontSize: "6.5pt", lineHeight: 1.1, height: `${LABEL_NAME_MM}mm`, overflow: "hidden", fontWeight: 600 }}>{name}</div>
      <div style={{ height: `${innerH}mm` }}>
        <Ean13Barcode code={code} barHeight={labelBarHeight(preset)} fill />
      </div>
    </div>
  );
}
