import Link from "next/link";
import type { ReactNode } from "react";

import { toneColor, toneFill, type Tone } from "./tones";

/*
 * Lightweight, dependency-free charts rendered on the server as SVG/CSS.
 * Every chart carries a text summary (aria-label) and the exact figures stay
 * available elsewhere on the page (tables, lists), so colour is never the only
 * channel. Entrance motion is CSS-only and disabled under reduced motion.
 */

export type DonutSegment = { label: string; value: number; tone: Tone };

export function DonutChart({
  segments,
  size = 160,
  thickness = 16,
  label,
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Accessible summary of what the donut shows. */
  label: string;
  /** Centre content (e.g. a percentage). */
  children?: ReactNode;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = 50 - thickness / 2 / (size / 100);
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness / (size / 100)} />
        {total > 0
          ? segments.map((segment, index) => {
              const share = (Math.max(0, segment.value) / total) * 100;
              const dash = Math.max(0, share - (segments.length > 1 ? 0.6 : 0));
              const node = (
                <circle
                  key={segment.label}
                  className="donut-seg"
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  pathLength={100}
                  stroke={toneColor[segment.tone]}
                  strokeWidth={thickness / (size / 100)}
                  strokeLinecap="butt"
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={-offset}
                  style={{ animationDelay: `${index * 120}ms` }}
                />
              );
              offset += share;
              return node;
            })
          : null}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      ) : null}
    </div>
  );
}

export function ChartLegend({ items }: { items: Array<{ label: string; tone: Tone; value?: ReactNode }> }) {
  return (
    <ul className="grid gap-2 text-sm">
      {items.map((item) => (
        <li className="flex items-center justify-between gap-3" key={item.label}>
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${toneFill[item.tone]}`} />
            <span className="truncate">{item.label}</span>
          </span>
          {item.value !== undefined ? (
            <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export type ColumnDatum = {
  key: string;
  /** Short axis label (e.g. "sept. 26"). */
  label: string;
  value: number;
  /** Compact value printed above the column. */
  valueLabel?: string;
  highlight?: boolean;
  href?: string;
};

/**
 * Vertical column chart for time series (≤ 12 points). Columns may link to a
 * detail view; the chart is then a mouse/touch shortcut and the accessible
 * navigation lives in the list beside it (links are removed from tab order).
 */
export function ColumnChart({
  data,
  label,
  height = 168,
  tone = "primary",
}: {
  data: ColumnDatum[];
  label: string;
  height?: number;
  tone?: Tone;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));

  return (
    <div role="img" aria-label={label} className="w-full">
      <div aria-hidden="true" className="relative" style={{ height }}>
        {/* Subtle gridlines */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((line) => (
            <span key={line} className="h-px w-full bg-border/60" />
          ))}
        </div>
        <div className="relative flex h-full items-end gap-2 px-1 sm:gap-3">
          {data.map((datum, index) => {
            const pct = Math.max(4, (datum.value / max) * 100);
            const column = (
              <span className="flex h-full w-full flex-col items-center justify-end gap-1.5">
                <span
                  className={`text-[0.68rem] font-semibold tabular-nums ${
                    datum.highlight ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {datum.valueLabel}
                </span>
                <span
                  className={`chart-col block w-full max-w-12 rounded-t-lg transition-[filter] duration-200 group-hover:brightness-110 ${
                    datum.highlight ? "shadow-[var(--shadow-md)]" : "opacity-45 group-hover:opacity-80"
                  }`}
                  style={{
                    height: `${pct}%`,
                    background: datum.highlight
                      ? `linear-gradient(180deg, hsl(var(--teal)), ${toneColor[tone]})`
                      : toneColor[tone],
                    animationDelay: `${index * 60}ms`,
                  }}
                />
              </span>
            );

            return datum.href ? (
              <Link
                className="group flex h-full min-w-0 flex-1 cursor-pointer justify-center"
                href={datum.href}
                key={datum.key}
                scroll={false}
                tabIndex={-1}
              >
                {column}
              </Link>
            ) : (
              <span className="group flex h-full min-w-0 flex-1 justify-center" key={datum.key}>
                {column}
              </span>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-2 px-1 sm:gap-3">
        {data.map((datum) => (
          <span
            className={`min-w-0 flex-1 truncate text-center text-[0.68rem] font-medium capitalize ${
              datum.highlight ? "text-foreground" : "text-muted-foreground"
            }`}
            key={datum.key}
          >
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export type BarDatum = { label: string; value: number; valueLabel: string; tone?: Tone; hint?: string };

/** Ranked horizontal bars with direct labels — comparisons across categories. */
export function BarList({ items, label, max }: { items: BarDatum[]; label: string; max?: number }) {
  const ceiling = max ?? Math.max(1, ...items.map((item) => item.value));

  return (
    <ul aria-label={label} className="grid gap-3.5">
      {items.map((item, index) => (
        <li className="grid gap-1.5" key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-foreground">
              {item.label}
              {item.hint ? <span className="ml-2 text-xs font-normal text-muted-foreground">{item.hint}</span> : null}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{item.valueLabel}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className={`chart-bar h-full rounded-full ${toneFill[item.tone ?? "primary"]}`}
              style={{ width: `${Math.max(2, (item.value / ceiling) * 100)}%`, animationDelay: `${index * 70}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Circular progress (0–1) with centred content. */
export function ProgressRing({
  value,
  size = 112,
  thickness = 10,
  tone = "success",
  label,
  children,
}: {
  value: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  label: string;
  children?: ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  const stroke = thickness / (size / 100);
  const radius = 50 - stroke / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        {pct > 0 ? (
          <circle
            className="donut-seg"
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            pathLength={100}
            stroke={toneColor[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${pct} ${100 - pct}`}
          />
        ) : null}
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      ) : null}
    </div>
  );
}

/** Proportional stacked bar (e.g. net vs. deductions inside gross). */
export function StackedBar({ segments, label }: { segments: DonutSegment[]; label: string }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0) || 1;

  return (
    <div role="img" aria-label={label} className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {segments.map((segment, index) => (
        <span
          aria-hidden="true"
          className={`chart-bar h-full ${toneFill[segment.tone]} ${index > 0 ? "border-l-2 border-surface" : ""}`}
          key={segment.label}
          style={{ width: `${(Math.max(0, segment.value) / total) * 100}%`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

/** Tiny trend line for KPI tiles. */
export function Sparkline({ values, tone = "teal", className = "h-8 w-24" }: { values: number[]; tone?: Tone; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 98 + 1},${29 - ((value - min) / span) * 26}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline
        className="hero-ring"
        points={points}
        fill="none"
        stroke={toneColor[tone]}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
      />
    </svg>
  );
}
