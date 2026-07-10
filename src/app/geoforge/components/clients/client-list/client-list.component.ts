import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, Subject, switchMap } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../../services/geoforge.service';
import { EmailTemplateStateService } from '../../../services/email-template-state.service';
import {
  ApiClient,
  ApiClientEffectiveStatus,
  ApiClientStatus,
  CLIENT_ID_CREATED_TEMPLATE_KEY,
  ClientEnvironment,
  ClientQuotaType,
  CreateApiClient,
} from '../../../models/geoforge.models';
import {
  isActive,
  quotaBarClass,
  quotaPercent,
  STATUS_BADGE_CLASS,
  STATUS_LABEL_KEYS,
} from '../../../models/client-display';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The list page's server-side query, mirroring GetApiClientsInput. */
interface ClientFilters {
  filter: string;
  status: ApiClientStatus | null;
  quotaType: ClientQuotaType | null;
  onlyExpired: boolean;
  onlyQuotaExhausted: boolean;
  hasLayerAccess: boolean | null;
}

/** The "new client" panel's local state. Mirrors the fields the create DTO accepts. */
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
  private readonly templateState = inject(EmailTemplateStateService);
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

  /** The secret from a rotate or a create, shown once. */
  readonly revealedSecret = signal<{ clientId: string; secret: string } | null>(null);

  // ---- New-client panel ----------------------------------------------------

  /** Whether the inline create panel is open. */
  readonly showCreate = signal(false);
  readonly creating = signal(false);
  readonly form = signal<NewClientForm>(this.emptyForm());

  /** Whether the ClientIdCreated template is globally enabled — gates the send-credentials checkbox. */
  readonly sendCredentialsTemplateEnabled = signal(true);

  readonly contactEmailValid = computed(() => EMAIL_PATTERN.test(this.form().contactEmail.trim()));

  /** Effective: only send when the operator asked and the template is globally enabled. */
  readonly willSendCredentials = computed(
    () => this.form().sendCredentials && this.sendCredentialsTemplateEnabled(),
  );

  readonly canCreate = computed(() => {
    const f = this.form();
    if (!f.name.trim()) {
      return false;
    }
    if (f.quotaType === ClientQuotaType.Limited && (!f.quotaLimit || f.quotaLimit <= 0)) {
      return false;
    }
    if (this.willSendCredentials() && !this.contactEmailValid()) {
      return false;
    }
    return true;
  });

  ngOnInit(): void {
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

  // ---- New-client panel ----------------------------------------------------

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
      // Off by default: the common path here is "just create a credential", so the panel opens ready to
      // submit with only a name. Ticking this reveals the contact-email requirement and its gating.
      sendCredentials: false,
    };
  }

  toggleCreate(): void {
    this.showCreate.update(v => !v);
    if (this.showCreate()) {
      this.form.set(this.emptyForm());
    }
  }

  patchForm(patch: Partial<NewClientForm>): void {
    this.form.update(f => ({ ...f, ...patch }));
  }

  createClient(): void {
    const f = this.form();
    if (!this.canCreate() || this.creating()) {
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
      // No layer is granted from the admin list; access is assigned later from the client or layer page.
      grantedLayerIds: [],
    };

    this.creating.set(true);
    this.service
      .createApiClient(input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.creating.set(false);
          this.showCreate.set(false);
          this.form.set(this.emptyForm());
          // The one-time secret is always shown — the email is a convenience, never the only copy.
          this.revealedSecret.set({ clientId: result.client.clientId, secret: result.secret });
          this.toaster.success(this.t('::GeoForge:Client:CreatedToast', result.client.clientId));
          if (willSend && contactEmail) {
            this.toaster.info(this.t('::GeoForge:Client:CredentialsEmailQueued', contactEmail));
          }
          this.page.set(0);
          this.reload.next();
        },
        error: () => this.creating.set(false),
      });
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
