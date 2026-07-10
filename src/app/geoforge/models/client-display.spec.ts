import {
  ApiClientEffectiveStatus,
  ClientQuotaType,
} from './geoforge.models';
import {
  quotaBand,
  quotaBarClass,
  quotaPercent,
  STATUS_BADGE_CLASS,
  STATUS_LABEL_KEYS,
} from './client-display';

/**
 * The shared display helpers decide how every client-facing component renders a status and a
 * quota. The quota bands in particular encode the spec's thresholds (warning 80, critical 95,
 * exhausted 100), so they are worth pinning down.
 */
describe('client-display helpers', () => {
  function limited(used: number, limit: number) {
    return {
      quotaType: ClientQuotaType.Limited,
      quotaLimit: limit,
      usedRequests: used,
      remainingRequests: Math.max(0, limit - used),
    };
  }

  const unlimited = {
    quotaType: ClientQuotaType.Unlimited,
    usedRequests: 999,
    quotaLimit: undefined,
    remainingRequests: undefined,
  };

  it('reports no percent for an unlimited client', () => {
    expect(quotaPercent(unlimited)).toBeNull();
    expect(quotaBand(unlimited)).toBe('unlimited');
  });

  it('computes the used percentage for a limited client', () => {
    expect(quotaPercent(limited(50, 100))).toBe(50);
    expect(quotaPercent(limited(0, 100))).toBe(0);
  });

  it('bands a quota by the spec thresholds', () => {
    expect(quotaBand(limited(10, 100))).toBe('ok');
    expect(quotaBand(limited(80, 100))).toBe('warning');
    expect(quotaBand(limited(96, 100))).toBe('critical');
    expect(quotaBand(limited(100, 100))).toBe('exhausted');
  });

  it('colours the bar red at critical and exhausted', () => {
    expect(quotaBarClass(limited(10, 100))).toBe('bg-success');
    expect(quotaBarClass(limited(85, 100))).toBe('bg-warning');
    expect(quotaBarClass(limited(97, 100))).toBe('bg-danger');
    expect(quotaBarClass(limited(100, 100))).toBe('bg-danger');
  });

  it('caps the percentage at 100 even if usage somehow exceeds the limit', () => {
    expect(quotaPercent(limited(150, 100))).toBe(100);
    expect(quotaBand(limited(150, 100))).toBe('exhausted');
  });

  it('maps every effective status to a label key and a badge class', () => {
    for (const status of [
      ApiClientEffectiveStatus.Active,
      ApiClientEffectiveStatus.Suspended,
      ApiClientEffectiveStatus.Revoked,
      ApiClientEffectiveStatus.Expired,
    ]) {
      expect(STATUS_LABEL_KEYS[status]).toContain('::GeoForge:Client:Status');
      expect(STATUS_BADGE_CLASS[status]).toBeTruthy();
    }
    expect(STATUS_BADGE_CLASS[ApiClientEffectiveStatus.Active]).toBe('bg-success');
  });
});
