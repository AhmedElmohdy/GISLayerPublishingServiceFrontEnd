import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LocalizationService } from '@abp/ng.core';
import { ToasterService } from '@abp/ng.theme.shared';
import {
  CHECK_TYPE_KEYS,
  HEALTH_STATUS_KEYS,
  HealthOverview,
  LayerHealth,
  LayerHealthStatus,
} from '../../../models/monitoring.models';
import { GeoForgeMonitoringService } from '../../../services/geoforge-monitoring.service';
import { ChartSlice } from '../chart-models';
import { layerHealthStatus } from '../monitoring-shared';

/**
 * Layer health: `/geoforge/health`.
 *
 * "Never checked" is a fourth state, not a synonym for healthy. A published layer the worker has
 * not reached yet is unknown, and colouring it green would be an assertion nobody has verified.
 */
@Component({
  selector: 'app-layer-health',
  standalone: false,
  templateUrl: './layer-health.component.html',
  styleUrls: ['./layer-health.component.scss'],
})
export class LayerHealthComponent implements OnInit {
  private readonly service = inject(GeoForgeMonitoringService);
  private readonly localization = inject(LocalizationService);
  private readonly toaster = inject(ToasterService);
  private readonly destroyRef = inject(DestroyRef);

  readonly overview = signal<HealthOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly running = signal(false);
  readonly expandedId = signal<string | null>(null);
  readonly details = signal<Record<string, LayerHealth>>({});

  readonly layerHealthStatus = layerHealthStatus;
  readonly checkTypeKeys = CHECK_TYPE_KEYS;

  readonly slices = computed<ChartSlice[]>(() => {
    const data = this.overview();

    if (!data) {
      return [];
    }

    return [
      { label: this.t('::GeoForge:Health:Healthy'), value: data.healthy, status: 'good' },
      { label: this.t('::GeoForge:Health:Degraded'), value: data.degraded, status: 'serious' },
      { label: this.t('::GeoForge:Health:Unavailable'), value: data.unavailable, status: 'critical' },
      { label: this.t('::GeoForge:Health:NeverChecked'), value: data.neverChecked, status: 'neutral' },
    ];
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.service
      .getHealthOverview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.overview.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  /**
   * Probes synchronously on the server, so the button stays disabled until it answers. A sweep
   * of every published layer issues one bounded query per layer; on a large catalog this is
   * seconds, not milliseconds, and pretending otherwise would invite a double-click.
   */
  runCheck(layerId?: string): void {
    this.running.set(true);
    this.toaster.info('::GeoForge:Health:Running', '', { life: 2000 });

    this.service
      .runHealthCheck(layerId ? [layerId] : undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.running.set(false);
          this.toaster.success('::GeoForge:Health:Completed');
          this.details.set({});
          this.load();
        },
        error: () => this.running.set(false),
      });
  }

  /** Individual check rows are fetched on demand: the overview carries only the roll-up. */
  toggleDetails(layer: LayerHealth): void {
    if (this.expandedId() === layer.layerId) {
      this.expandedId.set(null);
      return;
    }

    this.expandedId.set(layer.layerId);

    if (this.details()[layer.layerId]) {
      return;
    }

    this.service
      .getLayerHealth(layer.layerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(detail => this.details.update(map => ({ ...map, [layer.layerId]: detail })));
  }

  healthLabel(status: LayerHealthStatus | undefined): string {
    return status === undefined || status === null
      ? this.t('::GeoForge:Health:NeverChecked')
      : this.t(HEALTH_STATUS_KEYS[status]);
  }

  private t(key: string): string {
    return this.localization.instant(key);
  }
}
