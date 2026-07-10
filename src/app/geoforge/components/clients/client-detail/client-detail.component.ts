import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../../services/geoforge.service';
import {
  ApiClient,
  ApiClientLayer,
  ApiClientStatus,
  ClientAuditLog,
  ClientQuotaType,
  GisLayerListItem,
} from '../../../models/geoforge.models';
import {
  isActive,
  quotaBarClass,
  quotaPercent,
  STATUS_BADGE_CLASS,
  STATUS_LABEL_KEYS,
} from '../../../models/client-display';

type Tab = 'overview' | 'credentials' | 'layers' | 'usage' | 'audit';

/**
 * The client detail page at /geoforge/clients/:id.
 *
 * <p>Five tabs — overview, credentials, assigned layers, usage analytics and audit. Only the
 * active tab's data is fetched, so opening the page is one request, not five. The usage tab reuses
 * the existing client-analytics surface (linked, and summarised inline) rather than reimplementing
 * the charts, since that page already aggregates the request log in the database.</p>
 */
@Component({
  selector: 'app-client-detail',
  standalone: false,
  templateUrl: './client-detail.component.html',
})
export class ClientDetailComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly route = inject(ActivatedRoute);
  private readonly toaster = inject(ToasterService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ClientQuotaType = ClientQuotaType;
  readonly ApiClientStatus = ApiClientStatus;
  readonly statusBadgeClass = STATUS_BADGE_CLASS;
  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly quotaPercent = quotaPercent;
  readonly quotaBarClass = quotaBarClass;
  readonly isActive = isActive;

  readonly clientId = signal<string>('');
  readonly client = signal<ApiClient | null>(null);
  readonly loading = signal(true);
  readonly tab = signal<Tab>('overview');

  readonly layers = signal<ApiClientLayer[]>([]);
  readonly loadingLayers = signal(false);

  readonly auditLog = signal<ClientAuditLog[]>([]);
  readonly loadingAudit = signal(false);

  /** Layers this client does not yet read, for the "grant a layer" picker. */
  readonly grantableLayers = signal<GisLayerListItem[]>([]);
  readonly selectedLayerToGrant = signal<string>('');

  readonly revealedSecret = signal<string | null>(null);

  ngOnInit(): void {
    this.clientId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.service
      .getApiClient(this.clientId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: client => {
          this.client.set(client);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'layers' && this.layers().length === 0) {
      this.loadLayers();
    }
    if (tab === 'audit' && this.auditLog().length === 0) {
      this.loadAudit();
    }
  }

  // ---- Status actions ------------------------------------------------------

  activate(): void {
    this.act(this.service.activateApiClient(this.clientId()), '::GeoForge:ClientAdmin:Toast:Activated');
  }

  suspend(): void {
    const c = this.client();
    if (!c) return;
    this.confirmThen('::GeoForge:ClientAdmin:Confirm:SuspendTitle', '::GeoForge:ClientAdmin:Confirm:Suspend', c.name, () =>
      this.act(this.service.suspendApiClient(this.clientId()), '::GeoForge:ClientAdmin:Toast:Suspended'),
    );
  }

  revoke(): void {
    const c = this.client();
    if (!c) return;
    this.confirmThen('::GeoForge:ClientAdmin:Confirm:RevokeTitle', '::GeoForge:ClientAdmin:Confirm:Revoke', c.name, () =>
      this.act(this.service.revokeApiClient(this.clientId()), '::GeoForge:ClientAdmin:Toast:Revoked'),
    );
  }

  rotateSecret(): void {
    const c = this.client();
    if (!c) return;
    this.confirmThen('::GeoForge:ClientAdmin:Confirm:RotateTitle', '::GeoForge:ClientAdmin:Confirm:Rotate', c.name, () =>
      this.service
        .rotateApiClientSecret(this.clientId())
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(result => {
          this.revealedSecret.set(result.secret);
          this.toaster.info(this.t('::GeoForge:ClientAdmin:Toast:SecretRotated'));
          this.load();
        }),
    );
  }

  resetQuota(): void {
    const c = this.client();
    if (!c) return;
    this.confirmThen(
      '::GeoForge:ClientAdmin:Confirm:ResetQuotaTitle',
      '::GeoForge:ClientAdmin:Confirm:ResetQuota',
      c.name,
      () => this.act(this.service.resetApiClientQuota(this.clientId()), '::GeoForge:ClientAdmin:Toast:QuotaReset'),
    );
  }

  private act(obs: import('rxjs').Observable<ApiClient>, toastKey: string): void {
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(client => {
      this.client.set(client);
      this.toaster.success(this.t(toastKey));
    });
  }

  // ---- Layers tab ----------------------------------------------------------

  private loadLayers(): void {
    this.loadingLayers.set(true);
    this.service
      .getClientLayers(this.clientId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: layers => {
          this.layers.set(layers);
          this.loadingLayers.set(false);
          this.loadGrantableLayers();
        },
        error: () => this.loadingLayers.set(false),
      });
  }

  /** Published layers this client does not yet read — the "grant a layer" options. */
  private loadGrantableLayers(): void {
    this.service
      .getLayers({ maxResultCount: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        const granted = new Set(this.layers().map(l => l.layerId));
        this.grantableLayers.set(result.items.filter(l => !granted.has(l.id)));
      });
  }

  grantLayer(): void {
    const layerId = this.selectedLayerToGrant();
    if (!layerId) return;

    this.service
      .grantLayerAccess(this.clientId(), { layerId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.selectedLayerToGrant.set('');
          this.toaster.success(this.t('::GeoForge:Integration:GrantedToast'));
          this.loadLayers();
          this.load();
        },
        error: err => {
          if (err?.status === 409) {
            this.toaster.warn(this.t('::GeoForge:Integration:DuplicateToast'));
          }
        },
      });
  }

  toggleLayerEnabled(layer: ApiClientLayer): void {
    this.service
      .setLayerAccessEnabled(this.clientId(), layer.layerId, !layer.isEnabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadLayers());
  }

  revokeLayer(layer: ApiClientLayer): void {
    this.confirmThen(
      '::GeoForge:Layer:RemoveAccessTitle',
      '::GeoForge:Layer:RemoveAccessConfirm',
      layer.displayName,
      () =>
        this.service
          .revokeLayerAccess(this.clientId(), layer.layerId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.toaster.success(this.t('::GeoForge:Layer:AccessRemovedToast'));
            this.loadLayers();
            this.load();
          }),
    );
  }

  // ---- Audit tab -----------------------------------------------------------

  private loadAudit(): void {
    this.loadingAudit.set(true);
    this.service
      .getClientAuditLog(this.clientId(), { maxResultCount: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.auditLog.set(result.items);
          this.loadingAudit.set(false);
        },
        error: () => this.loadingAudit.set(false),
      });
  }

  auditActionLabel(action: number): string {
    return this.t(`::GeoForge:AuditAction:${action}`);
  }

  // ---- Shared --------------------------------------------------------------

  copy(text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => this.toaster.info(this.t('::GeoForge:Common:Copied')));
  }

  dismissSecret(): void {
    this.revealedSecret.set(null);
  }

  private confirmThen(titleKey: string, messageKey: string, param: string, onConfirm: () => void): void {
    this.confirmation
      .warn(this.t(messageKey, param), this.t(titleKey))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status === Confirmation.Status.confirm) {
          onConfirm();
        }
      });
  }

  private t(key: string, ...params: string[]): string {
    return this.localization.instant({ key, defaultValue: key }, ...params);
  }
}
