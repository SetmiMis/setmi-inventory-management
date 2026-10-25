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

// ---- Donut (ring) chart with the total in the middle and a legend beside it ----
export type DonutSegment = { key: string; label: string; value: number; color: string };

export function DonutChart({ segments, centerValue, centerLabel, ariaLabel }: {
  segments: DonutSegment[]; centerValue: string; centerLabel: string; ariaLabel: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
      <svg viewBox="0 0 180 180" role="img" aria-label={ariaLabel} className="h-44 w-44 shrink-0">
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--surface-muted)" strokeWidth="22" />
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * C;
          const el = (
            <circle
              key={s.key} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth="22"
              strokeDasharray={`${Math.max(len - (segments.filter((x) => x.value > 0).length > 1 ? 2 : 0), 0)} ${C}`}
              strokeDashoffset={-offset} transform="rotate(-90 90 90)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="90" y="88" textAnchor="middle" className="fill-[var(--foreground)] text-[26px] font-bold">{centerValue}</text>
        <text x="90" y="108" textAnchor="middle" className="fill-[var(--muted)] text-[11px]">{centerLabel}</text>
      </svg>
      <ul className="min-w-44 space-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-full" style={{ background: s.color }} /> {s.label}</span>
            <span className="font-semibold">
              {s.value.toLocaleString("en-IN")} <span className="font-normal text-muted">({total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Two series per day (stock in / stock out), thin paired columns ----
export type PairPoint = { key: string; label: string; a: number; b: number };

export function PairColumnChart({ data, aLabel, bLabel, aColor, bColor, ariaLabel, emptyText }: {
  data: PairPoint[]; aLabel: string; bLabel: string; aColor: string; bColor: string; ariaLabel: string; emptyText: string;
}) {
  const max = niceMax(Math.max(0, ...data.flatMap((d) => [d.a, d.b])));
  const W = 640, H = 210, L = 40, B = 24, T = 8;
  const plotH = H - B - T;
  const step = (W - L) / Math.max(data.length, 1);
  const bw = Math.min(6, step / 2.6);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const empty = data.every((d) => d.a === 0 && d.b === 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div>
      <div className="mb-2 flex justify-end gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: aColor }} /> {aLabel}</span>
        <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: bColor }} /> {bLabel}</span>
      </div>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted">{emptyText}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{compact(t, false)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = L + i * step + step / 2;
            return (
              <g key={d.key}>
                <title>{`${d.label}: ${aLabel} ${full(d.a, false)}, ${bLabel} ${full(d.b, false)}`}</title>
                {d.a > 0 && <rect x={x - bw - 0.5} y={y(d.a)} width={bw} height={T + plotH - y(d.a)} rx="1.5" fill={aColor} />}
                {d.b > 0 && <rect x={x + 0.5} y={y(d.b)} width={bw} height={T + plotH - y(d.b)} rx="1.5" fill={bColor} />}
                {i % 5 === 0 && <text x={x} y={H - 6} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{d.label}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {/* Same numbers for screen readers. A plain list inside a clipped box: a table here was stretched by the page table styles. */}
      <div className="sr-only">
        <p>{ariaLabel}</p>
        <ul>{data.map((d) => <li key={d.key}>{d.label}: {aLabel} {d.a}, {bLabel} {d.b}</li>)}</ul>
      </div>
    </div>
  );
}

// ---- A tiny trend line for the dashboard cards (decoration with real numbers, no axes) ----
export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const W = 64, H = 26;
  const max = Math.max(...values, 0);
  if (values.length < 2 || max === 0) {
    return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-6 w-16 shrink-0"><line x1="0" x2={W} y1={H - 3} y2={H - 3} stroke={color} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" /></svg>;
  }
  const step = W / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(H - 3 - (v / max) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-6 w-16 shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---- A few coloured columns, one per place, with the number above each (Stock by Warehouse) ----
export type ColoredBar = { key: string; label: string; value: number; color: string };

export function ColoredColumns({ data, ariaLabel, emptyText }: { data: ColoredBar[]; ariaLabel: string; emptyText: string }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  if (data.length === 0 || data.every((d) => d.value === 0)) return <p className="py-10 text-center text-sm text-muted">{emptyText}</p>;
  const W = 520, H = 220, L = 38, B = 26, T = 20;
  const plotH = H - B - T;
  const step = (W - L) / data.length;
  const bw = Math.min(64, step * 0.6);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px]">{compact(t, false)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + i * step + (step - bw) / 2;
          return (
            <g key={d.key}>
              <title>{`${d.label}: ${full(d.value, false)}`}</title>
              {d.value > 0 && <rect x={x} y={y(d.value)} width={bw} height={T + plotH - y(d.value)} rx="3" fill={d.color} />}
              <text x={x + bw / 2} y={y(d.value) - 5} textAnchor="middle" className="fill-[var(--foreground)] text-[11px] font-semibold">{full(d.value, false)}</text>
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="sr-only">
        <p>{ariaLabel}</p>
        <ul>{data.map((d) => <li key={d.key}>{d.label}: {d.value}</li>)}</ul>
      </div>
    </div>
  );
}
