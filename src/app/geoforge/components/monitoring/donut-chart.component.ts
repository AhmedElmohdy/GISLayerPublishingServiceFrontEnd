import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { ChartSlice, colorOf } from './chart-models';

interface Arc {
  slice: ChartSlice;
  path: string;
  color: string;
  percent: number;
}

/**
 * A donut for a small part-to-whole split — success versus failure, health by status.
 *
 * Two to four slices only. Beyond that a donut asks the reader to compare angles, which people
 * do badly; a bar chart answers the same question by comparing lengths, which people do well.
 * The centre carries the total, so the chart has a headline rather than only a shape.
 */
@Component({
  selector: 'gf-donut-chart',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './donut-chart.component.html',
  styleUrls: ['./donut-chart.component.scss'],
})
export class DonutChartComponent {
  @Input({ required: true }) slices: ChartSlice[] = [];

  @Input() centerLabel = '';

  @Input() emptyMessage = 'No data';

  readonly size = 180;
  readonly radius = 74;
  readonly thickness = 26;

  readonly hoverIndex = signal<number | null>(null);

  get total(): number {
    return this.slices.reduce((sum, slice) => sum + slice.value, 0);
  }

  get empty(): boolean {
    return this.total === 0;
  }

  get centerValue(): string {
    return this.total.toLocaleString();
  }

  /**
   * Arcs are laid out clockwise from twelve o'clock. A 2px gap between neighbouring fills is
   * carved by the stroke, so adjacent slices of similar hue stay countable.
   */
  get arcs(): Arc[] {
    const arcs: Arc[] = [];
    let angle = -Math.PI / 2;

    for (const slice of this.slices) {
      const fraction = slice.value / this.total;
      const sweep = fraction * Math.PI * 2;

      arcs.push({
        slice,
        path: this.arcPath(angle, angle + sweep),
        color: colorOf(slice),
        percent: fraction * 100,
      });

      angle += sweep;
    }

    return arcs;
  }

  /**
   * A full circle cannot be drawn as a single SVG arc — start and end coincide, and the renderer
   * draws nothing. A lone slice is therefore emitted as two half-circles.
   */
  private arcPath(start: number, end: number): string {
    if (end - start >= Math.PI * 2 - 1e-6) {
      const half = start + Math.PI;
      return `${this.arcPath(start, half)} ${this.arcPath(half, start + Math.PI * 2 - 1e-6)}`;
    }

    const center = this.size / 2;
    const outer = this.radius;
    const inner = this.radius - this.thickness;
    const largeArc = end - start > Math.PI ? 1 : 0;

    const x1 = center + outer * Math.cos(start);
    const y1 = center + outer * Math.sin(start);
    const x2 = center + outer * Math.cos(end);
    const y2 = center + outer * Math.sin(end);
    const x3 = center + inner * Math.cos(end);
    const y3 = center + inner * Math.sin(end);
    const x4 = center + inner * Math.cos(start);
    const y4 = center + inner * Math.sin(start);

    return [
      `M${x1},${y1}`,
      `A${outer},${outer} 0 ${largeArc} 1 ${x2},${y2}`,
      `L${x3},${y3}`,
      `A${inner},${inner} 0 ${largeArc} 0 ${x4},${y4}`,
      'Z',
    ].join(' ');
  }

  percentOf(slice: ChartSlice): string {
    return `${((slice.value / this.total) * 100).toFixed(1)}%`;
  }
}
