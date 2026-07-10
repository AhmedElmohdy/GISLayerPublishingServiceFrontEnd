/**
 * Chart inputs shared by the GeoForge monitoring charts.
 *
 * `slot` is an index into the fixed categorical palette (1–5). It is bound to the *entity*, never
 * to the entity's rank: filtering a chart down from five series to two must not repaint the two
 * that survive, or the reader learns the colours mean nothing.
 */
export interface ChartSeries {
  label: string;
  values: number[];
  /** 1-based categorical slot, or a status role. */
  slot?: 1 | 2 | 3 | 4 | 5;
  status?: ChartStatus;
}

export type ChartStatus = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface ChartSlice {
  label: string;
  value: number;
  slot?: 1 | 2 | 3 | 4 | 5;
  status?: ChartStatus;
}

export type ValueFormat = 'number' | 'ms' | 'percent';

/** Resolves a series or slice to the CSS variable that colours it. */
export function colorOf(item: { slot?: number; status?: ChartStatus }): string {
  if (item.status) {
    return `var(--gf-${item.status})`;
  }

  return `var(--gf-series-${item.slot ?? 1})`;
}

export function formatValue(value: number, format: ValueFormat): string {
  switch (format) {
    case 'ms':
      return `${Math.round(value).toLocaleString()} ms`;
    case 'percent':
      return `${value.toFixed(2)}%`;
    default:
      return Math.round(value).toLocaleString();
  }
}

/**
 * A "nice" upper bound for an axis: the smallest 1/2/5×10ⁿ at or above the data maximum.
 *
 * Without it the top gridline lands on 8 731 and the axis reads like a serial number. A
 * zero-maximum series is given a bound of 1 rather than 0, so the plot has a height to draw in.
 */
export function niceMax(max: number): number {
  if (max <= 0) {
    return 1;
  }

  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;

  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return step * magnitude;
}
