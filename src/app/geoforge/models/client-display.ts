/**
 * Presentation helpers shared by every client-facing GeoForge component: the layer page's
 * grants table, the client management list, and the client detail page. They live here rather
 * than in each component so "what colour is a suspended client" and "how do we render an
 * unlimited quota" have exactly one answer.
 */
import {
  ApiClient,
  ApiClientEffectiveStatus,
  ClientQuotaType,
} from './geoforge.models';

/** The localization key for a status, resolved through `| abpLocalization`. */
export const STATUS_LABEL_KEYS: Record<ApiClientEffectiveStatus, string> = {
  [ApiClientEffectiveStatus.Active]: '::GeoForge:Client:Status:Active',
  [ApiClientEffectiveStatus.Suspended]: '::GeoForge:Client:Status:Suspended',
  [ApiClientEffectiveStatus.Revoked]: '::GeoForge:Client:Status:Revoked',
  [ApiClientEffectiveStatus.Expired]: '::GeoForge:Client:Status:Expired',
};

/** Bootstrap badge class per status. Active is the only "good" state. */
export const STATUS_BADGE_CLASS: Record<ApiClientEffectiveStatus, string> = {
  [ApiClientEffectiveStatus.Active]: 'bg-success',
  [ApiClientEffectiveStatus.Suspended]: 'bg-warning text-dark',
  [ApiClientEffectiveStatus.Revoked]: 'bg-danger',
  [ApiClientEffectiveStatus.Expired]: 'bg-secondary',
};

/** A minimal shape both `ApiClient` and the lighter list rows satisfy. */
export interface QuotaBearing {
  quotaType: ClientQuotaType;
  quotaLimit?: number;
  usedRequests: number;
  remainingRequests?: number;
}

export function isLimited(client: QuotaBearing): boolean {
  return client.quotaType === ClientQuotaType.Limited;
}

/** 0–100 for a limited client, or null for an unlimited one (which has no bar to fill). */
export function quotaPercent(client: QuotaBearing): number | null {
  if (!isLimited(client) || !client.quotaLimit) {
    return null;
  }
  return Math.min(100, Math.round((client.usedRequests / client.quotaLimit) * 100));
}

/**
 * The severity band that colours the progress bar. The thresholds are the spec's: a warning at
 * 80%, critical at 95%, exhausted at 100%. Unlimited clients have no band.
 */
export function quotaBand(client: QuotaBearing): 'unlimited' | 'ok' | 'warning' | 'critical' | 'exhausted' {
  if (!isLimited(client)) {
    return 'unlimited';
  }
  const percent = quotaPercent(client) ?? 0;
  if (percent >= 100) {
    return 'exhausted';
  }
  if (percent >= 95) {
    return 'critical';
  }
  if (percent >= 80) {
    return 'warning';
  }
  return 'ok';
}

/** The Bootstrap contextual class for the quota progress bar, matching {@link quotaBand}. */
export function quotaBarClass(client: QuotaBearing): string {
  switch (quotaBand(client)) {
    case 'exhausted':
    case 'critical':
      return 'bg-danger';
    case 'warning':
      return 'bg-warning';
    default:
      return 'bg-success';
  }
}

export function isActive(client: Pick<ApiClient, 'effectiveStatus'>): boolean {
  return client.effectiveStatus === ApiClientEffectiveStatus.Active;
}
