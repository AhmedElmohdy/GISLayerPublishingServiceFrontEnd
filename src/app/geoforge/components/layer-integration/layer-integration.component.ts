import { Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { GeoForgeService } from '../../services/geoforge.service';
import { ApiClient, GisLayer } from '../../models/geoforge.models';

/** One copyable snippet in the step-by-step guide. */
interface Snippet {
  title: string;
  language: string;
  note?: string;
  code: string;
}

/**
 * "Integration Helper": everything an external system needs to consume this layer, on one page.
 *
 * <p>The snippets are generated from the layer's own endpoint URLs and from a real client id, so
 * an operator copies a command that works rather than a template they must fill in. When the
 * layer is public the guide says so and drops the token steps — telling an integrator to
 * authenticate against an endpoint that ignores authentication is how support tickets are made.</p>
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
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) layer!: GisLayer;

  readonly clients = signal<ApiClient[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);

  /** The plaintext secret, held only until the operator dismisses it. Never re-fetchable. */
  readonly revealedSecret = signal<{ clientId: string; secret: string } | null>(null);

  readonly newClientName = signal('');

  readonly tokenUrl = this.service.tokenUrl;

  /** The client id used in the examples: a real one when it exists, a placeholder otherwise. */
  readonly exampleClientId = computed(() => this.clients()[0]?.clientId ?? 'your-client-id');

  readonly featureServerUrl = computed(() => this.layer.endpoints?.esriFeatureServer ?? '');

  readonly steps = computed<Snippet[]>(() => this.buildSnippets());

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);

    this.service
      .getApiClients({ layerId: this.layer.id, maxResultCount: 50 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.clients.set(result.items);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  // ---- Credentials ---------------------------------------------------------

  /** Creates a client already granted this layer, and reveals its secret once. */
  createClient(): void {
    const name = this.newClientName().trim();
    if (!name) {
      return;
    }

    this.busy.set(true);
    this.service
      .createApiClient({ name, grantedLayerIds: [this.layer.id] })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.busy.set(false);
          this.newClientName.set('');
          this.revealedSecret.set({ clientId: result.client.clientId, secret: result.secret });
          this.toaster.success(`Client '${result.client.clientId}' created.`);
          this.load();
        },
        error: () => this.busy.set(false),
      });
  }

  rotateSecret(client: ApiClient): void {
    this.confirmation
      .warn(
        `Every access token already issued to '${client.clientId}' will stop working immediately. ` +
          'Any integration using it must fetch a new token with the new secret.',
        'Rotate secret?',
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status !== Confirmation.Status.confirm) {
          return;
        }

        this.service
          .rotateApiClientSecret(client.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(result => {
            this.revealedSecret.set({ clientId: result.client.clientId, secret: result.secret });
            this.toaster.info('Secret rotated.');
            this.load();
          });
      });
  }

  /** Enabling and disabling is the reversible half of revoking access. */
  toggleEnabled(client: ApiClient): void {
    this.service
      .updateApiClient(client.id, {
        name: client.name,
        description: client.description,
        isEnabled: !client.isEnabled,
        expiresAt: client.expiresAt,
        grantedLayerIds: client.grantedLayers.map(l => l.layerId),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => {
        this.toaster.info(
          updated.isEnabled
            ? `Client '${updated.clientId}' enabled.`
            : `Client '${updated.clientId}' disabled; its tokens no longer work.`,
        );
        this.load();
      });
  }

  /** Revokes this layer only, leaving the client's other grants intact. */
  revokeLayer(client: ApiClient): void {
    this.confirmation
      .warn(
        `'${client.clientId}' will no longer be able to read '${this.layer.name}'.`,
        'Revoke access to this layer?',
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status !== Confirmation.Status.confirm) {
          return;
        }

        this.service
          .updateApiClient(client.id, {
            name: client.name,
            description: client.description,
            isEnabled: client.isEnabled,
            expiresAt: client.expiresAt,
            grantedLayerIds: client.grantedLayers
              .map(l => l.layerId)
              .filter(id => id !== this.layer.id),
          })
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.toaster.success('Access revoked.');
            this.load();
          });
      });
  }

  dismissSecret(): void {
    this.revealedSecret.set(null);
  }

  copy(text: string): void {
    void navigator.clipboard.writeText(text).then(() => this.toaster.info('Copied.'));
  }

  // ---- Snippets ------------------------------------------------------------

  private buildSnippets(): Snippet[] {
    const featureServer = this.featureServerUrl();

    if (!featureServer) {
      return [];
    }

    // A public layer ignores the token entirely. Showing the token dance for it would be a lie.
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

  /** The language-specific examples, shared by the public and private variants. */
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
      {
        title: 'JavaScript — fetch',
        language: 'javascript',
        code: fetchCode,
      },
      {
        title: 'ArcGIS Maps SDK for JavaScript',
        language: 'javascript',
        note: 'Point a native FeatureLayer at the endpoint; it pages on its own.',
        code: arcgisCode,
      },
    ];
  }

  /** An illustrative expiry one hour out, formatted the way the API formats it. */
  private exampleExpiry(): string {
    return new Date(Date.now() + 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  }
}
