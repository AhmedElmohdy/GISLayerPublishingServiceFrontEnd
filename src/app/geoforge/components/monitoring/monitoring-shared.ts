import { ChartStatus } from './chart-models';
import {
  IncidentSeverity,
  IncidentStatus,
  LayerHealthStatus,
  LayerUsageHealth,
} from '../../models/monitoring.models';

/** The preset rows of the date-range control, plus the escape hatch. */
export type PeriodPreset = 'last7' | 'last30' | 'last90' | 'monthToDate' | 'custom';

export interface ResolvedPeriod {
  fromUtc: string;
  toUtc: string;
}

export const PERIOD_PRESET_KEYS: Record<Exclude<PeriodPreset, 'custom'>, string> = {
  last7: '::GeoForge:Dashboard:Last7Days',
  last30: '::GeoForge:Dashboard:Last30Days',
  last90: '::GeoForge:Dashboard:Last90Days',
  monthToDate: '::GeoForge:Dashboard:MonthToDate',
};

/**
 * Turns a preset into an absolute UTC window.
 *
 * Presets are resolved against the browser's clock and sent as absolute instants, not as a
 * relative token the server re-resolves. Otherwise "last 7 days" means one window when the
 * request leaves and a different one when the export of the same view is generated a minute later.
 */
export function resolvePeriod(preset: PeriodPreset, now = new Date()): ResolvedPeriod {
  const to = new Date(now.getTime());
  let from: Date;

  switch (preset) {
    case 'last7':
      from = new Date(to.getTime() - 7 * 86_400_000);
      break;
    case 'last90':
      from = new Date(to.getTime() - 90 * 86_400_000);
      break;
    case 'monthToDate':
      from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
      break;
    case 'last30':
    default:
      from = new Date(to.getTime() - 30 * 86_400_000);
      break;
  }

  return { fromUtc: from.toISOString(), toUtc: to.toISOString() };
}

/** `<input type="date">` gives `yyyy-MM-dd` with no zone. Read it as UTC midnight, not local. */
export function dateInputToUtc(value: string, endOfDay = false): string | undefined {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split('-').map(Number);

  return endOfDay
    ? new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999)).toISOString()
    : new Date(Date.UTC(year, month - 1, day)).toISOString();
}

export function utcToDateInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

// ---------------------------------------------------------------------------
//  Status mapping
//
//  One place, so the badge on the usage table and the badge on the health page cannot disagree
//  about what colour "degraded" is.
// ---------------------------------------------------------------------------

export function usageHealthStatus(health: LayerUsageHealth): ChartStatus {
  switch (health) {
    case LayerUsageHealth.Healthy:
      return 'good';
    case LayerUsageHealth.Warning:
      return 'warning';
    case LayerUsageHealth.Critical:
      return 'critical';
    default:
      return 'neutral';
  }
}

/** `undefined` means never probed, which is neutral — not healthy, and not a failure. */
export function layerHealthStatus(status: LayerHealthStatus | undefined): ChartStatus {
  switch (status) {
    case LayerHealthStatus.Healthy:
      return 'good';
    case LayerHealthStatus.Degraded:
      return 'serious';
    case LayerHealthStatus.Unavailable:
      return 'critical';
    default:
      return 'neutral';
  }
}

export function severityStatus(severity: IncidentSeverity): ChartStatus {
  switch (severity) {
    case IncidentSeverity.Critical:
      return 'critical';
    case IncidentSeverity.Warning:
      return 'warning';
    default:
      return 'neutral';
  }
}

export function incidentStatusStatus(status: IncidentStatus): ChartStatus {
  switch (status) {
    case IncidentStatus.Open:
      return 'critical';
    case IncidentStatus.Investigating:
      return 'warning';
    case IncidentStatus.Resolved:
      return 'good';
    default:
      return 'neutral';
  }
}

/**
 * A 3xx is a success for the client that follows it, and a 304 on a tile is the cache working.
 * Only 4xx and 5xx are failures, and they are distinguished: a 4xx is the caller's mistake and a
 * 5xx is ours.
 */
export function statusCodeStatus(code: number): ChartStatus {
  if (code >= 500) {
    return 'critical';
  }
  if (code >= 400) {
    return 'warning';
  }
  return 'good';
}

/** Short day label for a chart axis: `12 Mar`. Localized by the browser, not by us. */
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function hourLabel(iso: string): string {
  return `${String(new Date(iso).getUTCHours()).padStart(2, '0')}:00`;
}
