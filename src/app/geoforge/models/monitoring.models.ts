/**
 * GeoForge monitoring & analytics wire models.
 *
 * Hand-written for the same reason as `geoforge.models.ts`: the GeoForge endpoints are explicit
 * controllers, so `abp generate-proxy` would name them after the generated route rather than the
 * published contract.
 *
 * Enum members mirror the persisted byte values in `TecSolution.GeoForge.Monitoring`. They must
 * never be renumbered on either side independently.
 */

import { LayerGeometryType, LayerPublishStatus } from './geoforge.models';

export enum GeoForgeOperation {
  Unknown = 0,
  EsriServiceMetadata = 1,
  EsriLayerMetadata = 2,
  EsriQuery = 3,
  OgcLandingPage = 10,
  OgcConformance = 11,
  OgcCollections = 12,
  OgcCollection = 13,
  OgcItems = 14,
  OgcFeature = 15,
  Query = 20,
  Feature = 21,
  Count = 22,
  Statistics = 23,
  VectorTile = 30,
  TileJson = 31,
  TokenIssue = 40,
  LayerCatalog = 50,
  Publish = 51,
  Unpublish = 52,
  Import = 53,
  Upload = 54,
  Probe = 55,
  Discover = 56,
  Admin = 57,
  Monitoring = 60,
}

export enum GeoForgeAuthenticationType {
  Anonymous = 0,
  ApiClientToken = 1,
  User = 2,
}

export enum IncidentSeverity {
  Information = 0,
  Warning = 1,
  Critical = 2,
}

export enum IncidentStatus {
  Open = 0,
  Investigating = 1,
  Resolved = 2,
  Ignored = 3,
}

export enum LayerHealthStatus {
  Healthy = 0,
  Degraded = 1,
  Unavailable = 2,
}

export enum HealthCheckType {
  Composite = 0,
  Metadata = 1,
  PhysicalTable = 2,
  GeometryColumn = 3,
  ObjectIdField = 4,
  Srid = 5,
  FeatureCount = 6,
  QueryResponse = 7,
}

export enum TokenAuditAction {
  Issue = 0,
  Validate = 1,
  Revoke = 2,
}

/** Observed from traffic, unlike `LayerHealthStatus`, which is probed. */
export enum LayerUsageHealth {
  NoActivity = 0,
  Healthy = 1,
  Warning = 2,
  Critical = 3,
}

export enum KpiTrend {
  Flat = 0,
  Up = 1,
  Down = 2,
}

export enum LayerUsageSort {
  MostUsed = 0,
  LeastUsed = 1,
  HighestErrors = 2,
  SlowestResponse = 3,
  RecentlyAccessed = 4,
}

export enum RequestLogExportFormat {
  Csv = 0,
  Excel = 1,
}

// ---------------------------------------------------------------------------
//  Primitives
// ---------------------------------------------------------------------------

export interface Kpi {
  value: number;
  previousValue?: number;
  /** Null when there is no prior value, or the prior value was zero. Never rendered as infinity. */
  changePercent?: number;
  trend: KpiTrend;
  isEmpty: boolean;
}

export interface TimeSeriesPoint {
  timestamp: string;
  count: number;
  successCount: number;
  failureCount: number;
  averageResponseTimeMs: number;
}

export interface CategoryCount {
  key: string;
  numericKey: number;
  count: number;
}

export interface DashboardPeriodInput {
  fromUtc?: string;
  toUtc?: string;
}

// ---------------------------------------------------------------------------
//  Overview
// ---------------------------------------------------------------------------

export interface IncidentSummary {
  open: number;
  investigating: number;
  critical: number;
  resolvedInPeriod: number;
}

export interface DashboardOverview {
  fromUtc: string;
  toUtc: string;
  previousFromUtc: string;
  previousToUtc: string;
  monitoringEnabled: boolean;

  totalLayers: Kpi;
  publishedLayers: Kpi;
  privateLayers: Kpi;
  unpublishedLayers: Kpi;

  totalClients: Kpi;
  enabledClients: Kpi;
  disabledClients: Kpi;

  totalRequests: Kpi;
  successfulRequests: Kpi;
  failedRequests: Kpi;
  requestsToday: Kpi;
  requestsThisMonth: Kpi;
  averageResponseTimeMs: Kpi;
  errorRatePercent: Kpi;

  totalTokensGenerated: Kpi;
  activeTokens: Kpi;

  requestsOverTime: TimeSeriesPoint[];
  requestsByOperation: CategoryCount[];
  requestsByStatusCode: CategoryCount[];

  health: HealthOverview;
  incidents: IncidentSummary;
}

// ---------------------------------------------------------------------------
//  Layer usage
// ---------------------------------------------------------------------------

export interface GetLayerUsageInput extends DashboardPeriodInput {
  layerId?: string;
  apiClientId?: string;
  publishStatus?: LayerPublishStatus;
  isPublic?: boolean;
  isSuccessful?: boolean;
  statusCode?: number;
  authenticationType?: GeoForgeAuthenticationType;
  filter?: string;
  sort?: LayerUsageSort;
  skipCount?: number;
  maxResultCount?: number;
}

export interface LayerUsage {
  layerId: string;
  name: string;
  displayName: string;
  geometryType: LayerGeometryType;
  publishStatus: LayerPublishStatus;
  isPublic: boolean;
  requiresAuthentication: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  uniqueClientCount: number;
  averageResponseTimeMs: number;
  errorRatePercent: number;
  lastAccessedAt?: string;
  lastErrorAt?: string;
  usageHealth: LayerUsageHealth;
  probedHealth?: LayerHealthStatus;
}

export interface ClientUsageSlice {
  apiClientId?: string;
  clientId?: string;
  clientName?: string;
  totalRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  lastAccessedAt?: string;
}

export interface LayerUsageSlice {
  layerId: string;
  name: string;
  displayName: string;
  totalRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  lastAccessedAt?: string;
  isGranted: boolean;
}

export interface LayerAnalytics {
  layerId: string;
  name: string;
  displayName: string;
  geometryType: LayerGeometryType;
  publishStatus: LayerPublishStatus;
  isPublic: boolean;
  fromUtc: string;
  toUtc: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  uniqueClientCount: number;
  averageResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  errorRatePercent: number;
  requestsByDay: TimeSeriesPoint[];
  requestsByHour: TimeSeriesPoint[];
  requestsByOperation: CategoryCount[];
  requestsByStatusCode: CategoryCount[];
  topClients: ClientUsageSlice[];
  recentErrors: RequestLog[];
  lastSuccessfulRequest?: RequestLog;
  lastFailedRequest?: RequestLog;
  health?: LayerHealth;
}

// ---------------------------------------------------------------------------
//  Clients
// ---------------------------------------------------------------------------

export interface GetClientUsageInput extends DashboardPeriodInput {
  apiClientId?: string;
  layerId?: string;
  isEnabled?: boolean;
  filter?: string;
  skipCount?: number;
  maxResultCount?: number;
}

export interface ClientUsage {
  apiClientId: string;
  clientId: string;
  name: string;
  isEnabled: boolean;
  expiresAt?: string;
  assignedLayerCount: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  tokensGenerated: number;
  lastTokenGeneratedAt?: string;
  lastUsedAt?: string;
  lastIpAddress?: string;
  averageResponseTimeMs: number;
  errorRatePercent: number;
}

export interface TokenAuditEntry {
  id: string;
  creationTime: string;
  action: TokenAuditAction;
  wasSuccessful: boolean;
  tokenFingerprint?: string;
  expiresAt?: string;
  ipAddress?: string;
  userAgent?: string;
  failureReason?: string;
}

export interface IpActivity {
  ipAddress: string;
  requestCount: number;
  lastSeenAt: string;
}

export interface ClientAnalytics {
  apiClientId: string;
  clientId: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  expiresAt?: string;
  creationTime: string;
  fromUtc: string;
  toUtc: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
  errorRatePercent: number;
  assignedLayers: LayerUsageSlice[];
  requestsPerLayer: LayerUsageSlice[];
  mostUsedLayer?: LayerUsageSlice;
  leastUsedAssignedLayer?: LayerUsageSlice;
  tokenHistory: TokenAuditEntry[];
  tokensGenerated: number;
  lastTokenGeneratedAt?: string;
  lastActivityAt?: string;
  recentIpAddresses: IpActivity[];
  failedAuthenticationAttempts: number;
  accessDeniedAttempts: number;
  expiredTokenAttempts: number;
  requestsOverTime: TimeSeriesPoint[];
  recentErrors: RequestLog[];
}

// ---------------------------------------------------------------------------
//  Audit log
// ---------------------------------------------------------------------------

export interface GetRequestLogsInput extends DashboardPeriodInput {
  layerId?: string;
  apiClientId?: string;
  isSuccessful?: boolean;
  httpMethod?: string;
  statusCode?: number;
  errorCode?: string;
  operation?: GeoForgeOperation;
  authenticationType?: GeoForgeAuthenticationType;
  ipAddress?: string;
  correlationId?: string;
  filter?: string;
  skipCount?: number;
  maxResultCount?: number;
}

export interface RequestLog {
  id: string;
  creationTime: string;
  layerId?: string;
  layerName?: string;
  apiClientId?: string;
  clientId?: string;
  clientName?: string;
  /** A truncated SHA-256 of the presented token. The token itself is never stored. */
  tokenFingerprint?: string;
  endpoint: string;
  httpMethod: string;
  operation: GeoForgeOperation;
  queryString?: string;
  statusCode: number;
  isSuccessful: boolean;
  responseTimeMs: number;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  traceId?: string;
  errorCode?: string;
  errorMessage?: string;
  exceptionType?: string;
  authenticationType: GeoForgeAuthenticationType;
  environment?: string;
}

// ---------------------------------------------------------------------------
//  Incidents
// ---------------------------------------------------------------------------

export interface GetIncidentsInput extends DashboardPeriodInput {
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  layerId?: string;
  apiClientId?: string;
  errorCode?: string;
  filter?: string;
  skipCount?: number;
  maxResultCount?: number;
}

export interface Incident {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description?: string;
  layerId?: string;
  layerName?: string;
  apiClientId?: string;
  clientId?: string;
  errorCode?: string;
  exceptionType?: string;
  endpoint?: string;
  /** Present only for callers holding `GeoForge.Incidents.Manage`. */
  stackTrace?: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  occurrenceCount: number;
  lastCorrelationId?: string;
  assignedTo?: string;
  assignedToUserName?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  creationTime: string;
}

export interface UpdateIncidentStatus {
  status: IncidentStatus;
  assignedTo?: string;
  resolutionNotes?: string;
}

// ---------------------------------------------------------------------------
//  Health
// ---------------------------------------------------------------------------

export interface LayerHealthCheck {
  checkType: HealthCheckType;
  status: LayerHealthStatus;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
  checkedAt: string;
}

export interface LayerHealth {
  layerId: string;
  name: string;
  displayName: string;
  /** Undefined when the layer has never been probed. Not the same as healthy. */
  status?: LayerHealthStatus;
  checkedAt?: string;
  responseTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
  checks: LayerHealthCheck[];
}

export interface HealthOverview {
  healthy: number;
  degraded: number;
  unavailable: number;
  neverChecked: number;
  lastCheckedAt?: string;
  layers: LayerHealth[];
}

// ---------------------------------------------------------------------------
//  Localization keys
//
//  Enum → localization key. Kept beside the enums so a new member is a compile error here
//  rather than a blank cell in the table.
// ---------------------------------------------------------------------------

export const OPERATION_KEYS: Record<GeoForgeOperation, string> = {
  [GeoForgeOperation.Unknown]: '::GeoForge:Operation:Unknown',
  [GeoForgeOperation.EsriServiceMetadata]: '::GeoForge:Operation:EsriServiceMetadata',
  [GeoForgeOperation.EsriLayerMetadata]: '::GeoForge:Operation:EsriLayerMetadata',
  [GeoForgeOperation.EsriQuery]: '::GeoForge:Operation:EsriQuery',
  [GeoForgeOperation.OgcLandingPage]: '::GeoForge:Operation:OgcLandingPage',
  [GeoForgeOperation.OgcConformance]: '::GeoForge:Operation:OgcConformance',
  [GeoForgeOperation.OgcCollections]: '::GeoForge:Operation:OgcCollections',
  [GeoForgeOperation.OgcCollection]: '::GeoForge:Operation:OgcCollection',
  [GeoForgeOperation.OgcItems]: '::GeoForge:Operation:OgcItems',
  [GeoForgeOperation.OgcFeature]: '::GeoForge:Operation:OgcFeature',
  [GeoForgeOperation.Query]: '::GeoForge:Operation:Query',
  [GeoForgeOperation.Feature]: '::GeoForge:Operation:Feature',
  [GeoForgeOperation.Count]: '::GeoForge:Operation:Count',
  [GeoForgeOperation.Statistics]: '::GeoForge:Operation:Statistics',
  [GeoForgeOperation.VectorTile]: '::GeoForge:Operation:VectorTile',
  [GeoForgeOperation.TileJson]: '::GeoForge:Operation:TileJson',
  [GeoForgeOperation.TokenIssue]: '::GeoForge:Operation:TokenIssue',
  [GeoForgeOperation.LayerCatalog]: '::GeoForge:Operation:LayerCatalog',
  [GeoForgeOperation.Publish]: '::GeoForge:Operation:Publish',
  [GeoForgeOperation.Unpublish]: '::GeoForge:Operation:Unpublish',
  [GeoForgeOperation.Import]: '::GeoForge:Operation:Import',
  [GeoForgeOperation.Upload]: '::GeoForge:Operation:Upload',
  [GeoForgeOperation.Probe]: '::GeoForge:Operation:Probe',
  [GeoForgeOperation.Discover]: '::GeoForge:Operation:Discover',
  [GeoForgeOperation.Admin]: '::GeoForge:Operation:Admin',
  [GeoForgeOperation.Monitoring]: '::GeoForge:Operation:Monitoring',
};

export const AUTH_TYPE_KEYS: Record<GeoForgeAuthenticationType, string> = {
  [GeoForgeAuthenticationType.Anonymous]: '::GeoForge:AuthType:Anonymous',
  [GeoForgeAuthenticationType.ApiClientToken]: '::GeoForge:AuthType:ApiClientToken',
  [GeoForgeAuthenticationType.User]: '::GeoForge:AuthType:User',
};

export const SEVERITY_KEYS: Record<IncidentSeverity, string> = {
  [IncidentSeverity.Information]: '::GeoForge:Severity:Information',
  [IncidentSeverity.Warning]: '::GeoForge:Severity:Warning',
  [IncidentSeverity.Critical]: '::GeoForge:Severity:Critical',
};

export const INCIDENT_STATUS_KEYS: Record<IncidentStatus, string> = {
  [IncidentStatus.Open]: '::GeoForge:IncidentStatus:Open',
  [IncidentStatus.Investigating]: '::GeoForge:IncidentStatus:Investigating',
  [IncidentStatus.Resolved]: '::GeoForge:IncidentStatus:Resolved',
  [IncidentStatus.Ignored]: '::GeoForge:IncidentStatus:Ignored',
};

export const HEALTH_STATUS_KEYS: Record<LayerHealthStatus, string> = {
  [LayerHealthStatus.Healthy]: '::GeoForge:Health:Healthy',
  [LayerHealthStatus.Degraded]: '::GeoForge:Health:Degraded',
  [LayerHealthStatus.Unavailable]: '::GeoForge:Health:Unavailable',
};

export const CHECK_TYPE_KEYS: Record<HealthCheckType, string> = {
  [HealthCheckType.Composite]: '::GeoForge:CheckType:Composite',
  [HealthCheckType.Metadata]: '::GeoForge:CheckType:Metadata',
  [HealthCheckType.PhysicalTable]: '::GeoForge:CheckType:PhysicalTable',
  [HealthCheckType.GeometryColumn]: '::GeoForge:CheckType:GeometryColumn',
  [HealthCheckType.ObjectIdField]: '::GeoForge:CheckType:ObjectIdField',
  [HealthCheckType.Srid]: '::GeoForge:CheckType:Srid',
  [HealthCheckType.FeatureCount]: '::GeoForge:CheckType:FeatureCount',
  [HealthCheckType.QueryResponse]: '::GeoForge:CheckType:QueryResponse',
};

export const USAGE_HEALTH_KEYS: Record<LayerUsageHealth, string> = {
  [LayerUsageHealth.NoActivity]: '::GeoForge:UsageHealth:NoActivity',
  [LayerUsageHealth.Healthy]: '::GeoForge:UsageHealth:Healthy',
  [LayerUsageHealth.Warning]: '::GeoForge:UsageHealth:Warning',
  [LayerUsageHealth.Critical]: '::GeoForge:UsageHealth:Critical',
};

export const TOKEN_ACTION_KEYS: Record<TokenAuditAction, string> = {
  [TokenAuditAction.Issue]: '::GeoForge:TokenAction:Issue',
  [TokenAuditAction.Validate]: '::GeoForge:TokenAction:Validate',
  [TokenAuditAction.Revoke]: '::GeoForge:TokenAction:Revoke',
};
