import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject, switchMap } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../../services/geoforge.service';
import {
  ApiClient,
  ApiClientEffectiveStatus,
  ApiClientStatus,
  ClientQuotaType,
} from '../../../models/geoforge.models';
import {
  isActive,
  quotaBarClass,
  quotaPercent,
  STATUS_BADGE_CLASS,
  STATUS_LABEL_KEYS,
} from '../../../models/client-display';

/** The list page's server-side query, mirroring GetApiClientsInput. */
interface ClientFilters {
  filter: string;
  status: ApiClientStatus | null;
  quotaType: ClientQuotaType | null;
  onlyExpired: boolean;
  onlyQuotaExhausted: boolean;
  hasLayerAccess: boolean | null;
}

/**
 * The global API-client management dashboard at /geoforge/clients.
 *
 * <p>Everything is server-side: filtering, sorting and paging all go to the backend, because the
 * client table is unbounded and a page that pulled every client into the browser to filter it
 * would fall over on the first busy tenant. The row actions map one-to-one onto the app service's
 * status and quota operations, and each destructive one confirms first.</p>
 */
@Component({
  selector: 'app-client-list',
  standalone: false,
  templateUrl: './client-list.component.html',
})
export class ClientListComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly toaster = inject(ToasterService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ClientQuotaType = ClientQuotaType;
  readonly ApiClientStatus = ApiClientStatus;
  readonly ApiClientEffectiveStatus = ApiClientEffectiveStatus;
  readonly statusBadgeClass = STATUS_BADGE_CLASS;
  readonly statusLabelKeys = STATUS_LABEL_KEYS;
  readonly quotaPercent = quotaPercent;
  readonly quotaBarClass = quotaBarClass;
  readonly isActive = isActive;

  readonly clients = signal<ApiClient[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly pageSize = 20;
  readonly page = signal(0);

  readonly filters = signal<ClientFilters>({
    filter: '',
    status: null,
    quotaType: null,
    onlyExpired: false,
    onlyQuotaExhausted: false,
    hasLayerAccess: null,
  });

  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize));

  private readonly reload = new Subject<void>();

  /** The secret from a rotate, shown once. */
  readonly revealedSecret = signal<{ clientId: string; secret: string } | null>(null);

  ngOnInit(): void {
    this.reload
      .pipe(
        debounceTime(200),
        switchMap(() => {
          this.loading.set(true);
          const f = this.filters();
          return this.service.getApiClients({
            filter: f.filter.trim() || undefined,
            status: f.status ?? undefined,
            quotaType: f.quotaType ?? undefined,
            onlyExpired: f.onlyExpired || undefined,
            onlyQuotaExhausted: f.onlyQuotaExhausted || undefined,
            hasLayerAccess: f.hasLayerAccess ?? undefined,
            skipCount: this.page() * this.pageSize,
            maxResultCount: this.pageSize,
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: result => {
          this.clients.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    this.reload.next();
  }

  patchFilters(patch: Partial<ClientFilters>): void {
    this.filters.update(f => ({ ...f, ...patch }));
    this.page.set(0);
    this.reload.next();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) {
      return;
    }
    this.page.set(page);
    this.reload.next();
  }

  // ---- Row actions ---------------------------------------------------------

  activate(client: ApiClient): void {
    this.service
      .activateApiClient(client.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toaster.success(this.t('::GeoForge:ClientAdmin:Toast:Activated'));
        this.reload.next();
      });
  }

  suspend(client: ApiClient): void {
    this.confirmWarn(
      '::GeoForge:ClientAdmin:Confirm:SuspendTitle',
      '::GeoForge:ClientAdmin:Confirm:Suspend',
      client,
      () =>
        this.service.suspendApiClient(client.id).subscribe(() => {
          this.toaster.success(this.t('::GeoForge:ClientAdmin:Toast:Suspended'));
          this.reload.next();
        }),
    );
  }

  revoke(client: ApiClient): void {
    this.confirmWarn(
      '::GeoForge:ClientAdmin:Confirm:RevokeTitle',
      '::GeoForge:ClientAdmin:Confirm:Revoke',
      client,
      () =>
        this.service.revokeApiClient(client.id).subscribe(() => {
          this.toaster.success(this.t('::GeoForge:ClientAdmin:Toast:Revoked'));
          this.reload.next();
        }),
    );
  }

  rotateSecret(client: ApiClient): void {
    this.confirmWarn(
      '::GeoForge:ClientAdmin:Confirm:RotateTitle',
      '::GeoForge:ClientAdmin:Confirm:Rotate',
      client,
      () =>
        this.service.rotateApiClientSecret(client.id).subscribe(result => {
          this.revealedSecret.set({ clientId: result.client.clientId, secret: result.secret });
          this.toaster.info(this.t('::GeoForge:ClientAdmin:Toast:SecretRotated'));
          this.reload.next();
        }),
    );
  }

  resetQuota(client: ApiClient): void {
    this.confirmWarn(
      '::GeoForge:ClientAdmin:Confirm:ResetQuotaTitle',
      '::GeoForge:ClientAdmin:Confirm:ResetQuota',
      client,
      () =>
        this.service.resetApiClientQuota(client.id).subscribe(() => {
          this.toaster.success(this.t('::GeoForge:ClientAdmin:Toast:QuotaReset'));
          this.reload.next();
        }),
    );
  }

  delete(client: ApiClient): void {
    this.confirmWarn(
      '::GeoForge:ClientAdmin:Confirm:DeleteTitle',
      '::GeoForge:ClientAdmin:Confirm:Delete',
      client,
      () =>
        this.service.deleteApiClient(client.id).subscribe(() => {
          this.toaster.success(this.t('::GeoForge:ClientAdmin:Toast:Deleted'));
          this.reload.next();
        }),
    );
  }

  copy(text: string): void {
    void navigator.clipboard
      .writeText(text)
      .then(() => this.toaster.info(this.t('::GeoForge:Common:Copied')));
  }

  dismissSecret(): void {
    this.revealedSecret.set(null);
  }

  private confirmWarn(
    titleKey: string,
    messageKey: string,
    client: ApiClient,
    onConfirm: () => void,
  ): void {
    this.confirmation
      .warn(this.t(messageKey, client.name), this.t(titleKey))
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
