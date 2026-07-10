/**
 * GeoForge wire models.
 *
 * These mirror the DTOs in `TecSolution.GeoForge.*` on the server. They are hand-written
 * rather than generated because the GeoForge endpoints are explicit controllers (they have to
 * match the OGC and Esri specifications), so `abp generate-proxy` would produce names that
 * drift from the published API contract.
 */

export enum LayerGeometryType {
  Unknown = 0,
  Point = 1,
  MultiPoint = 2,
  LineString = 3,
  MultiLineString = 4,
  Polygon = 5,
  MultiPolygon = 6,
  GeometryCollection = 7,
}

export enum LayerPublishStatus {
  Draft = 0,
  Published = 1,
  Deprecated = 2,
  Archived = 3,
}

export enum LayerFieldDataType {
  Text = 0,
  Integer = 1,
  BigInt = 2,
  Double = 3,
  Boolean = 4,
  Date = 5,
  Timestamp = 6,
}

/** How confidently the SRID was established. `Inferred` must be badged in the UI. */
export enum SridSource {
  None = 0,
  PrjFile = 1,
  CrsMember = 2,
  FormatDefault = 3,
  UserOverride = 4,
  Inferred = 5,
}

export enum DataSourceStatus {
  Draft = 0,
  Validated = 1,
  Imported = 2,
  Failed = 3,
}

export enum ImportJobStatus {
  Queued = 0,
  Probing = 1,
  Validating = 2,
  Creating = 3,
  Loading = 4,
  Indexing = 5,
  Publishing = 6,
  Succeeded = 7,
  Failed = 8,
  Cancelled = 9,
}

export enum ImportLogLevel {
  Trace = 0,
  Debug = 1,
  Information = 2,
  Warning = 3,
  Error = 4,
}

export enum ImportMode {
  CreateNew = 0,
  ReplaceExisting = 1,
}

export interface Extent {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface UploadResult {
  dataSourceId: string;
  originalFileName: string;
  fileSizeBytes: number;
  contentHash: string;
  detectedSourceType: string;
}

export interface DataSource {
  id: string;
  name: string;
  sourceType: string;
  configurationJson: string;
  originalFileName?: string;
  fileSizeBytes: number;
  contentHash?: string;
  status: DataSourceStatus;
  lastProbedAt?: string;
  hasPayload: boolean;
  creationTime: string;
}

export interface ValidationIssue {
  code: string;
  message: string;
  count: number;
}

export interface ProbeField {
  originalName: string;
  normalizedName: string;
  dataType: LayerFieldDataType;
  isNullable: boolean;
  sampleValues: (string | null)[];
}

/** Result of the dry run. `blockingIssues` non-empty means the import cannot proceed. */
export interface SourceProbeResult {
  fields: ProbeField[];
  geometryType: LayerGeometryType;
  promotedGeometryType: LayerGeometryType;
  detectedSrid?: number;
  sridSource: SridSource;
  sridIsConfident: boolean;
  estimatedFeatureCount?: number;
  nativeExtent?: Extent;
  warnings: ValidationIssue[];
  blockingIssues: ValidationIssue[];
}

export interface ImportRequest {
  layerName?: string;
  displayName?: string;
  description?: string;
  mode: ImportMode;
  targetLayerId?: string;
  sridOverride?: number;
  indexedFields: string[];
  rejectThresholdPercent: number;
  autoPublish: boolean;
}

export interface ImportJob {
  id: string;
  dataSourceId: string;
  dataSourceName?: string;
  gisLayerId?: string;
  layerName?: string;
  status: ImportJobStatus;
  progressPercent: number;
  featuresRead: number;
  featuresWritten: number;
  featuresRejected: number;
  attemptCount: number;
  cancellationRequested: boolean;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  creationTime: string;
}

export interface ImportJobLog {
  id: string;
  importJobId: string;
  level: ImportLogLevel;
  stage: string;
  code: string;
  message: string;
  contextJson?: string;
  timestamp: string;
}

export interface LayerField {
  id: string;
  name: string;
  alias: string;
  dataType: LayerFieldDataType;
  jsonType: string;
  esriType: string;
  isNullable: boolean;
  isIndexed: boolean;
  isVisible: boolean;
  displayOrder: number;
}

export interface LayerStyle {
  id: string;
  dialect: string;
  isDefault: boolean;
  definitionJson: string;
}

/** Every URL a consuming application needs, fully qualified by the server. */
export interface LayerEndpoints {
  ogcFeatures: string;
  geoJson: string;
  vectorTiles: string;
  tileJson: string;
  esriFeatureServer: string;
}

export interface GisLayerListItem {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  geometryType: LayerGeometryType;
  srid: number;
  featureCount: number;
  publishStatus: LayerPublishStatus;
  isPublic: boolean;
  version: number;
  publishedAt?: string;
  extent?: Extent;
  creationTime: string;
}

export interface GisLayer extends GisLayerListItem {
  dataSourceId?: string;
  nativeSrid: number;
  sridIsInferred: boolean;
  isSensitive: boolean;
  maxRecordCount: number;
  objectIdField: string;
  fields: LayerField[];
  styles: LayerStyle[];
  endpoints?: LayerEndpoints;
  /** Empty when the layer is publishable; otherwise the reasons it is not. */
  publishBlockers: string[];
}

export interface PagedResult<T> {
  totalCount: number;
  items: T[];
}

// ---- Display helpers -------------------------------------------------------

export const GEOMETRY_TYPE_LABELS: Record<LayerGeometryType, string> = {
  [LayerGeometryType.Unknown]: 'Unknown',
  [LayerGeometryType.Point]: 'Point',
  [LayerGeometryType.MultiPoint]: 'MultiPoint',
  [LayerGeometryType.LineString]: 'LineString',
  [LayerGeometryType.MultiLineString]: 'MultiLineString',
  [LayerGeometryType.Polygon]: 'Polygon',
  [LayerGeometryType.MultiPolygon]: 'MultiPolygon',
  [LayerGeometryType.GeometryCollection]: 'GeometryCollection',
};

export const FIELD_TYPE_LABELS: Record<LayerFieldDataType, string> = {
  [LayerFieldDataType.Text]: 'text',
  [LayerFieldDataType.Integer]: 'integer',
  [LayerFieldDataType.BigInt]: 'bigint',
  [LayerFieldDataType.Double]: 'double',
  [LayerFieldDataType.Boolean]: 'boolean',
  [LayerFieldDataType.Date]: 'date',
  [LayerFieldDataType.Timestamp]: 'timestamp',
};

export const PUBLISH_STATUS_LABELS: Record<LayerPublishStatus, string> = {
  [LayerPublishStatus.Draft]: 'Draft',
  [LayerPublishStatus.Published]: 'Published',
  [LayerPublishStatus.Deprecated]: 'Deprecated',
  [LayerPublishStatus.Archived]: 'Archived',
};

export const IMPORT_STATUS_LABELS: Record<ImportJobStatus, string> = {
  [ImportJobStatus.Queued]: 'Queued',
  [ImportJobStatus.Probing]: 'Probing',
  [ImportJobStatus.Validating]: 'Validating',
  [ImportJobStatus.Creating]: 'Creating table',
  [ImportJobStatus.Loading]: 'Loading features',
  [ImportJobStatus.Indexing]: 'Indexing',
  [ImportJobStatus.Publishing]: 'Publishing',
  [ImportJobStatus.Succeeded]: 'Succeeded',
  [ImportJobStatus.Failed]: 'Failed',
  [ImportJobStatus.Cancelled]: 'Cancelled',
};

export function isTerminalStatus(status: ImportJobStatus): boolean {
  return (
    status === ImportJobStatus.Succeeded ||
    status === ImportJobStatus.Failed ||
    status === ImportJobStatus.Cancelled
  );
}

/** Source types with a reader shipped in this release. Others are rejected server-side. */
export const IMPLEMENTED_SOURCE_TYPES = [
  'shapefile',
  'geojson',
  'csv',
  'gdb',
  'esri-feature-layer',
  'esri-map-service',
  'geojson-url',
  'ogc-api-features',
];

// ---- Remote data sources ---------------------------------------------------

/** How GeoForge authenticates against a remote service. Mirrors RemoteAuthType on the server. */
export enum RemoteAuthType {
  None = 0,
  UsernamePassword = 1,
  Token = 2,
  OAuth2ClientCredentials = 3,
  BearerToken = 4,
  BasicAuth = 5,
}

/** The write-only credential input. No API ever returns these fields. */
export interface RemoteCredentialInput {
  authType: RemoteAuthType;
  username?: string;
  password?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  tokenEndpoint?: string;
  expiresAt?: string;
}

export interface CreateRemoteDataSource {
  name: string;
  sourceType: string;
  url: string;
  layerId?: number;
  collectionId?: string;
  where?: string;
  outFields?: string;
  credential?: RemoteCredentialInput;
}

export interface RemoteLayerSummary {
  id: number;
  name: string;
  geometryType: string;
  type?: string;
}

export interface RemoteLayerDetail {
  id: number;
  name: string;
  geometryType: LayerGeometryType;
  srid?: number;
  featureCount?: number;
  maxRecordCount?: number;
  objectIdField?: string;
  supportsPagination: boolean;
  fields: ProbeField[];
}

/** Result of "validate connection and preview". */
export interface RemoteServiceMetadata {
  reachable: boolean;
  authenticated: boolean;
  layers: RemoteLayerSummary[];
  selectedLayer?: RemoteLayerDetail;
  message?: string;
}

// ---- API clients (machine-to-machine access) -------------------------------

/** Stored lifecycle state. `Expired` is derived, not stored — see `ApiClientEffectiveStatus`. */
export enum ApiClientStatus {
  Active = 0,
  Suspended = 1,
  Revoked = 2,
}

/** The status as a caller experiences it, with expiry folded in. What the UI renders. */
export enum ApiClientEffectiveStatus {
  Active = 0,
  Suspended = 1,
  Revoked = 2,
  Expired = 3,
}

export enum ClientQuotaType {
  Unlimited = 0,
  Limited = 1,
}

export enum QuotaResetPolicy {
  Never = 0,
  Daily = 1,
  Monthly = 2,
  Custom = 3,
}

export enum ClientEnvironment {
  Unspecified = 0,
  Development = 1,
  Staging = 2,
  Production = 3,
}

/** Admin actions recorded in a client's audit log. Mirrors ClientAuditAction on the server. */
export enum ClientAuditAction {
  Created = 0,
  Updated = 1,
  Activated = 2,
  Suspended = 3,
  Revoked = 4,
  SecretRotated = 5,
  QuotaChanged = 6,
  QuotaReset = 7,
  LayerAccessGranted = 8,
  LayerAccessRevoked = 9,
  LayerAccessToggled = 10,
  IpRestrictionsChanged = 11,
  ExpirationChanged = 12,
  RateLimitChanged = 13,
  Deleted = 14,
}

/** A layer an API client may read, with its per-layer counters. */
export interface ApiClientLayer {
  layerId: string;
  name: string;
  displayName: string;
  layerStatus?: string;
  isEnabled: boolean;
  grantedAt: string;
  grantedBy?: string;
  quotaLimit?: number;
  usedRequests: number;
  lastAccessedAt?: string;
}

/** An API client as any read API returns it. The secret is never present here. */
export interface ApiClient {
  id: string;
  name: string;
  clientId: string;
  description?: string;
  status: ApiClientStatus;
  effectiveStatus: ApiClientEffectiveStatus;
  expiresAt?: string;
  lastUsedAt?: string;
  secretHint?: string;
  lastSecretRotatedAt?: string;

  quotaType: ClientQuotaType;
  quotaLimit?: number;
  usedRequests: number;
  remainingRequests?: number;
  quotaUsagePercent?: number;
  isQuotaExhausted: boolean;
  quotaResetPolicy: QuotaResetPolicy;
  quotaResetPeriodDays?: number;
  lastQuotaResetAt?: string;
  nextQuotaResetAt?: string;

  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  allowedIpAddresses?: string;
  notes?: string;
  environment: ClientEnvironment;
  tags?: string;
  contactName?: string;
  contactEmail?: string;

  notificationEmail?: string;
  notificationContactName?: string;
  notifyOnPermissionChange?: boolean;
  notifyOnLayerAccessChange?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnQuotaChange?: boolean;

  grantedLayers: ApiClientLayer[];
  grantedLayerCount: number;
  creationTime: string;
  creatorId?: string;
  lastModificationTime?: string;
  lastModifierId?: string;
}

/** A candidate row for the layer page's "choose an existing client" picker. */
export interface AvailableClient {
  id: string;
  name: string;
  clientId: string;
  effectiveStatus: ApiClientEffectiveStatus;
  quotaType: ClientQuotaType;
  quotaLimit?: number;
  usedRequests: number;
  remainingRequests?: number;
  grantedLayerCount: number;
  isAlreadyGranted: boolean;
  isSelectable: boolean;
}

/** A client that reads one layer, as the layer detail page's grants table shows it. */
export interface LayerClient {
  id: string;
  name: string;
  clientId: string;
  effectiveStatus: ApiClientEffectiveStatus;
  quotaType: ClientQuotaType;
  quotaLimit?: number;
  usedRequests: number;
  remainingRequests?: number;
  isAccessEnabled: boolean;
  requestsToThisLayer: number;
  lastAccessedAt?: string;
  grantedAt: string;
  grantedBy?: string;
}

export interface ClientAuditLog {
  id: string;
  apiClientId: string;
  clientIdentifier: string;
  action: ClientAuditAction;
  layerId?: string;
  layerName?: string;
  oldValue?: string;
  newValue?: string;
  actorUserId?: string;
  actorUserName?: string;
  ipAddress?: string;
  creationTime: string;
}

/** Returned exactly once, by create and by rotate. The secret is not recoverable afterwards. */
export interface ApiClientSecret {
  client: ApiClient;
  secret: string;
}

/** An API client as any read API returns it, plus the notification-preference fields. */
export interface ApiClientNotificationPrefs {
  notificationEmail?: string;
  notificationContactName?: string;
  notifyOnPermissionChange: boolean;
  notifyOnLayerAccessChange: boolean;
  notifyOnStatusChange: boolean;
  notifyOnQuotaChange: boolean;
}

export interface CreateApiClient {
  name: string;
  clientId?: string;
  secret?: string;
  description?: string;
  expiresAt?: string;
  isEnabled?: boolean;
  quotaType?: ClientQuotaType;
  quotaLimit?: number;
  quotaResetPolicy?: QuotaResetPolicy;
  quotaResetPeriodDays?: number;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  allowedIpAddresses?: string;
  notes?: string;
  environment?: ClientEnvironment;
  tags?: string;
  contactName?: string;
  contactEmail?: string;
  /** The create form's "Send client credentials by email" checkbox. Sent explicitly. */
  sendNotificationEmail?: boolean;
  grantedLayerIds: string[];
}

export interface UpdateApiClient {
  name: string;
  description?: string;
  expiresAt?: string;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  allowedIpAddresses?: string;
  notes?: string;
  environment: ClientEnvironment;
  tags?: string;
  contactName?: string;
  contactEmail?: string;
  // ---- Notification preferences ----
  notificationEmail?: string;
  notificationContactName?: string;
  notifyOnPermissionChange?: boolean;
  notifyOnLayerAccessChange?: boolean;
  notifyOnStatusChange?: boolean;
  notifyOnQuotaChange?: boolean;
  /** Operation-level switch: send the permissions-changed email when access settings change. */
  sendEmailNotification?: boolean;
}

export interface UpdateQuota {
  quotaType: ClientQuotaType;
  quotaLimit?: number;
  quotaResetPolicy?: QuotaResetPolicy;
  quotaResetPeriodDays?: number;
  /** Operation-level switch: send the quota-changed email. */
  sendEmailNotification?: boolean;
}

export interface GrantLayerAccess {
  layerId: string;
  quotaLimit?: number;
  /** Operation-level switch: send the layer-access-granted email. */
  sendEmailNotification?: boolean;
}

// ---- Email notifications ----------------------------------------------------

/** The outgoing-email account as the settings screen reads it. Never carries the password. */
export interface EmailSettings {
  displayName?: string;
  senderEmail?: string;
  smtpUsername?: string;
  /** True when a password is stored. The password itself is never returned. */
  hasPassword: boolean;
  smtpHost?: string;
  smtpPort: number;
  enableSsl: boolean;
  useDefaultCredentials: boolean;
  authenticationEnabled: boolean;
  connectionTimeout: number;
  portalUrl?: string;
  supportEmail?: string;
}

/** Changes to the outgoing-email account. A null/empty password keeps the stored one. */
export interface UpdateEmailSettings {
  displayName?: string;
  senderEmail?: string;
  smtpUsername?: string;
  password?: string;
  smtpHost?: string;
  smtpPort: number;
  enableSsl: boolean;
  useDefaultCredentials: boolean;
  authenticationEnabled: boolean;
  connectionTimeout: number;
  portalUrl?: string;
  supportEmail?: string;
}

export interface SendTestEmail {
  recipientEmail: string;
  settings: UpdateEmailSettings;
}

/** One predefined notification template as the editor reads it. */
export interface EmailTemplate {
  id: string;
  templateKey: string;
  displayName: string;
  description?: string;
  subject: string;
  body: string;
  isEnabled: boolean;
  isHtml: boolean;
  lastModificationTime?: string;
  lastModifierId?: string;
  creationTime: string;
  concurrencyStamp?: string;
  availablePlaceholders: string[];
}

export interface UpdateEmailTemplate {
  subject: string;
  body: string;
  isEnabled: boolean;
  isHtml: boolean;
  concurrencyStamp?: string;
}

export interface SendTemplatePreview {
  recipientEmail: string;
  subject?: string;
  body?: string;
  isHtml?: boolean;
}

/** The template key that carries the one-time secret in the creation email. */
export const CLIENT_ID_CREATED_TEMPLATE_KEY = 'ClientIdCreated';

/** The token endpoint's response. `accessToken` is opaque — the expiry is stated, not embedded. */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: string;
}

/** The source kinds the wizard offers, grouped by how the payload arrives. */
export interface SourceTypeOption {
  value: string;
  label: string;
  kind: 'file' | 'esri' | 'url';
  hint: string;
}

export const SOURCE_TYPE_OPTIONS: SourceTypeOption[] = [
  {
    value: 'file',
    label: 'Upload a file',
    kind: 'file',
    hint: 'Shapefile, GeoJSON, CSV or File Geodatabase',
  },
  {
    value: 'esri-feature-layer',
    label: 'ArcGIS Feature Service',
    kind: 'esri',
    hint: 'A .../FeatureServer/{n} layer URL',
  },
  {
    value: 'esri-map-service',
    label: 'ArcGIS Map Service',
    kind: 'esri',
    hint: 'A .../MapServer/{n} layer URL',
  },
  {
    value: 'geojson-url',
    label: 'GeoJSON URL',
    kind: 'url',
    hint: 'A URL returning a FeatureCollection',
  },
  {
    value: 'ogc-api-features',
    label: 'OGC API – Features',
    kind: 'url',
    hint: 'An OGC collection items URL',
  },
];

/** One uploadable file format. `value` is the server's `DataSourceType` discriminator. */
export interface FileFormatOption {
  value: string;
  label: string;
  hint: string;
  /** `accept` filter for the file input. */
  accept: string;
  /** True when the format is a container of several layers and needs the discovery step. */
  multiLayer?: boolean;
}

/**
 * The formats the upload step offers.
 *
 * The chosen `value` is sent to the upload endpoint as `sourceType`, because the extension
 * cannot distinguish a zipped Shapefile from a zipped File Geodatabase — both are `.zip`.
 */
export const FILE_FORMAT_OPTIONS: FileFormatOption[] = [
  {
    value: 'shapefile',
    label: 'Shapefile',
    hint: 'Zipped with its .dbf, .shx and .prj sidecars',
    accept: '.zip',
  },
  {
    value: 'geojson',
    label: 'GeoJSON',
    hint: 'A .geojson FeatureCollection',
    accept: '.geojson,.json',
  },
  {
    value: 'csv',
    label: 'CSV',
    hint: 'Point data with X/Y or WKT columns',
    accept: '.csv,.tsv,.txt',
  },
  {
    value: 'gdb',
    label: 'File Geodatabase (.gdb)',
    hint: 'The .gdb folder, zipped. Holds several feature classes',
    accept: '.zip',
    multiLayer: true,
  },
];
