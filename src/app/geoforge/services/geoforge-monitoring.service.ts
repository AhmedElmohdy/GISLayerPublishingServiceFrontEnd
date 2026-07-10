import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PagedResult } from '../models/geoforge.models';
import {
  ClientAnalytics,
  ClientUsage,
  DashboardOverview,
  DashboardPeriodInput,
  GetClientUsageInput,
  GetIncidentsInput,
  GetLayerUsageInput,
  GetRequestLogsInput,
  HealthOverview,
  Incident,
  LayerAnalytics,
  LayerHealth,
  LayerUsage,
  RequestLog,
  RequestLogExportFormat,
  UpdateIncidentStatus,
} from '../models/monitoring.models';

/**
 * Builds query parameters, dropping any key whose value is absent.
 *
 * `HttpClient` stringifies with `` `${value}` ``, so an `undefined` filter would be sent as the
 * six literal characters `undefined`. Booleans and the numeric value `0` are legitimate filter
 * values and must survive — `!value` would silently discard both, which is exactly how a
 * "show only failed requests" filter (`isSuccessful=false`) stops working.
 */
function queryParams(source: Record<string, unknown>): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params = params.set(key, String(value));
  }

  return params;
}

/**
 * HTTP access to the GeoForge monitoring API, under `/api/geoforge/dashboard`.
 *
 * `HttpClient` directly rather than ABP's `RestService`, matching `GeoForgeService`: requests
 * still pass through ABP's OAuth interceptor, and the export endpoint returns a binary blob that
 * `RestService` would try to parse as JSON.
 */
@Injectable({ providedIn: 'root' })
export class GeoForgeMonitoringService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apis.default.url}/api/geoforge/dashboard`;

  getOverview(input: DashboardPeriodInput = {}): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(`${this.base}/overview`, {
      params: queryParams({ ...input }),
    });
  }

  getLayerUsage(input: GetLayerUsageInput = {}): Observable<PagedResult<LayerUsage>> {
    return this.http.get<PagedResult<LayerUsage>>(`${this.base}/layer-usage`, {
      params: queryParams({ ...input }),
    });
  }

  getLayerAnalytics(layerId: string, input: DashboardPeriodInput = {}): Observable<LayerAnalytics> {
    return this.http.get<LayerAnalytics>(`${this.base}/layers/${layerId}/analytics`, {
      params: queryParams({ ...input }),
    });
  }

  getClientUsage(input: GetClientUsageInput = {}): Observable<PagedResult<ClientUsage>> {
    return this.http.get<PagedResult<ClientUsage>>(`${this.base}/client-usage`, {
      params: queryParams({ ...input }),
    });
  }

  getClientAnalytics(
    apiClientId: string,
    input: DashboardPeriodInput = {}
  ): Observable<ClientAnalytics> {
    return this.http.get<ClientAnalytics>(`${this.base}/clients/${apiClientId}/analytics`, {
      params: queryParams({ ...input }),
    });
  }

  getRequestLogs(input: GetRequestLogsInput = {}): Observable<PagedResult<RequestLog>> {
    return this.http.get<PagedResult<RequestLog>>(`${this.base}/request-logs`, {
      params: queryParams({ ...input }),
    });
  }

  /**
   * Downloads the audit log. `responseType: 'blob'` is what keeps `HttpClient` from parsing an
   * XLSX as JSON; the caller is responsible for handing the blob to the browser.
   */
  exportRequestLogs(
    input: GetRequestLogsInput,
    format: RequestLogExportFormat
  ): Observable<Blob> {
    return this.http.get(`${this.base}/request-logs/export`, {
      params: queryParams({ ...input, format }),
      responseType: 'blob',
    });
  }

  getIncidents(input: GetIncidentsInput = {}): Observable<PagedResult<Incident>> {
    return this.http.get<PagedResult<Incident>>(`${this.base}/incidents`, {
      params: queryParams({ ...input }),
    });
  }

  getIncident(id: string): Observable<Incident> {
    return this.http.get<Incident>(`${this.base}/incidents/${id}`);
  }

  updateIncidentStatus(id: string, input: UpdateIncidentStatus): Observable<Incident> {
    return this.http.put<Incident>(`${this.base}/incidents/${id}/status`, input);
  }

  getHealthOverview(): Observable<HealthOverview> {
    return this.http.get<HealthOverview>(`${this.base}/health`);
  }

  getLayerHealth(layerId: string): Observable<LayerHealth> {
    return this.http.get<LayerHealth>(`${this.base}/health/layers/${layerId}`);
  }

  /** Synchronous on the server: it probes every named layer before it answers. */
  runHealthCheck(layerIds?: string[]): Observable<LayerHealth[]> {
    return this.http.post<LayerHealth[]>(`${this.base}/health/run`, { layerIds: layerIds ?? null });
  }
}

/**
 * Hands a downloaded blob to the browser.
 *
 * The object URL is revoked on the next macrotask rather than immediately: Safari and Firefox
 * both abandon the download if the URL is revoked in the same tick as the synthetic click.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
