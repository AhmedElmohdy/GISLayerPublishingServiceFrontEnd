import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiClient,
  ApiClientLayer,
  ApiClientSecret,
  AvailableClient,
  BulkLayerAccessResult,
  BulkLayerClients,
  ClientAuditLog,
  CreateApiClient,
  CreateRemoteDataSource,
  DataSource,
  EmailSettings,
  EmailTemplate,
  GisLayer,
  GisLayerListItem,
  GrantLayerAccess,
  ImportJob,
  ImportJobLog,
  ImportRequest,
  LayerClient,
  LayerField,
  LayerStyle,
  PagedResult,
  RemoteServiceMetadata,
  SendTemplatePreview,
  SendTestEmail,
  SourceProbeResult,
  UpdateApiClient,
  UpdateEmailSettings,
  UpdateEmailTemplate,
  UpdateQuota,
  UploadResult,
} from '../models/geoforge.models';

/**
 * HTTP access to the GeoForge API.
 *
 * `HttpClient` is used directly rather than ABP's `RestService` for one reason: the upload
 * endpoint takes multipart/form-data, and `RestService` sets a JSON content type. Requests
 * still pass through ABP's OAuth interceptor, so the bearer token is attached exactly as it
 * would be otherwise.
 */
/**
 * Builds query parameters, dropping any key whose value is absent.
 *
 * `HttpClient` stringifies a params object with `` `${value}` ``, so an `undefined` value is
 * sent as the literal six characters `undefined` — a present filter that matches nothing.
 * Every list endpoint here goes through this function so a call site cannot reintroduce it.
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

@Injectable({ providedIn: 'root' })
export class GeoForgeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apis.default.url}/api/geoforge`;

  // ---- Data sources --------------------------------------------------------

  /**
   * Stages a file and creates the data source wrapping it. The server hashes the payload
   * while it copies, and echoes back the source type it resolved.
   *
   * `sourceType` is sent whenever the wizard knows it, because the server cannot tell a zipped
   * Shapefile from a zipped File Geodatabase by extension alone.
   */
  upload(file: File, name?: string, sourceType?: string): Observable<UploadResult> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (name) {
      form.append('name', name);
    }
    if (sourceType) {
      form.append('sourceType', sourceType);
    }

    // Deliberately no Content-Type header: the browser must set the multipart boundary.
    return this.http.post<UploadResult>(`${this.base}/data-sources/upload`, form);
  }

  /**
   * Creates a remote data source — an ArcGIS service, a GeoJSON URL, or an OGC collection.
   * No file upload. The credential's secret half is write-only; no read ever returns it.
   */
  createRemote(input: CreateRemoteDataSource): Observable<DataSource> {
    return this.http.post<DataSource>(`${this.base}/data-sources/remote`, input);
  }

  /**
   * Validates and previews a multi-layer source: reachability, auth, the sub-layers it exposes,
   * and the selected layer's fields, geometry, SRID and feature count. Writes nothing.
   *
   * Answers for remote services and for a File Geodatabase's feature classes alike.
   */
  discover(id: string): Observable<RemoteServiceMetadata> {
    return this.http.post<RemoteServiceMetadata>(`${this.base}/data-sources/${id}/discover`, {});
  }

  getDataSource(id: string): Observable<DataSource> {
    return this.http.get<DataSource>(`${this.base}/data-sources/${id}`);
  }

  getDataSources(params: Record<string, unknown> = {}): Observable<PagedResult<DataSource>> {
    return this.http.get<PagedResult<DataSource>>(`${this.base}/data-sources`, {
      params: queryParams(params),
    });
  }

  /** Used to attach a CSV's X/Y binding and SRID before probing. */
  updateDataSource(id: string, name: string, configurationJson: string): Observable<DataSource> {
    return this.http.put<DataSource>(`${this.base}/data-sources/${id}`, {
      name,
      configurationJson,
    });
  }

  deleteDataSource(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/data-sources/${id}`);
  }

  /** Dry run. Nothing is written; this is where a wrong SRID gets caught. */
  probe(id: string): Observable<SourceProbeResult> {
    return this.http.post<SourceProbeResult>(`${this.base}/data-sources/${id}/probe`, {});
  }

  /** Returns 202 with the job. Replaying the same request returns the same job. */
  import(id: string, request: ImportRequest): Observable<ImportJob> {
    return this.http.post<ImportJob>(`${this.base}/data-sources/${id}/import`, request);
  }

  // ---- Layers --------------------------------------------------------------

  getLayers(params: Record<string, unknown> = {}): Observable<PagedResult<GisLayerListItem>> {
    return this.http.get<PagedResult<GisLayerListItem>>(`${this.base}/layers`, {
      params: queryParams(params),
    });
  }

  getLayer(id: string): Observable<GisLayer> {
    return this.http.get<GisLayer>(`${this.base}/layers/${id}`);
  }

  updateLayer(
    id: string,
    body: { displayName: string; description?: string; maxRecordCount: number },
  ): Observable<GisLayer> {
    return this.http.put<GisLayer>(`${this.base}/layers/${id}`, body);
  }

  setLayerAccess(id: string, isPublic: boolean, isSensitive: boolean): Observable<GisLayer> {
    return this.http.put<GisLayer>(`${this.base}/layers/${id}/access`, { isPublic, isSensitive });
  }

  publishLayer(id: string): Observable<GisLayer> {
    return this.http.post<GisLayer>(`${this.base}/layers/${id}/publish`, {});
  }

  unpublishLayer(id: string): Observable<GisLayer> {
    return this.http.post<GisLayer>(`${this.base}/layers/${id}/unpublish`, {});
  }

  deprecateLayer(id: string): Observable<GisLayer> {
    return this.http.post<GisLayer>(`${this.base}/layers/${id}/deprecate`, {});
  }

  deleteLayer(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/layers/${id}`);
  }

  getLayerFields(id: string): Observable<LayerField[]> {
    return this.http.get<LayerField[]>(`${this.base}/layers/${id}/fields`);
  }

  getLayerStyles(id: string): Observable<LayerStyle[]> {
    return this.http.get<LayerStyle[]>(`${this.base}/layers/${id}/styles`);
  }

  // ---- Import jobs ---------------------------------------------------------

  getImportJob(id: string): Observable<ImportJob> {
    return this.http.get<ImportJob>(`${this.base}/import-jobs/${id}`);
  }

  getImportJobs(params: Record<string, unknown> = {}): Observable<PagedResult<ImportJob>> {
    return this.http.get<PagedResult<ImportJob>>(`${this.base}/import-jobs`, {
      params: queryParams(params),
    });
  }

  getImportJobLogs(
    id: string,
    params: Record<string, unknown> = {},
  ): Observable<PagedResult<ImportJobLog>> {
    return this.http.get<PagedResult<ImportJobLog>>(`${this.base}/import-jobs/${id}/logs`, {
      params: queryParams(params),
    });
  }

  cancelImportJob(id: string): Observable<ImportJob> {
    return this.http.post<ImportJob>(`${this.base}/import-jobs/${id}/cancel`, {});
  }

  retryImportJob(id: string): Observable<ImportJob> {
    return this.http.post<ImportJob>(`${this.base}/import-jobs/${id}/retry`, {});
  }

  /** URL of the rejected-rows CSV. An import never silently drops data. */
  rejectedRowsUrl(id: string): string {
    return `${this.base}/import-jobs/${id}/rejected-rows`;
  }

  // ---- API clients ---------------------------------------------------------

  /** Clients granted a given layer. Used by the layer's Integration Helper tab. */
  getApiClients(params: Record<string, unknown> = {}): Observable<PagedResult<ApiClient>> {
    return this.http.get<PagedResult<ApiClient>>(`${this.base}/api-clients`, {
      params: queryParams(params),
    });
  }

  /**
   * Creates a client and returns its secret. This is the only response that ever carries it —
   * no later read will, so the caller must surface it immediately.
   */
  createApiClient(input: CreateApiClient): Observable<ApiClientSecret> {
    return this.http.post<ApiClientSecret>(`${this.base}/api-clients`, input);
  }

  getApiClient(id: string): Observable<ApiClient> {
    return this.http.get<ApiClient>(`${this.base}/api-clients/${id}`);
  }

  updateApiClient(id: string, input: UpdateApiClient): Observable<ApiClient> {
    return this.http.put<ApiClient>(`${this.base}/api-clients/${id}`, input);
  }

  /** Mints a new secret. Every token issued from the previous one stops working at once. */
  rotateApiClientSecret(id: string): Observable<ApiClientSecret> {
    return this.http.post<ApiClientSecret>(`${this.base}/api-clients/${id}/rotate-secret`, {});
  }

  deleteApiClient(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api-clients/${id}`);
  }

  // ---- Client status -------------------------------------------------------

  activateApiClient(id: string, sendEmailNotification = true): Observable<ApiClient> {
    return this.http.post<ApiClient>(`${this.base}/api-clients/${id}/activate`, {}, {
      params: queryParams({ sendEmailNotification }),
    });
  }

  suspendApiClient(id: string, sendEmailNotification = true): Observable<ApiClient> {
    return this.http.post<ApiClient>(`${this.base}/api-clients/${id}/suspend`, {}, {
      params: queryParams({ sendEmailNotification }),
    });
  }

  revokeApiClient(id: string, sendEmailNotification = true): Observable<ApiClient> {
    return this.http.post<ApiClient>(`${this.base}/api-clients/${id}/revoke`, {}, {
      params: queryParams({ sendEmailNotification }),
    });
  }

  bulkSuspendApiClients(ids: string[]): Observable<number> {
    return this.http.post<number>(`${this.base}/api-clients/bulk-suspend`, ids);
  }

  // ---- Client quota --------------------------------------------------------

  updateApiClientQuota(id: string, input: UpdateQuota): Observable<ApiClient> {
    return this.http.put<ApiClient>(`${this.base}/api-clients/${id}/quota`, input);
  }

  increaseApiClientQuota(id: string, additionalRequests: number): Observable<ApiClient> {
    return this.http.post<ApiClient>(`${this.base}/api-clients/${id}/quota/increase`, {
      additionalRequests,
    });
  }

  resetApiClientQuota(id: string): Observable<ApiClient> {
    return this.http.post<ApiClient>(`${this.base}/api-clients/${id}/quota/reset`, {});
  }

  // ---- Layer access --------------------------------------------------------

  /** Candidates for the layer page's "choose an existing client" picker. */
  getAvailableClientsForLayer(
    layerId: string,
    params: Record<string, unknown> = {},
  ): Observable<PagedResult<AvailableClient>> {
    return this.http.get<PagedResult<AvailableClient>>(
      `${this.base}/layers/${layerId}/available-clients`,
      { params: queryParams(params) },
    );
  }

  /** The clients that currently read a layer, with their per-layer counters. */
  getLayerClients(layerId: string): Observable<LayerClient[]> {
    return this.http.get<LayerClient[]>(`${this.base}/layers/${layerId}/clients`);
  }

  /** Grants one layer to several clients at once, reporting added / already-had / failed. */
  bulkGrantClientsToLayer(layerId: string, body: BulkLayerClients): Observable<BulkLayerAccessResult> {
    return this.http.post<BulkLayerAccessResult>(`${this.base}/layers/${layerId}/grant-bulk`, body);
  }

  /** Removes one layer from several clients at once. The body carries the client ids + email switch. */
  bulkRemoveClientsFromLayer(layerId: string, body: BulkLayerClients): Observable<BulkLayerAccessResult> {
    return this.http.delete<BulkLayerAccessResult>(`${this.base}/layers/${layerId}/remove-bulk`, { body });
  }

  getClientLayers(id: string): Observable<ApiClientLayer[]> {
    return this.http.get<ApiClientLayer[]>(`${this.base}/api-clients/${id}/layers`);
  }

  /** Grants one layer to one client. 409 when the grant already exists. */
  grantLayerAccess(id: string, input: GrantLayerAccess): Observable<ApiClientLayer> {
    return this.http.post<ApiClientLayer>(`${this.base}/api-clients/${id}/layers`, input);
  }

  revokeLayerAccess(id: string, layerId: string, sendEmailNotification = true): Observable<void> {
    return this.http.delete<void>(`${this.base}/api-clients/${id}/layers/${layerId}`, {
      params: queryParams({ sendEmailNotification }),
    });
  }

  setLayerAccessEnabled(id: string, layerId: string, isEnabled: boolean): Observable<ApiClientLayer> {
    return this.http.put<ApiClientLayer>(
      `${this.base}/api-clients/${id}/layers/${layerId}/enabled`,
      { isEnabled },
    );
  }

  bulkGrantLayerAccess(id: string, layerIds: string[]): Observable<number> {
    return this.http.post<number>(`${this.base}/api-clients/${id}/layers/bulk-grant`, { layerIds });
  }

  bulkRevokeLayerAccess(id: string, layerIds: string[]): Observable<number> {
    return this.http.post<number>(`${this.base}/api-clients/${id}/layers/bulk-revoke`, { layerIds });
  }

  // ---- Client audit --------------------------------------------------------

  getClientAuditLog(
    id: string,
    params: Record<string, unknown> = {},
  ): Observable<PagedResult<ClientAuditLog>> {
    return this.http.get<PagedResult<ClientAuditLog>>(`${this.base}/api-clients/${id}/audit-log`, {
      params: queryParams(params),
    });
  }

  // ---- Email settings ------------------------------------------------------

  getEmailSettings(): Observable<EmailSettings> {
    return this.http.get<EmailSettings>(`${this.base}/email-settings`);
  }

  updateEmailSettings(input: UpdateEmailSettings): Observable<EmailSettings> {
    return this.http.put<EmailSettings>(`${this.base}/email-settings`, input);
  }

  /** Sends a real test message using the supplied (possibly unsaved) settings. */
  sendTestEmail(input: SendTestEmail): Observable<void> {
    return this.http.post<void>(`${this.base}/email-settings/test`, input);
  }

  // ---- Email templates -----------------------------------------------------

  getEmailTemplates(): Observable<EmailTemplate[]> {
    return this.http.get<EmailTemplate[]>(`${this.base}/email-templates`);
  }

  getEmailTemplate(templateKey: string): Observable<EmailTemplate> {
    return this.http.get<EmailTemplate>(`${this.base}/email-templates/${templateKey}`);
  }

  updateEmailTemplate(templateKey: string, input: UpdateEmailTemplate): Observable<EmailTemplate> {
    return this.http.put<EmailTemplate>(`${this.base}/email-templates/${templateKey}`, input);
  }

  restoreEmailTemplate(templateKey: string): Observable<EmailTemplate> {
    return this.http.post<EmailTemplate>(`${this.base}/email-templates/${templateKey}/restore-default`, {});
  }

  sendTemplatePreview(templateKey: string, input: SendTemplatePreview): Observable<void> {
    return this.http.post<void>(`${this.base}/email-templates/${templateKey}/preview`, input);
  }

  /** The token endpoint external systems call. Exposed so the UI can name it in its examples. */
  get tokenUrl(): string {
    return `${this.base}/auth/token`;
  }
}
