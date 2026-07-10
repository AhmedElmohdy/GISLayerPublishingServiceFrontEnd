import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Kpi, KpiTrend } from '../../models/monitoring.models';
import { ValueFormat, formatValue } from './chart-models';

/**
 * A stat tile: one number, how it moved, and nothing else.
 *
 * `higherIsBetter` is what separates "requests up 12%" (good) from "error rate up 12%" (bad).
 * The server reports only the direction of the arithmetic change, because whether up is good is
 * a property of the metric and not of the number — so the caller states it here, once per card.
 * A metric where neither direction is inherently good (`'neutral'`) shows the arrow in muted ink.
 */
@Component({
  selector: 'gf-kpi-card',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss'],
})
export class KpiCardComponent {
  @Input({ required: true }) label = '';

  /** Undefined while the panel is loading, which is what drives the skeleton. */
  @Input() kpi?: Kpi;

  @Input() loading = false;

  @Input() error = false;

  @Input() format: ValueFormat = 'number';

  @Input() icon?: string;

  @Input() direction: 'higherIsBetter' | 'lowerIsBetter' | 'neutral' = 'neutral';

  readonly Trend = KpiTrend;

  get value(): string {
    if (!this.kpi) {
      return '—';
    }

    return formatValue(this.kpi.value, this.format);
  }

  get hasChange(): boolean {
    return !!this.kpi && this.kpi.changePercent !== undefined && this.kpi.changePercent !== null;
  }

  get changeLabel(): string {
    const change = this.kpi?.changePercent ?? 0;
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  }

  /**
   * Status colour for the delta. Reserved status hues, never a categorical slot — a delta is a
   * judgement, and it should never be mistaken for a series.
   */
  get changeClass(): string {
    if (!this.hasChange || this.direction === 'neutral' || this.kpi!.trend === KpiTrend.Flat) {
      return 'gf-kpi__delta--neutral';
    }

    const rising = this.kpi!.trend === KpiTrend.Up;
    const good = this.direction === 'higherIsBetter' ? rising : !rising;

    return good ? 'gf-kpi__delta--good' : 'gf-kpi__delta--bad';
  }

  get arrow(): string {
    if (!this.kpi || this.kpi.trend === KpiTrend.Flat) {
      return '';
    }

    return this.kpi.trend === KpiTrend.Up ? 'fa-arrow-up' : 'fa-arrow-down';
  }

  /** An empty KPI is not a zero. "No layers have ever existed" and "zero layers now" differ. */
  get isEmpty(): boolean {
    return !!this.kpi?.isEmpty;
  }
}
