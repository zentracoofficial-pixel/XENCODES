"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney, minorUnitDivisor } from "@/lib/currency";

/**
 * Revenue for each day (or week) as one column, split into what the provider
 * billed (bottom) and the profit left above it, so the height is the revenue
 * and the green part is what Xencodes kept. Older orders with no recorded
 * provider cost are a grey part on top, counted as neither cost nor profit. Hovering, tapping or using the arrow
 * keys on a column shows its exact figures; the same figures are in the table
 * below the chart, so nothing here is only reachable by hovering.
 *
 * Colours were checked for colour-blind separation and contrast against the
 * white card: profit #0c8a60, provider cost #4f8fe0.
 */

export const PROFIT_COLOR = "#0c8a60";
export const COST_COLOR = "#4f8fe0";
/** Revenue from orders whose provider cost was never recorded (older orders),
 *  so it is neither cost nor profit: a neutral grey, shown only when present. */
export const UNKNOWN_COLOR = "#c3cfca";

export interface ChartPoint {
  key: string;
  /** Full label for the tooltip, e.g. "Mon 13 Oct 2026" or "Week of 6 Oct". */
  label: string;
  /** Short axis label, e.g. "13 Oct". */
  short: string;
  revenueMinor: number;
  costMinor: number;
  profitMinor: number;
  sales: number;
}

const PAD = { top: 12, right: 8, bottom: 26, left: 48 };
const GRID = "#e3ece8";
const AXIS = "#c9d8d2";

function niceStep(max: number, ticks: number) {
  const raw = max / ticks;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * power;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Rounded top corners only: the data end is rounded, the baseline square. */
function columnPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function ProfitChart({
  points,
  currency,
  height = 240,
  emptyText = "No completed sales in these dates.",
}: {
  points: ChartPoint[];
  currency: string;
  height?: number;
  emptyText?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const divisor = minorUnitDivisor(currency);
  const maxRevenue = Math.max(0, ...points.map((p) => p.revenueMinor));
  const empty = maxRevenue === 0;
  const step = niceStep(empty ? divisor * 100 : maxRevenue, 4);
  const top = Math.max(step, Math.ceil((empty ? divisor * 100 : maxRevenue) / step) * step);

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const slot = points.length ? innerW / points.length : 0;
  const barW = Math.max(2, Math.min(24, slot * 0.68));
  const y = (minor: number) => PAD.top + innerH - (minor / top) * innerH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);

  // Enough room between axis labels that they never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 64))));

  const activePoint = active !== null ? points[active] : null;
  const unknownOf = (p: ChartPoint) => Math.max(0, p.revenueMinor - Math.max(0, p.costMinor) - Math.max(0, p.profitMinor));
  const anyUnknown = points.some((p) => unknownOf(p) > 0);
  const tipLeft =
    active !== null ? Math.min(Math.max(PAD.left + slot * active + slot / 2, 96), Math.max(96, width - 96)) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PROFIT_COLOR }} />
          Profit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COST_COLOR }} />
          Provider cost
        </span>
        {anyUnknown ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: UNKNOWN_COLOR }} />
            Cost not recorded
          </span>
        ) : null}
        <span className="ml-auto hidden sm:inline">Column height is revenue</span>
      </div>

      <div ref={wrap} className="relative w-full" style={{ height }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Revenue split into provider cost and profit, ${points.length} columns. Use the arrow keys to read each one; the table below lists every figure.`}
            tabIndex={0}
            className="block outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-mint/40"
            onKeyDown={(event) => {
              if (!points.length) return;
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const delta = event.key === "ArrowRight" ? 1 : -1;
                setActive((current) =>
                  current === null ? (delta > 0 ? 0 : points.length - 1) : Math.min(points.length - 1, Math.max(0, current + delta)),
                );
              }
              if (event.key === "Escape") setActive(null);
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? AXIS : GRID} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                  {compact.format(tick / divisor)}
                </text>
              </g>
            ))}

            {points.map((point, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              const x = cx - barW / 2;
              // Bottom to top: provider cost, profit, then any revenue whose
              // cost was never recorded. Each part is its real amount, so a
              // column never shows more profit than was made.
              const segments = [
                { value: Math.max(0, point.costMinor), color: COST_COLOR },
                { value: Math.max(0, point.profitMinor), color: PROFIT_COLOR },
                { value: unknownOf(point), color: UNKNOWN_COLOR },
              ].filter((segment) => segment.value > 0);
              let base = 0;
              const dim = active !== null && active !== i;
              return (
                <g key={point.key} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                  {segments.map((segment, index) => {
                    const bottom = y(base);
                    base += segment.value;
                    const topY = y(base);
                    const last = index === segments.length - 1;
                    // A 2px surface gap separates the parts of a column.
                    const h = Math.max(0, bottom - topY - (index > 0 ? 2 : 0));
                    if (h <= 0) return null;
                    return (
                      <path
                        key={segment.color}
                        d={last ? columnPath(x, topY, barW, h, 4) : `M${x},${topY}h${barW}v${h}h${-barW}Z`}
                        fill={segment.color}
                      />
                    );
                  })}
                  {i % labelEvery === 0 ? (
                    <text x={cx} y={height - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                      {point.short}
                    </text>
                  ) : null}
                  <rect
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={() => setActive(i)}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}

        {empty && width > 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : null}

        {activePoint ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs shadow-[var(--shadow-panel)]"
            style={{ left: tipLeft }}
          >
            <p className="font-medium text-muted-foreground">{activePoint.label}</p>
            <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
              {formatMoney(activePoint.revenueMinor, currency)}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">revenue</span>
            </p>
            <dl className="mt-1.5 space-y-1">
              <TipRow color={PROFIT_COLOR} label="Profit" value={formatMoney(activePoint.profitMinor, currency)} />
              <TipRow color={COST_COLOR} label="Provider cost" value={formatMoney(activePoint.costMinor, currency)} />
              {unknownOf(activePoint) > 0 ? (
                <TipRow color={UNKNOWN_COLOR} label="Cost not recorded" value={formatMoney(unknownOf(activePoint), currency)} />
              ) : null}
              <div className="flex items-center justify-between gap-3 pt-0.5 text-muted-foreground">
                <dt>Sales</dt>
                <dd className="tabular-nums">{activePoint.sales}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: color }} />
        {label}
      </dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
