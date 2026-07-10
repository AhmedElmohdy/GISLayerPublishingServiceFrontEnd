import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LocalizationService } from '@abp/ng.core';
import {
  AUTH_TYPE_KEYS,
  CHECK_TYPE_KEYS,
  GeoForgeOperation,
  HEALTH_STATUS_KEYS,
  Kpi,
  KpiTrend,
  LayerAnalytics,
  LayerHealthStatus,
  OPERATION_KEYS,
} from '../../../models/monitoring.models';
import { GeoForgeMonitoringService } from '../../../services/geoforge-monitoring.service';
import { ChartSeries, ChartSlice } from '../chart-models';
import {
  ResolvedPeriod,
  dayLabel,
  hourLabel,
  layerHealthStatus,
  resolvePeriod,
  statusCodeStatus,
} from '../monitoring-shared';

/** Drill-down for one layer: `/geoforge/layers/:id/analytics`. */
@Component({
  selector: 'app-layer-analytics',
  standalone: false,
  templateUrl: './layer-analytics.component.html',
  styleUrls: ['./layer-analytics.component.scss'],
})
export class LayerAnalyticsComponent implements OnInit {
  private readonly service = inject(GeoForgeMonitoringService);
  private readonly route = inject(ActivatedRoute);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly layerId = signal('');
  readonly period = signal<ResolvedPeriod>(resolvePeriod('last30'));

  readonly data = signal<LayerAnalytics | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly layerHealthStatus = layerHealthStatus;
  readonly statusCodeStatus = statusCodeStatus;
  readonly checkTypeKeys = CHECK_TYPE_KEYS;
  readonly authTypeKeys = AUTH_TYPE_KEYS;
  readonly operationKeys = OPERATION_KEYS;

  readonly dayLabels = computed(() =>
    (this.data()?.requestsByDay ?? []).map(p => dayLabel(p.timestamp))
  );

  readonly daySeries = computed<ChartSeries[]>(() => {
    const points = this.data()?.requestsByDay ?? [];

    return [
      { label: this.t('::GeoForge:Chart:Successful'), values: points.map(p => p.successCount), slot: 1 },
      { label: this.t('::GeoForge:Chart:Failed'), values: points.map(p => p.failureCount), slot: 5 },
    ];
  });

  readonly responseSeries = computed<ChartSeries[]>(() => [
    {
      label: this.t('::GeoForge:Kpi:AverageResponseTime'),
      values: (this.data()?.requestsByDay ?? []).map(p => p.averageResponseTimeMs),
      slot: 4,
    },
  ]);

  readonly hourLabels = computed(() =>
    (this.data()?.requestsByHour ?? []).map(p => hourLabel(p.timestamp))
  );

  readonly hourSeries = computed<ChartSeries[]>(() => [
    {
      label: this.t('::GeoForge:LayerUsage:TotalRequests'),
      values: (this.data()?.requestsByHour ?? []).map(p => p.count),
      slot: 2,
    },
  ]);

  readonly successSlices = computed<ChartSlice[]>(() => {
    const data = this.data();

    if (!data) {
      return [];
    }

    return [
      { label: this.t('::GeoForge:Chart:Successful'), value: data.successfulRequests, status: 'good' },
      { label: this.t('::GeoForge:Chart:Failed'), value: data.failedRequests, status: 'critical' },
    ];
  });

  readonly operationSlices = computed<ChartSlice[]>(() =>
    (this.data()?.requestsByOperation ?? []).map((c, index) => ({
      label: this.t(OPERATION_KEYS[c.numericKey as GeoForgeOperation] ?? '::GeoForge:Operation:Unknown'),
      value: c.count,
      slot: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    }))
  );

  readonly statusSlices = computed<ChartSlice[]>(() =>
    (this.data()?.requestsByStatusCode ?? []).map(c => ({
      label: String(c.numericKey),
      value: c.count,
      status: statusCodeStatus(c.numericKey),
    }))
  );

  readonly clientSlices = computed<ChartSlice[]>(() =>
    (this.data()?.topClients ?? []).map((c, index) => ({
      // Anonymous traffic has no client id, and saying so is more useful than omitting the row.
      label: c.clientId ?? this.t('::GeoForge:AuthType:Anonymous'),
      value: c.totalRequests,
      slot: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    }))
  );

  /**
   * Wraps a bare number as a KPI with no comparison.
   *
   * The drill-down reports absolutes for the selected period and deliberately shows no delta:
   * there is no "previous period" for a layer's own analytics that would not silently disagree
   * with the arrow the overview draws for the same metric.
   */
  kpi(value: number | undefined): Kpi {
    return { value: value ?? 0, trend: KpiTrend.Flat, isEmpty: !this.data()?.totalRequests };
  }

  /** `undefined` is "never probed", which is a real answer and not the absence of one. */
  healthLabel(status: LayerHealthStatus | undefined): string {
    return status === undefined || status === null
      ? this.t('::GeoForge:Health:NeverChecked')
      : this.t(HEALTH_STATUS_KEYS[status]);
  }

  ngOnInit(): void {
    this.layerId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.load();
  }

  onPeriodChange(period: ResolvedPeriod): void {
    this.period.set(period);
    this.load();
  }

  load(): void {
    if (!this.layerId()) {
      return;
    }

    this.loading.set(true);
    this.error.set(false);

    this.service
      .getLayerAnalytics(this.layerId(), this.period())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.data.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  private t(key: string): string {
    return this.localization.instant(key);
  }
}
