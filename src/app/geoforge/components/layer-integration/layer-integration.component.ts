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
import { debounceTime, Subject } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../services/geoforge.service';
import { EmailTemplateStateService } from '../../services/email-template-state.service';
import {
  AvailableClient,
  BulkLayerAccessResult,
  CLIENT_ID_CREATED_TEMPLATE_KEY,
  ClientEnvironment,
  ClientQuotaType,
  CreateApiClient,
  GisLayer,
  LayerClient,
} from '../../models/geoforge.models';
import { STATUS_BADGE_CLASS, STATUS_LABEL_KEYS } from '../../models/client-display';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  contactName: string;
  contactEmail: string;
  sendCredentials: boolean;
}

/**
 * "Integration Helper": everything an external system needs to consume this layer, on one page.
 *
 * <p>The access-credentials card offers two ways to give clients access to the layer — assign
 * existing clients, or create a new one — as a segmented control. "Choose existing" is a bulk,
 * multi-select surface: a virtual-scrolled, server-searched, paged list of the clients that do NOT
 * yet read the layer, with checkboxes, selected chips and a running count. Granting moves the chosen
 * clients into the "Clients with access" table below — and removing (per row, or in bulk from that
 * table) moves them back — both applied locally so the two lists stay mutually exclusive without a
 * reload. Each bulk call reports how many were added, already had access, and failed; an opt-in
 * "send email" switch notifies the affected clients (still gated per client).</p>
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
  private readonly templateState = inject(EmailTemplateStateService);
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

  // ---- Choose-existing (bulk multi-select) state ----
  readonly search = signal('');
  readonly showSuspended = signal(false);

  /** The available-clients list, accumulated page by page as the virtual list is scrolled. */
  readonly availableClients = signal<AvailableClient[]>([]);
  readonly totalCount = signal(0);
  readonly loadingAvailable = signal(false);
  readonly hasMore = computed(() => this.availableClients().length < this.totalCount());

  private readonly pageSize = 50;
  private skip = 0;
  /** Bumped on every fresh search so a stale in-flight page never appends to the new results. */
  private loadToken = 0;
  private readonly searchInput = new Subject<void>();

  /** Every available client we have loaded, by id — lets a removed client be restored to the top list
   * with its original layer count when it is moved back out of the granted table. */
  private readonly clientCache = new Map<string, AvailableClient>();

  /** The selected available clients (top list), by id, so chips render name + id even after paging. */
  readonly selected = signal<Map<string, AvailableClient>>(new Map());
  readonly selectedCount = computed(() => this.selected().size);
  readonly selectedList = computed(() => Array.from(this.selected().values()));
  readonly allLoadedSelected = computed(() => {
    const loaded = this.availableClients();
    return loaded.length > 0 && loaded.every(c => this.selected().has(c.id));
  });

  /** The selected granted clients (bottom table), by id — drives the bulk remove. */
  readonly grantedSelected = signal<Set<string>>(new Set());
  readonly grantedSelectedCount = computed(() => this.grantedSelected().size);
  readonly allGrantedSelected = computed(() => {
    const rows = this.grantedClients();
    return rows.length > 0 && rows.every(c => this.grantedSelected().has(c.id));
  });

  /** Operation-level "email the affected clients" switch (still gated per-client on the server). */
  readonly sendEmail = signal(true);
  /** True while a bulk grant/remove request is in flight — drives the progress bar. */
  readonly processing = signal(false);
  /** The last bulk operation's counts, shown as a summary until the next action. */
  readonly lastResult = signal<(BulkLayerAccessResult & { action: 'grant' | 'remove' }) | null>(null);

  // ---- Create-new state ----
  readonly form = signal<NewClientForm>(this.emptyForm());

  /** Whether the ClientIdCreated template is globally enabled — gates the send-credentials checkbox. */
  readonly sendCredentialsTemplateEnabled = signal(true);

  readonly contactEmailValid = computed(() => EMAIL_PATTERN.test(this.form().contactEmail.trim()));

  readonly exampleClientId = computed(
    () => this.grantedClients()[0]?.clientId ?? 'your-client-id',
  );
  readonly featureServerUrl = computed(() => this.layer.endpoints?.esriFeatureServer ?? '');
  readonly steps = computed<Snippet[]>(() => this.buildSnippets());

  ngOnInit(): void {
    this.loadGranted();

    // Learn whether the creation template is enabled, to gate the send-credentials checkbox. On
    // no-permission or error the map is empty and the checkbox stays enabled (backend authoritative).
    this.templateState
      .enabledMap()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(map =>
        this.sendCredentialsTemplateEnabled.set(
          this.templateState.isEnabled(map, CLIENT_ID_CREATED_TEMPLATE_KEY),
        ),
      );

    // The search box is debounced, so a fast typist triggers one reload, not one per keystroke.
    this.searchInput
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadSearch());

    this.reloadSearch();
  }

  // ---- Mode + granted list -------------------------------------------------

  setMode(mode: 'existing' | 'new'): void {
    this.mode.set(mode);
    if (mode === 'existing') {
      this.reloadSearch();
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
          this.grantedSelected.set(new Set());
          this.loadingGranted.set(false);
        },
        error: () => this.loadingGranted.set(false),
      });
  }

  // ---- Choose existing: search + paging ------------------------------------

  onSearchInput(value: string): void {
    this.search.set(value);
    this.searchInput.next();
  }

  toggleShowSuspended(): void {
    this.showSuspended.update(v => !v);
    this.reloadSearch();
  }

  /** Restarts the list from the first page (new filter, or after a bulk change). */
  private reloadSearch(): void {
    this.loadToken++;
    this.skip = 0;
    this.availableClients.set([]);
    this.totalCount.set(0);
    this.loadPage();
  }

  /** Fetches the next page and appends it. A `loadToken` guard drops responses from a superseded search. */
  private loadPage(): void {
    if (this.loadingAvailable()) {
      return;
    }
    const token = this.loadToken;
    this.loadingAvailable.set(true);

    this.service
      .getAvailableClientsForLayer(this.layer.id, {
        // Only clients that do NOT already read this layer — the granted ones live in the table below.
        // A granted client never appears in both lists at once.
        filter: this.search().trim() || undefined,
        includeInactive: this.showSuspended(),
        skipCount: this.skip,
        maxResultCount: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          if (token !== this.loadToken) {
            return; // a newer search superseded this response
          }
          result.items.forEach(c => this.clientCache.set(c.id, c));
          this.availableClients.update(list =>
            this.skip === 0 ? result.items : [...list, ...result.items],
          );
          this.totalCount.set(result.totalCount);
          this.skip += result.items.length;
          this.loadingAvailable.set(false);
        },
        error: () => this.loadingAvailable.set(false),
      });
  }

  /** The virtual scroll viewport is nearing its end — pull the next page. */
  onScrolledIndexChange(index: number): void {
    const buffer = 10;
    if (!this.loadingAvailable() && this.hasMore() && index + buffer >= this.availableClients().length) {
      this.loadPage();
    }
  }

  // ---- Choose existing: selection ------------------------------------------

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggleSelect(client: AvailableClient): void {
    // Every listed client is a valid target: ungranted ones can be granted, granted ones removed.
    this.selected.update(m => {
      const next = new Map(m);
      if (next.has(client.id)) {
        next.delete(client.id);
      } else {
        next.set(client.id, client);
      }
      return next;
    });
  }

  removeSelected(id: string): void {
    this.selected.update(m => {
      const next = new Map(m);
      next.delete(id);
      return next;
    });
  }

  /** Selects every selectable client currently loaded; toggles back to empty when all are selected. */
  toggleSelectAll(): void {
    if (this.allLoadedSelected()) {
      this.clearSelection();
      return;
    }
    this.selected.update(m => {
      const next = new Map(m);
      for (const c of this.availableClients()) {
        next.set(c.id, c);
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selected.set(new Map());
  }

  // ---- Granted table: selection --------------------------------------------

  isGrantedSelected(id: string): boolean {
    return this.grantedSelected().has(id);
  }

  toggleGranted(id: string): void {
    this.grantedSelected.update(s => {
      const next = new Set(s);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  toggleSelectAllGranted(): void {
    if (this.allGrantedSelected()) {
      this.grantedSelected.set(new Set());
      return;
    }
    this.grantedSelected.set(new Set(this.grantedClients().map(c => c.id)));
  }

  // ---- Grant (top → bottom) / Remove (bottom → top): optimistic ------------

  /**
   * Grants the layer to the selected available clients, then moves them from the top list into the
   * granted table locally — no reload. The server call confirms and emails; the two lists stay
   * mutually exclusive because a granted client is only ever in one collection.
   */
  grant(): void {
    const clients = this.selectedList();
    if (clients.length === 0) {
      this.toaster.warn(this.t('::GeoForge:Integration:SelectClientFirst'));
      return;
    }
    const ids = clients.map(c => c.id);

    this.processing.set(true);
    this.lastResult.set(null);
    this.service
      .bulkGrantClientsToLayer(this.layer.id, { clientIds: ids, sendEmail: this.sendEmail() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.processing.set(false);
          this.lastResult.set({ ...result, action: 'grant' });
          this.toaster.success(this.t('::GeoForge:Integration:BulkGrantedToast'));
          this.moveToGranted(clients);
          this.clearSelection();
        },
        error: () => this.processing.set(false),
      });
  }

  /** Bulk-removes the selected granted clients, moving them back to the available list locally. */
  removeSelectedGranted(): void {
    const ids = Array.from(this.grantedSelected());
    if (ids.length === 0) {
      this.toaster.warn(this.t('::GeoForge:Integration:SelectClientFirst'));
      return;
    }
    this.confirmRemove(ids.length, () => {
      this.processing.set(true);
      this.lastResult.set(null);
      this.service
        .bulkRemoveClientsFromLayer(this.layer.id, { clientIds: ids, sendEmail: this.sendEmail() })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            this.processing.set(false);
            this.lastResult.set({ ...result, action: 'remove' });
            this.toaster.success(this.t('::GeoForge:Integration:BulkRemovedToast'));
            const removed = this.grantedClients().filter(c => ids.includes(c.id));
            this.moveToAvailable(removed);
            this.grantedSelected.set(new Set());
          },
          error: () => this.processing.set(false),
        });
    });
  }

  private confirmRemove(count: number, onConfirm: () => void): void {
    this.confirmation
      .warn(
        this.t('::GeoForge:Integration:BulkRemoveConfirm', count + ''),
        this.t('::GeoForge:Integration:BulkRemoveTitle'),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status === Confirmation.Status.confirm) {
          onConfirm();
        }
      });
  }

  /** Removes the given clients from the top list and prepends them to the granted table. */
  private moveToGranted(clients: AvailableClient[]): void {
    const moved = new Set(clients.map(c => c.id));
    this.availableClients.update(list => list.filter(c => !moved.has(c.id)));
    this.totalCount.update(t => Math.max(0, t - moved.size));
    this.grantedClients.update(rows => [...clients.map(c => this.toGrantedRow(c)), ...rows]);
  }

  /** Removes the given clients from the granted table and prepends them to the top list. */
  private moveToAvailable(rows: LayerClient[]): void {
    const moved = new Set(rows.map(c => c.id));
    this.grantedClients.update(list => list.filter(c => !moved.has(c.id)));
    this.availableClients.update(list => [...rows.map(c => this.toAvailableRow(c)), ...list]);
    this.totalCount.update(t => t + rows.length);
  }

  private toGrantedRow(c: AvailableClient): LayerClient {
    return {
      id: c.id,
      name: c.name,
      clientId: c.clientId,
      effectiveStatus: c.effectiveStatus,
      quotaType: c.quotaType,
      quotaLimit: c.quotaLimit,
      usedRequests: c.usedRequests,
      remainingRequests: c.remainingRequests,
      isAccessEnabled: true,
      requestsToThisLayer: 0,
      grantedAt: new Date().toISOString(),
    };
  }

  private toAvailableRow(c: LayerClient): AvailableClient {
    // Restore the original layer count when we have it cached (it was captured before this layer was
    // granted, which is exactly the count after removing it again); otherwise fall back to zero.
    const cached = this.clientCache.get(c.id);
    return {
      id: c.id,
      name: c.name,
      clientId: c.clientId,
      effectiveStatus: c.effectiveStatus,
      quotaType: c.quotaType,
      quotaLimit: c.quotaLimit,
      usedRequests: c.usedRequests,
      remainingRequests: c.remainingRequests,
      grantedLayerCount: cached?.grantedLayerCount ?? 0,
      isAlreadyGranted: false,
      isSelectable: true,
    };
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
      contactName: '',
      contactEmail: '',
      // Checked by default, but disabled (and ignored) when the creation template is off.
      sendCredentials: true,
    };
  }

  /** Effective: only send when the operator asked and the template is globally enabled. */
  readonly willSendCredentials = computed(
    () => this.form().sendCredentials && this.sendCredentialsTemplateEnabled(),
  );

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
    // Contact email is required when credentials will be emailed.
    if (this.willSendCredentials() && !this.contactEmailValid()) {
      return false;
    }
    return true;
  });

  createClient(): void {
    const f = this.form();
    if (!this.canCreate() || this.busy()) {
      return;
    }

    const willSend = this.willSendCredentials();
    const contactEmail = f.contactEmail.trim() || undefined;

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
      contactName: f.contactName.trim() || undefined,
      contactEmail,
      // Sent explicitly, gated by the template being enabled.
      sendNotificationEmail: willSend,
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
          // The one-time secret is always shown — the email is a convenience, never the only copy.
          this.revealedSecret.set({ clientId: result.client.clientId, secret: result.secret });
          this.toaster.success(
            this.t('::GeoForge:Client:CreatedToast', result.client.clientId),
          );
          // The email is dispatched after commit, so its outcome is not in this response. Tell the
          // operator it was queued, and that the secret above is the authoritative copy either way.
          if (willSend && contactEmail) {
            this.toaster.info(this.t('::GeoForge:Client:CredentialsEmailQueued', contactEmail));
          }
          this.mode.set('existing');
          this.loadGranted();
          this.reloadSearch();
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
          .revokeLayerAccess(client.id, this.layer.id, this.sendEmail())
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.toaster.success(this.t('::GeoForge:Layer:AccessRemovedToast'));
            // Move it straight back to the available list — no reload, never in both.
            this.moveToAvailable([client]);
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
