import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
  PERIOD_PRESET_KEYS,
  PeriodPreset,
  ResolvedPeriod,
  dateInputToUtc,
  resolvePeriod,
  utcToDateInput,
} from './monitoring-shared';

/**
 * A period selector: preset rows, plus a custom range behind them.
 *
 * It emits absolute UTC instants rather than the preset it resolved, so that everything
 * downstream — charts, tables, exports — asks the server about exactly the same window.
 */
@Component({
  selector: 'gf-date-range',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="d-flex flex-wrap align-items-center gap-2">
      <div class="btn-group btn-group-sm" role="group">
        <button
          type="button"
          class="btn"
          *ngFor="let key of presetKeys"
          [class.btn-primary]="preset === key"
          [class.btn-outline-secondary]="preset !== key"
          (click)="selectPreset(key)"
        >
          {{ presetLabels[key] | abpLocalization }}
        </button>
        <button
          type="button"
          class="btn"
          [class.btn-primary]="preset === 'custom'"
          [class.btn-outline-secondary]="preset !== 'custom'"
          (click)="preset = 'custom'"
        >
          {{ '::GeoForge:Dashboard:Custom' | abpLocalization }}
        </button>
      </div>

      <div class="d-flex align-items-center gap-2" *ngIf="preset === 'custom'">
        <label class="form-label mb-0 small text-muted" for="gf-from">
          {{ '::GeoForge:Dashboard:From' | abpLocalization }}
        </label>
        <input
          id="gf-from"
          type="date"
          class="form-control form-control-sm"
          [value]="fromInput"
          (change)="onCustom($any($event.target).value, toInput)"
        />

        <label class="form-label mb-0 small text-muted" for="gf-to">
          {{ '::GeoForge:Dashboard:To' | abpLocalization }}
        </label>
        <input
          id="gf-to"
          type="date"
          class="form-control form-control-sm"
          [value]="toInput"
          (change)="onCustom(fromInput, $any($event.target).value)"
        />
      </div>
    </div>
  `,
})
export class DateRangeComponent {
  @Input() preset: PeriodPreset = 'last30';

  @Output() readonly periodChange = new EventEmitter<ResolvedPeriod>();

  readonly presetLabels = PERIOD_PRESET_KEYS;
  readonly presetKeys = Object.keys(PERIOD_PRESET_KEYS) as Exclude<PeriodPreset, 'custom'>[];

  fromInput = '';
  toInput = '';

  selectPreset(preset: Exclude<PeriodPreset, 'custom'>): void {
    this.preset = preset;

    const period = resolvePeriod(preset);
    this.fromInput = utcToDateInput(period.fromUtc);
    this.toInput = utcToDateInput(period.toUtc);

    this.periodChange.emit(period);
  }

  /** A half-filled custom range is not a range. Nothing is emitted until both bounds exist. */
  onCustom(from: string, to: string): void {
    this.fromInput = from;
    this.toInput = to;

    const fromUtc = dateInputToUtc(from);
    const toUtc = dateInputToUtc(to, true);

    if (!fromUtc || !toUtc || fromUtc >= toUtc) {
      return;
    }

    this.periodChange.emit({ fromUtc, toUtc });
  }
}
