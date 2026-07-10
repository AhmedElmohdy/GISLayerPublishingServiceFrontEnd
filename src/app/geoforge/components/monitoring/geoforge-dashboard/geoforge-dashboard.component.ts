import { DestroyRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocalizationService } from '@abp/ng.core';
import { interval } from 'rxjs';
import {
  ClientUsage,
  DashboardOverview,
  GeoForgeOperation,
  LayerUsage,
  LayerUsageSort,
  OPERATION_KEYS,
  USAGE_HEALTH_KEYS,
} from '../../../models/monitoring.models';
import { GeoForgeMonitoringService } from '../../../services/geoforge-monitoring.service';
import { ChartSeries, ChartSlice } from '../chart-models';
import {
  ResolvedPeriod,
  dayLabel,
  layerHealthStatus,
  resolvePeriod,
  statusCodeStatus,
  usageHealthStatus,
} from '../monitoring-shared';

/**
 * The GeoForge monitoring dashboard: KPIs, traffic charts, and the layer and client leaderboards.
 *
 * Each panel owns its own loading and error state. A dashboard that fails as a unit because one
 * of six queries timed out shows the operator nothing at the moment they most need the other
 * five — so the overview, the layer table and the client table are three independent requests
 * with three independent failures.
 */
@Component({
  selector: 'app-geoforge-dashboard',
  standalone: false,
  templateUrl: './geoforge-dashboard.component.html',
  styleUrls: ['./geoforge-dashboard.component.scss'],
})
export class GeoForgeDashboardComponent implements OnInit {
  private readonly service = inject(GeoForgeMonitoringService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly period = signal<ResolvedPeriod>(resolvePeriod('last30'));

  readonly overview = signal<DashboardOverview | null>(null);
  readonly overviewLoading = signal(true);
  readonly overviewError = signal(false);

  readonly layers = signal<LayerUsage[]>([]);
  readonly layerTotal = signal(0);
  readonly layersLoading = signal(true);
  readonly layersError = signal(false);
  readonly layerSort = signal<LayerUsageSort>(LayerUsageSort.MostUsed);
  readonly layerPage = signal(0);

  readonly clients = signal<ClientUsage[]>([]);
  readonly clientsLoading = signal(true);
  readonly clientsError = signal(false);

  readonly autoRefresh = signal(false);

  readonly pageSize = 10;

  readonly Sort = LayerUsageSort;
  readonly usageHealthStatus = usageHealthStatus;
  readonly layerHealthStatus = layerHealthStatus;
  readonly usageHealthKeys = USAGE_HEALTH_KEYS;

  /** Auto-refresh cadence. Slow enough that a watched dashboard is not a load test. */
  private static readonly RefreshIntervalMs = 30_000;

  // ---- Charts ------------------------------------------------------------

  readonly trafficLabels = computed(() =>
    (this.overview()?.requestsOverTime ?? []).map(p => dayLabel(p.timestamp))
  );

  /** Success and failure as two lines. Never stacked: a stack hides the failure count's shape. */
  readonly trafficSeries = computed<ChartSeries[]>(() => {
    const points = this.overview()?.requestsOverTime ?? [];

    return [
      {
        label: this.t('::GeoForge:Chart:Successful'),
        values: points.map(p => p.successCount),
        slot: 1,
      },
      {
        label: this.t('::GeoForge:Chart:Failed'),
        values: points.map(p => p.failureCount),
        slot: 5,
      },
    ];
  });

  readonly responseTimeSeries = computed<ChartSeries[]>(() => [
    {
      label: this.t('::GeoForge:Kpi:AverageResponseTime'),
      values: (this.overview()?.requestsOverTime ?? []).map(p => p.averageResponseTimeMs),
      slot: 4,
    },
  ]);

  readonly successSlices = computed<ChartSlice[]>(() => {
    const data = this.overview();

    if (!data) {
      return [];
    }

    return [
      { label: this.t('::GeoForge:Chart:Successful'), value: data.successfulRequests.value, status: 'good' },
      { label: this.t('::GeoForge:Chart:Failed'), value: data.failedRequests.value, status: 'critical' },
    ];
  });

  readonly operationSlices = computed<ChartSlice[]>(() =>
    (this.overview()?.requestsByOperation ?? []).map((c, index) => ({
      label: this.t(OPERATION_KEYS[c.numericKey as GeoForgeOperation] ?? '::GeoForge:Operation:Unknown'),
      value: c.count,
      // Colour follows the entity's position in the fixed palette, cycling only after five —
      // and the direct value label beside every bar means the reuse is never load-bearing.
      slot: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    }))
  );

  readonly statusSlices = computed<ChartSlice[]>(() =>
    (this.overview()?.requestsByStatusCode ?? []).map(c => ({
      label: String(c.numericKey),
      value: c.count,
      status: statusCodeStatus(c.numericKey),
    }))
  );

  readonly healthSlices = computed<ChartSlice[]>(() => {
    const health = this.overview()?.health;

    if (!health) {
      return [];
    }

    return [
      { label: this.t('::GeoForge:Health:Healthy'), value: health.healthy, status: 'good' },
      { label: this.t('::GeoForge:Health:Degraded'), value: health.degraded, status: 'serious' },
      { label: this.t('::GeoForge:Health:Unavailable'), value: health.unavailable, status: 'critical' },
      { label: this.t('::GeoForge:Health:NeverChecked'), value: health.neverChecked, status: 'neutral' },
    ];
  });

  ngOnInit(): void {
    this.loadAll();
    this.startAutoRefresh();
  }

  onPeriodChange(period: ResolvedPeriod): void {
    this.period.set(period);
    this.layerPage.set(0);
    this.loadAll();
  }

  loadAll(): void {
    this.loadOverview();
    this.loadLayers();
    this.loadClients();
  }

  loadOverview(): void {
    this.overviewLoading.set(true);
    this.overviewError.set(false);

    this.service
      .getOverview(this.period())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.overview.set(data);
          this.overviewLoading.set(false);
        },
        error: () => {
          this.overviewError.set(true);
          this.overviewLoading.set(false);
        },
      });
  }

  loadLayers(): void {
    this.layersLoading.set(true);
    this.layersError.set(false);

    this.service
      .getLayerUsage({
        ...this.period(),
        sort: this.layerSort(),
        skipCount: this.layerPage() * this.pageSize,
        maxResultCount: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.layers.set(result.items);
          this.layerTotal.set(result.totalCount);
          this.layersLoading.set(false);
        },
        error: () => {
          this.layersError.set(true);
          this.layersLoading.set(false);
        },
      });
  }

  loadClients(): void {
    this.clientsLoading.set(true);
    this.clientsError.set(false);

    this.service
      .getClientUsage({ ...this.period(), maxResultCount: this.pageSize })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.clients.set(result.items);
          this.clientsLoading.set(false);
        },
        error: () => {
          this.clientsError.set(true);
          this.clientsLoading.set(false);
        },
      });
  }

  setSort(sort: LayerUsageSort): void {
    this.layerSort.set(sort);
    this.layerPage.set(0);
    this.loadLayers();
  }

  nextLayerPage(): void {
    if ((this.layerPage() + 1) * this.pageSize < this.layerTotal()) {
      this.layerPage.update(p => p + 1);
      this.loadLayers();
    }
  }

  previousLayerPage(): void {
    if (this.layerPage() > 0) {
      this.layerPage.update(p => p - 1);
      this.loadLayers();
    }
  }

  toggleAutoRefresh(): void {
    this.autoRefresh.update(on => !on);
  }

  /**
   * One timer for the page's lifetime. It ticks regardless and the handler decides whether the
   * toggle is on — resubscribing on every flip of the toggle would leak an interval per flip.
   */
  private startAutoRefresh(): void {
    interval(GeoForgeDashboardComponent.RefreshIntervalMs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.autoRefresh()) {
          this.loadAll();
        }
      });
  }

  private t(key: string): string {
    return this.localization.instant(key);
  }
}
