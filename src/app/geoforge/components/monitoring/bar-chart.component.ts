import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { ChartSlice, ValueFormat, colorOf, formatValue, niceMax } from './chart-models';

/**
 * A horizontal bar chart for ranked categories — requests by operation, by status code, by client.
 *
 * Horizontal rather than vertical, because the categories are text of unpredictable length
 * ("Esri FeatureServer query", "بيانات خدمة Esri الوصفية"), and a vertical chart would either
 * rotate those labels or truncate them. Every bar is direct-labelled with its value, so the axis
 * is decoration rather than the only way to read a magnitude.
 */
@Component({
  selector: 'gf-bar-chart',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-chart.component.html',
  styleUrls: ['./bar-chart.component.scss'],
})
export class BarChartComponent {
  @Input({ required: true }) slices: ChartSlice[] = [];

  @Input() valueFormat: ValueFormat = 'number';

  @Input() emptyMessage = 'No data';

  /** Rows beyond this are not drawn. The caller decides what "the rest" means. */
  @Input() maxRows = 10;

  readonly hoverIndex = signal<number | null>(null);
  readonly colorOf = colorOf;

  get rows(): ChartSlice[] {
    return this.slices.slice(0, this.maxRows);
  }

  get empty(): boolean {
    return this.rows.length === 0 || this.rows.every(s => !s.value);
  }

  get maxValue(): number {
    return niceMax(Math.max(0, ...this.rows.map(s => s.value)));
  }

  /** Bar width as a percentage of the track. A zero-value row still renders a visible stub. */
  widthOf(slice: ChartSlice): string {
    const ratio = this.maxValue === 0 ? 0 : slice.value / this.maxValue;
    return `${Math.max(ratio * 100, slice.value > 0 ? 1.5 : 0)}%`;
  }

  format(value: number): string {
    return formatValue(value, this.valueFormat);
  }
}
