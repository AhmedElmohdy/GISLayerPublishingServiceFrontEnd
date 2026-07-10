import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LocalizationService } from '@abp/ng.core';
import {
  ClientAnalytics,
  Kpi,
  KpiTrend,
  OPERATION_KEYS,
  TOKEN_ACTION_KEYS,
} from '../../../models/monitoring.models';
import { GeoForgeMonitoringService } from '../../../services/geoforge-monitoring.service';
import { ChartSeries, ChartSlice } from '../chart-models';
import { ResolvedPeriod, dayLabel, resolvePeriod, statusCodeStatus } from '../monitoring-shared';

/**
 * Drill-down for one API client: `/geoforge/clients/:id/analytics`.
 *
 * The page exists to answer one question precisely — how many times did this client call each
 * layer — and it answers it for every granted layer, including the ones with zero traffic. A
 * grant that has never been exercised is the most actionable row on the page and a plain
 * GROUP BY would omit it.
 */
@Component({
  selector: 'app-client-analytics',
  standalone: false,
  templateUrl: './client-analytics.component.html',
  styleUrls: ['./client-analytics.component.scss'],
})
export class ClientAnalyticsComponent implements OnInit {
  private readonly service = inject(GeoForgeMonitoringService);
  private readonly route = inject(ActivatedRoute);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly clientId = signal('');
  readonly period = signal<ResolvedPeriod>(resolvePeriod('last30'));

  readonly data = signal<ClientAnalytics | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly statusCodeStatus = statusCodeStatus;
  readonly operationKeys = OPERATION_KEYS;
  readonly tokenActionKeys = TOKEN_ACTION_KEYS;

  readonly dayLabels = computed(() =>
    (this.data()?.requestsOverTime ?? []).map(p => dayLabel(p.timestamp))
  );

  readonly daySeries = computed<ChartSeries[]>(() => {
    const points = this.data()?.requestsOverTime ?? [];

    return [
      { label: this.t('::GeoForge:Chart:Successful'), values: points.map(p => p.successCount), slot: 1 },
      { label: this.t('::GeoForge:Chart:Failed'), values: points.map(p => p.failureCount), slot: 5 },
    ];
  });

  /** Requests per layer, in the order the server ranked them. Colour follows the layer, not the rank. */
  readonly layerSlices = computed<ChartSlice[]>(() =>
    (this.data()?.requestsPerLayer ?? []).map((layer, index) => ({
      label: layer.name,
      value: layer.totalRequests,
      slot: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    }))
  );

  readonly securitySlices = computed<ChartSlice[]>(() => {
    const data = this.data();

    if (!data) {
      return [];
    }

    return [
      { label: this.t('::GeoForge:Clients:FailedAuth'), value: data.failedAuthenticationAttempts, status: 'critical' },
      { label: this.t('::GeoForge:Clients:AccessDenied'), value: data.accessDeniedAttempts, status: 'warning' },
      { label: this.t('::GeoForge:Clients:ExpiredTokens'), value: data.expiredTokenAttempts, status: 'serious' },
    ];
  });

  ngOnInit(): void {
    this.clientId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.load();
  }

  onPeriodChange(period: ResolvedPeriod): void {
    this.period.set(period);
    this.load();
  }

  load(): void {
    if (!this.clientId()) {
      return;
    }

    this.loading.set(true);
    this.error.set(false);

    this.service
      .getClientAnalytics(this.clientId(), this.period())
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

  kpi(value: number | undefined): Kpi {
    return { value: value ?? 0, trend: KpiTrend.Flat, isEmpty: !this.data()?.totalRequests };
  }

  private t(key: string): string {
    return this.localization.instant(key);
  }
}
