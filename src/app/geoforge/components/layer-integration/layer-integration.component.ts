import {
  Component,
  DestroyRef,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../services/geoforge.service';
import {
  AvailableClient,
  ClientEnvironment,
  ClientQuotaType,
  CreateApiClient,
  GisLayer,
  LayerClient,
} from '../../models/geoforge.models';
import { STATUS_BADGE_CLASS, STATUS_LABEL_KEYS } from '../../models/client-display';

/** One copyable snippet in the step-by-step guide. */
interface Snippet {
  title: string;
  language: string;
  note?: string;
  code: string;
}

/** The create-new form's local state. Mirrors the fields the create DTO accepts. */
interface NewClientForm {
  name: string;
  description: string;
  quotaType: ClientQuotaType;
  quotaLimit: number | null;
  expires: boolean;
  expiresAt: string;
  enabled: boolean;
  allowedIpAddresses: string;
  notes: string;
}

/**
 * "Integration Helper": everything an external system needs to consume this layer, on one page.
 *
 * <p>The access-credentials card offers two ways to give a client access to the layer — grant an
 * existing client, or create a new one — as a segmented control. "Choose existing" is a searchable
 * list that marks already-granted and suspended clients as unselectable rather than hiding them,
 * so the operator learns why the client they were looking for cannot be picked. Duplicate grants
 * are refused by the server (HTTP 409) and surfaced as a clear message, never as a second row.</p>
 *
 * <p>The snippets are generated from the layer's own endpoint URLs and from a real client id, so
 * an operator copies a command that works rather than a template they must fill in.</p>
 */
@Component({
  selector: 'app-layer-integration',
  standalone: false,
  templateUrl: './layer-integration.component.html',
})
export class LayerIntegrationComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly toaster = inject(ToasterService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) layer!: GisLayer;

  readonly ClientQuotaType = ClientQuotaType;
  readonly statusBadgeClass = STATUS_BADGE_CLASS;
  readonly statusLabelKeys = STATUS_LABEL_KEYS;

  /** Which sub-form of the access card is showing. */
  readonly mode = signal<'existing' | 'new'>('existing');

  /** The clients that already read this layer. The grants table. */
  readonly grantedClients = signal<LayerClient[]>([]);
  readonly loadingGranted = signal(true);
  readonly busy = signal(false);

  /** The plaintext secret, held only until the operator dismisses it. Never re-fetchable. */
  readonly revealedSecret = signal<{ clientId: string; secret: string } | null>(null);

  readonly tokenUrl = this.service.tokenUrl;

  // ---- Choose-existing state ----
  readonly search = signal('');
  readonly showSuspended = signal(false);
  readonly availableClients = signal<AvailableClient[]>([]);
  readonly loadingAvailable = signal(false);
  readonly selectedClientId = signal<string | null>(null);
  private readonly searchTrigger = new Subject<void>();

  // ---- Create-new state ----
  readonly form = signal<NewClientForm>(this.emptyForm());

  readonly exampleClientId = computed(
    () => this.grantedClients()[0]?.clientId ?? 'your-client-id',
  );
  readonly featureServerUrl = computed(() => this.layer.endpoints?.esriFeatureServer ?? '');
  readonly steps = computed<Snippet[]>(() => this.buildSnippets());

  ngOnInit(): void {
    this.loadGranted();

    // The picker query is debounced and switch-mapped, so a fast typist never races two searches
    // and never sees the earlier one's results overwrite the later one's.
    this.searchTrigger
      .pipe(
        debounceTime(250),
        switchMap(() => {
          this.loadingAvailable.set(true);
          return this.service.getAvailableClientsForLayer(this.layer.id, {
            filter: this.search().trim() || undefined,
            includeInactive: this.showSuspended(),
            maxResultCount: 25,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: result => {
          this.availableClients.set(result.items);
          this.loadingAvailable.set(false);
        },
        error: () => this.loadingAvailable.set(false),
      });

    this.searchTrigger.next();
  }

  // ---- Mode + granted list -------------------------------------------------

  setMode(mode: 'existing' | 'new'): void {
    this.mode.set(mode);
    if (mode === 'existing') {
      this.searchTrigger.next();
    }
  }

  private loadGranted(): void {
    this.loadingGranted.set(true);
    this.service
      .getLayerClients(this.layer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: clients => {
          this.grantedClients.set(clients);
          this.loadingGranted.set(false);
        },
        error: () => this.loadingGranted.set(false),
      });
  }

  // ---- Choose existing -----------------------------------------------------

  onSearchInput(value: string): void {
    this.search.set(value);
    this.searchTrigger.next();
  }

  toggleShowSuspended(): void {
    this.showSuspended.update(v => !v);
    this.searchTrigger.next();
  }

  select(client: AvailableClient): void {
    if (!client.isSelectable) {
      return;
    }
    this.selectedClientId.set(client.id === this.selectedClientId() ? null : client.id);
  }

  grantSelected(): void {
    const clientId = this.selectedClientId();
    if (!clientId) {
      this.toaster.warn(this.t('::GeoForge:Integration:SelectClientFirst'));
      return;
    }

    this.busy.set(true);
    this.service
      .grantLayerAccess(clientId, { layerId: this.layer.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.selectedClientId.set(null);
          this.toaster.success(this.t('::GeoForge:Integration:GrantedToast'));
          this.loadGranted();
          this.searchTrigger.next();
        },
        error: err => {
          this.busy.set(false);
          // The server refuses a duplicate with 409; show the plain message rather than a raw error.
          if (err?.status === 409) {
            this.toaster.warn(this.t('::GeoForge:Integration:DuplicateToast'));
            this.searchTrigger.next();
          }
        },
      });
  }

  // ---- Create new ----------------------------------------------------------

  private emptyForm(): NewClientForm {
    return {
      name: '',
      description: '',
      quotaType: ClientQuotaType.Unlimited,
      quotaLimit: null,
      expires: false,
      expiresAt: '',
      enabled: true,
      allowedIpAddresses: '',
      notes: '',
    };
  }

  patchForm(patch: Partial<NewClientForm>): void {
    this.form.update(f => ({ ...f, ...patch }));
  }

  readonly canCreate = computed(() => {
    const f = this.form();
    if (!f.name.trim()) {
      return false;
    }
    if (f.quotaType === ClientQuotaType.Limited && (!f.quotaLimit || f.quotaLimit <= 0)) {
      return false;
    }
    return true;
  });

  createClient(): void {
    const f = this.form();
    if (!this.canCreate() || this.busy()) {
      return;
    }

    const input: CreateApiClient = {
      name: f.name.trim(),
      description: f.description.trim() || undefined,
      quotaType: f.quotaType,
      quotaLimit: f.quotaType === ClientQuotaType.Limited ? f.quotaLimit ?? undefined : undefined,
      expiresAt: f.expires && f.expiresAt ? new Date(f.expiresAt).toISOString() : undefined,
      isEnabled: f.enabled,
      allowedIpAddresses: f.allowedIpAddresses.trim() || undefined,
      notes: f.notes.trim() || undefined,
      environment: ClientEnvironment.Unspecified,
      // The whole point of creating here: the new client can read this layer immediately.
      grantedLayerIds: [this.layer.id],
    };

    this.busy.set(true);
    this.service
      .createApiClient(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.busy.set(false);
          this.form.set(this.emptyForm());
          this.revealedSecret.set({ clientId: result.client.clientId, secret: result.secret });
          this.toaster.success(
            this.t('::GeoForge:Client:CreatedToast', result.client.clientId),
          );
          this.mode.set('existing');
          this.loadGranted();
          this.searchTrigger.next();
        },
        error: () => this.busy.set(false),
      });
  }

  // ---- Grants table actions ------------------------------------------------

  revokeLayer(client: LayerClient): void {
    this.confirmation
      .warn(
        this.t('::GeoForge:Layer:RemoveAccessConfirm', client.clientId),
        this.t('::GeoForge:Layer:RemoveAccessTitle'),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status !== Confirmation.Status.confirm) {
          return;
        }

        this.service
          .revokeLayerAccess(client.id, this.layer.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.toaster.success(this.t('::GeoForge:Layer:AccessRemovedToast'));
            this.loadGranted();
            this.searchTrigger.next();
          });
      });
  }

  dismissSecret(): void {
    this.revealedSecret.set(null);
  }

  copy(text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => this.toaster.info(this.t('::GeoForge:Common:Copied')));
  }

  private t(key: string, ...params: string[]): string {
    return this.localization.instant({ key, defaultValue: key }, ...params);
  }

  // ---- Snippets (unchanged behaviour) --------------------------------------

  private buildSnippets(): Snippet[] {
    const featureServer = this.featureServerUrl();
    if (!featureServer) {
      return [];
    }

    if (this.layer.isPublic) {
      return [
        {
          title: 'This layer is public — no credentials needed',
          language: 'bash',
          note: 'Anyone can read it. Make it private to require an access token.',
          code: `curl "${featureServer}?f=json"`,
        },
        ...this.clientSnippets(featureServer, null),
      ];
    }

    const clientId = this.exampleClientId();

    return [
      {
        title: 'Step 1 — Generate an access token',
        language: 'bash',
        note: 'The secret is shown once, when the client is created or its secret rotated.',
        code: `curl -X POST "${this.tokenUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"username":"${clientId}","password":"YOUR_CLIENT_SECRET"}'`,
      },
      {
        title: 'The response',
        language: 'json',
        note: 'The token is opaque; read its expiry from expiresAt, not from the token itself.',
        code: `{
  "accessToken": "CfDJ8...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "${this.exampleExpiry()}"
}`,
      },
      {
        title: 'Step 2a — Use the token in an Authorization header (preferred)',
        language: 'bash',
        note: 'Headers do not end up in proxy or access logs. Prefer this wherever you can.',
        code: `curl "${featureServer}?f=json" \\
  -H "Authorization: Bearer ACCESS_TOKEN"`,
      },
      {
        title: 'Step 2b — Or as ?token=, for ArcGIS-style clients',
        language: 'bash',
        note: 'Accepted for compatibility with ArcGIS Pro and older tooling.',
        code: `curl "${featureServer}?f=json&token=ACCESS_TOKEN"`,
      },
      ...this.clientSnippets(featureServer, clientId),
    ];
  }

  private clientSnippets(featureServer: string, clientId: string | null): Snippet[] {
    const authHeader = clientId
      ? `,\n  headers: { Authorization: \`Bearer \${accessToken}\` }`
      : '';

    const fetchCode = clientId
      ? `// 1. Exchange the credential for a token.
const auth = await fetch("${this.tokenUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "${clientId}", password: "YOUR_CLIENT_SECRET" }),
});
const { accessToken } = await auth.json();

// 2. Read the layer with it.
const response = await fetch("${featureServer}/query?where=1=1&outFields=*&f=geojson"${authHeader});
const featureCollection = await response.json();`
      : `const response = await fetch("${featureServer}/query?where=1=1&outFields=*&f=geojson");
const featureCollection = await response.json();`;

    const arcgisCode = clientId
      ? `import esriConfig from "@arcgis/core/config.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

const FEATURE_SERVER = "${featureServer}";

// The SDK issues its own requests, so attach the token with an interceptor.
// Scope it by URL so the token is never sent to Esri's basemap servers.
esriConfig.request.interceptors.push({
  urls: FEATURE_SERVER,
  before: params => {
    params.requestOptions.headers = {
      ...params.requestOptions.headers,
      Authorization: \`Bearer \${accessToken}\`,
    };
  },
});

const layer = new FeatureLayer({ url: FEATURE_SERVER, outFields: ["*"] });`
      : `import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

// The layer is public; no interceptor and no token are needed.
const layer = new FeatureLayer({ url: "${featureServer}", outFields: ["*"] });`;

    return [
      { title: 'JavaScript — fetch', language: 'javascript', code: fetchCode },
      {
        title: 'ArcGIS Maps SDK for JavaScript',
        language: 'javascript',
        note: 'Point a native FeatureLayer at the endpoint; it pages on its own.',
        code: arcgisCode,
      },
    ];
  }

  private exampleExpiry(): string {
    return new Date(Date.now() + 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  }
}
