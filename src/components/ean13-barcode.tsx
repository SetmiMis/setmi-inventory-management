import { QUIET_LEFT, TOTAL_MODULES, blackRuns, ean13Modules } from "@/lib/barcode/ean13";

// Draws an EAN-13 barcode as SVG (sharp at any printer resolution, no image files).
// Units are barcode modules, so the SVG scales to whatever width the parent gives it.
// Throws for a number that is not a valid EAN-13, so a wrong barcode is never printed.
// With `fill`, the SVG fits inside its parent box (parent must have a height) and keeps its shape.
export function Ean13Barcode({ code, barHeight = 42, fill = false }: { code: string; barHeight?: number; fill?: boolean }) {
  const runs = blackRuns(ean13Modules(code));
  const textY = barHeight + 9;
  const total = barHeight + 12;

  return (
    <svg
      viewBox={`0 0 ${TOTAL_MODULES} ${total}`}
      width="100%"
      height={fill ? "100%" : undefined}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Barcode ${code}`}
      shapeRendering="crispEdges"
      style={{ display: "block" }}
    >
      <rect x="0" y="0" width={TOTAL_MODULES} height={total} fill="#fff" />
      {runs.map((r) => (
        <rect key={r.start} x={QUIET_LEFT + r.start} y={0} width={r.width} height={barHeight} fill="#000" />
      ))}
      <g fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fill="#000" textAnchor="middle">
        <text x={QUIET_LEFT - 5} y={textY}>{code[0]}</text>
        <text x={QUIET_LEFT + 24} y={textY} letterSpacing="1.6">{code.slice(1, 7)}</text>
        <text x={QUIET_LEFT + 71} y={textY} letterSpacing="1.6">{code.slice(7)}</text>
      </g>
    </svg>
  );
}
