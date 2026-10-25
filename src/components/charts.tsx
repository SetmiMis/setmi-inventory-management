"use client";

import { motion, MotionConfig } from "motion/react";
import { useState } from "react";

// Hand-made SVG charts (no chart library), following the dashboard data-viz rules:
// one series = one colour (the brand), thin columns (max 24px) with a 4px rounded top and square base,
// hairline gridlines, text in text colours (never the series colour), a hover/focus tooltip on every
// column, and a table view so no value depends on hovering.

export type ColumnPoint = { key: string; label: string; value: number; detail?: string };

const compact = (n: number, money: boolean) => {
  const p = money ? "₹" : "";
  if (n >= 10000000) return `${p}${(n / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (n >= 100000) return `${p}${(n / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `${p}${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${p}${Math.round(n)}`;
};
const full = (n: number, money: boolean) =>
  (money ? "₹" : "") + n.toLocaleString("en-IN", { minimumFractionDigits: money ? 2 : 0, maximumFractionDigits: money ? 2 : 3 });

// A "nice" top for the axis: 1, 2, 2.5 or 5 times a power of ten.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function columnPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  const r = Math.min(4, h, w / 2);
  return `M${x},${base} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${base} Z`;
}

export function ColumnChart({
  data, money = false, ariaLabel, tableLabel, valueLabel, emptyText,
}: {
  data: ColumnPoint[];
  money?: boolean;
  ariaLabel: string;
  tableLabel: string;
  valueLabel: string;
  emptyText: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640, H = 230, L = 52, R = 8, T = 12, B = 28;
  const plotW = W - L - R, plotH = H - T - B, base = T + plotH;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = data.length ? plotW / data.length : plotW;
  const colW = Math.max(2, Math.min(24, band * 0.6));
  const every = Math.max(1, Math.ceil(data.length / 8));
  const y = (v: number) => base - (v / max) * plotH;
  const allZero = data.every((d) => d.value === 0);

  return (
    <div className="space-y-2">
      <div className="relative">
        <MotionConfig reducedMotion="user">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth={1} />
                <text x={L - 6} y={y(max * f)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {compact(max * f, money)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = L + band * i + band / 2;
              const x = cx - colW / 2;
              return (
                <g key={d.key}>
                  {d.value > 0 && (
                    <motion.path
                      d={columnPath(x, y(d.value), colW, base)}
                      fill="var(--brand)"
                      opacity={active === null || active === i ? 1 : 0.55}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.5, delay: Math.min(i * 0.02, 0.4), ease: "easeOut" }}
                      style={{ transformOrigin: "bottom", transformBox: "fill-box" }}
                    />
                  )}
                  {i % every === 0 && (
                    <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{d.label}</text>
                  )}
                  {/* The hit area is the whole band, bigger than the column. */}
                  <rect
                    x={L + band * i} y={T} width={band} height={plotH} fill="transparent"
                    tabIndex={0} role="button" aria-label={`${d.label}: ${full(d.value, money)}${d.detail ? `, ${d.detail}` : ""}`}
                    onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                    style={{ outline: "none", cursor: "default" }}
                  />
                </g>
              );
            })}
            <line x1={L} x2={W - R} y1={base} y2={base} stroke="var(--muted)" strokeOpacity={0.5} strokeWidth={1} />
          </svg>
        </MotionConfig>
        {active !== null && data[active] && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{ left: `${((L + band * active + band / 2) / W) * 100}%` }}
          >
            <p className="font-semibold">{full(data[active].value, money)}</p>
            <p className="text-xs text-muted">{data[active].label}{data[active].detail ? ` · ${data[active].detail}` : ""}</p>
          </div>
        )}
        {allZero && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">{emptyText}</p>}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{tableLabel}</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">{valueLabel}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b border-line">
                <td>{d.label}</td>
                <td className="text-right font-mono">{full(d.value, money)}</td>
                <td className="text-right text-muted">{d.detail ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export type BarRow = { key: string; label: string; sub?: string; value: number; display?: string };

// Horizontal bars: one row per thing, the value written at the end of each bar.
export function BarList({ rows, money = false, emptyText }: { rows: BarRow[]; money?: boolean; emptyText: string }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0 || max === 0) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>;
  return (
    <MotionConfig reducedMotion="user">
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium">{r.label}</span>
                {r.sub && <span className="ml-1.5 text-xs text-muted">{r.sub}</span>}
              </span>
              <span className="shrink-0 font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{r.display ?? full(r.value, money)}</span>
            </div>
            <div className="h-2.5 w-full">
              <motion.div
                className="h-2.5 rounded-r-[4px] bg-brand transition-opacity group-hover:opacity-80"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
                transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </MotionConfig>
  );
}
