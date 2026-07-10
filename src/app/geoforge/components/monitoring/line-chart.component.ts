import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import {
  ChartSeries,
  ValueFormat,
  colorOf,
  formatValue,
  niceMax,
} from './chart-models';

interface Point {
  x: number;
  y: number;
}

/**
 * A multi-series line chart in plain SVG.
 *
 * No chart library. The three shapes this dashboard needs — a line, a bar and a donut — are a
 * few dozen lines of geometry each, and owning them buys two things a library would not: they
 * inherit the LeptonX theme variables directly (so dark, dim and light mode need no JavaScript),
 * and they render into the DOM rather than a canvas, so a screen reader and a text search both
 * find the values.
 *
 * The hover layer is not optional. An HTML chart *is* interactive, and a series of daily counts
 * with no way to read an individual day is a picture of data rather than the data.
 */
@Component({
  selector: 'gf-line-chart',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-chart.component.html',
  styleUrls: ['./line-chart.component.scss'],
})
export class LineChartComponent {
  /** One entry per x position. Rendered as the tick labels and the tooltip title. */
  @Input({ required: true }) labels: string[] = [];

  @Input({ required: true }) series: ChartSeries[] = [];

  @Input() valueFormat: ValueFormat = 'number';

  @Input() emptyMessage = 'No data';

  @Input() tableLabel = 'View as table';

  /** Height of the plot in viewBox units. Width is fixed; the SVG scales to its container. */
  @Input() height = 220;

  readonly width = 760;
  readonly padding = { top: 12, right: 16, bottom: 26, left: 52 };

  readonly hoverIndex = signal<number | null>(null);
  readonly showTable = signal(false);

  readonly colorOf = colorOf;

  /** True when there is nothing to draw: no series, no labels, or nothing but zeros. */
  get empty(): boolean {
    return (
      this.series.length === 0 ||
      this.labels.length === 0 ||
      this.series.every(s => s.values.every(v => !v))
    );
  }

  get plotWidth(): number {
    return this.width - this.padding.left - this.padding.right;
  }

  get plotHeight(): number {
    return this.height - this.padding.top - this.padding.bottom;
  }

  get maxValue(): number {
    // `flatMap` needs an es2019 lib; this project targets earlier. `concat` is equivalent here
    // and spreading a flat array keeps the call-site cost the same.
    const values = ([] as number[]).concat(...this.series.map(s => s.values));

    return niceMax(Math.max(0, ...values));
  }

  /** Four gridlines plus the baseline. More is noise; fewer makes magnitudes unreadable. */
  get gridLines(): { y: number; value: number }[] {
    const steps = 4;

    return Array.from({ length: steps + 1 }, (_, index) => {
      const value = (this.maxValue / steps) * index;
      return { y: this.yOf(value), value };
    });
  }

  /**
   * X tick labels are thinned to at most eight. Drawing a label per day over a 90-day period
   * produces an unreadable smear, and rotating them to fit is a worse fix than showing fewer.
   */
  get xTicks(): { x: number; label: string }[] {
    const count = this.labels.length;

    if (count === 0) {
      return [];
    }

    const stride = Math.max(1, Math.ceil(count / 8));

    return this.labels
      .map((label, index) => ({ index, label }))
      .filter(t => t.index % stride === 0 || t.index === count - 1)
      .map(t => ({ x: this.xOf(t.index), label: t.label }));
  }

  xOf(index: number): number {
    const count = Math.max(1, this.labels.length - 1);
    return this.padding.left + (this.plotWidth / count) * index;
  }

  yOf(value: number): number {
    const ratio = this.maxValue === 0 ? 0 : value / this.maxValue;
    return this.padding.top + this.plotHeight - ratio * this.plotHeight;
  }

  pathOf(series: ChartSeries): string {
    return series.values
      .map((value, index) => `${index === 0 ? 'M' : 'L'}${this.xOf(index)},${this.yOf(value)}`)
      .join(' ');
  }

  /**
   * The last point of each series is marked and direct-labelled. Marking every point turns a
   * 90-day line into a dotted rug; marking the end is where the reader looks anyway.
   */
  lastPoint(series: ChartSeries): Point | null {
    const index = series.values.length - 1;

    if (index < 0) {
      return null;
    }

    return { x: this.xOf(index), y: this.yOf(series.values[index]) };
  }

  onMove(event: MouseEvent, svg: SVGSVGElement): void {
    if (this.empty) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const scale = this.width / rect.width;
    const x = (event.clientX - rect.left) * scale;

    const count = Math.max(1, this.labels.length - 1);
    const step = this.plotWidth / count;
    const index = Math.round((x - this.padding.left) / step);

    this.hoverIndex.set(Math.min(this.labels.length - 1, Math.max(0, index)));
  }

  onLeave(): void {
    this.hoverIndex.set(null);
  }

  /** Percentage across the plot, used to place the HTML tooltip over the SVG. */
  tooltipLeft(index: number): string {
    return `${(this.xOf(index) / this.width) * 100}%`;
  }

  tooltipTop(index: number): string {
    const highest = Math.min(...this.series.map(s => this.yOf(s.values[index] ?? 0)));
    return `${(highest / this.height) * 100}%`;
  }

  format(value: number): string {
    return formatValue(value ?? 0, this.valueFormat);
  }

  toggleTable(): void {
    this.showTable.update(open => !open);
  }
}
