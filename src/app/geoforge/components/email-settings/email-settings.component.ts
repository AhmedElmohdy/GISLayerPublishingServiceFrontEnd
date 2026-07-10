import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../services/geoforge.service';
import { UpdateEmailSettings } from '../../models/geoforge.models';

/** The settings form's local state. Mirrors UpdateEmailSettings, with the password write-only. */
interface SettingsForm {
  displayName: string;
  senderEmail: string;
  smtpUsername: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  enableSsl: boolean;
  useDefaultCredentials: boolean;
  authenticationEnabled: boolean;
  connectionTimeout: number;
  portalUrl: string;
  supportEmail: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The outgoing-email settings page at /geoforge/email-settings.
 *
 * <p>The saved password is never fetched — the form's password field starts empty and only a
 * non-empty value is sent, so leaving it blank keeps the stored secret. <code>hasPassword</code>
 * drives a "password is stored" hint. The test-email action sends with the values currently in the
 * form, including unsaved ones, so a configuration can be proved before it is committed.</p>
 */
@Component({
  selector: 'app-email-settings',
  standalone: false,
  templateUrl: './email-settings.component.html',
})
export class EmailSettingsComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly toaster = inject(ToasterService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly testing = signal(false);
  readonly hasPassword = signal(false);
  readonly showPassword = signal(false);

  readonly testDialogOpen = signal(false);
  readonly testRecipient = signal('');

  readonly form = signal<SettingsForm>(this.emptyForm());

  /** Per-field validation messages (localization keys), or empty when valid. */
  readonly errors = computed<Record<string, string>>(() => {
    const f = this.form();
    const e: Record<string, string> = {};

    if (!f.smtpHost.trim()) {
      e['smtpHost'] = '::GeoForge:EmailSettings:Validation:HostRequired';
    }
    if (!Number.isInteger(f.smtpPort) || f.smtpPort < 1 || f.smtpPort > 65535) {
      e['smtpPort'] = '::GeoForge:EmailSettings:Validation:PortRange';
    }
    if (f.connectionTimeout < 1 || f.connectionTimeout > 300) {
      e['connectionTimeout'] = '::GeoForge:EmailSettings:Validation:TimeoutRange';
    }
    if (f.senderEmail.trim() && !EMAIL_PATTERN.test(f.senderEmail.trim())) {
      e['senderEmail'] = '::GeoForge:EmailSettings:Validation:EmailFormat';
    }
    if (f.supportEmail.trim() && !EMAIL_PATTERN.test(f.supportEmail.trim())) {
      e['supportEmail'] = '::GeoForge:EmailSettings:Validation:EmailFormat';
    }
    // A username is required when authentication is on and default credentials are not used.
    if (f.authenticationEnabled && !f.useDefaultCredentials && !f.smtpUsername.trim()) {
      e['smtpUsername'] = '::GeoForge:EmailSettings:Validation:UsernameRequired';
    }
    return e;
  });

  readonly canSave = computed(() => Object.keys(this.errors()).length === 0);

  readonly testRecipientValid = computed(() => EMAIL_PATTERN.test(this.testRecipient().trim()));

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.service
      .getEmailSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: settings => {
          this.hasPassword.set(settings.hasPassword);
          this.form.set({
            displayName: settings.displayName ?? '',
            senderEmail: settings.senderEmail ?? '',
            smtpUsername: settings.smtpUsername ?? '',
            password: '',
            smtpHost: settings.smtpHost ?? '',
            smtpPort: settings.smtpPort || 587,
            enableSsl: settings.enableSsl,
            useDefaultCredentials: settings.useDefaultCredentials,
            authenticationEnabled: settings.authenticationEnabled,
            connectionTimeout: settings.connectionTimeout || 30,
            portalUrl: settings.portalUrl ?? '',
            supportEmail: settings.supportEmail ?? '',
          });
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  patch(patch: Partial<SettingsForm>): void {
    this.form.update(f => ({ ...f, ...patch }));
  }

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  private toDto(): UpdateEmailSettings {
    const f = this.form();
    return {
      displayName: f.displayName.trim() || undefined,
      senderEmail: f.senderEmail.trim() || undefined,
      smtpUsername: f.smtpUsername.trim() || undefined,
      // Only send a password when one was entered — an empty value keeps the stored one.
      password: f.password ? f.password : undefined,
      smtpHost: f.smtpHost.trim() || undefined,
      smtpPort: f.smtpPort,
      enableSsl: f.enableSsl,
      useDefaultCredentials: f.useDefaultCredentials,
      authenticationEnabled: f.authenticationEnabled,
      connectionTimeout: f.connectionTimeout,
      portalUrl: f.portalUrl.trim() || undefined,
      supportEmail: f.supportEmail.trim() || undefined,
    };
  }

  save(): void {
    if (!this.canSave() || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.service
      .updateEmailSettings(this.toDto())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: settings => {
          this.saving.set(false);
          this.hasPassword.set(settings.hasPassword);
          // Clear the entered password so the field returns to its masked, write-only state.
          this.patch({ password: '' });
          this.showPassword.set(false);
          this.toaster.success(this.t('::GeoForge:EmailSettings:Saved'));
        },
        error: () => this.saving.set(false),
      });
  }

  openTestDialog(): void {
    this.testRecipient.set('');
    this.testDialogOpen.set(true);
  }

  closeTestDialog(): void {
    this.testDialogOpen.set(false);
  }

  sendTest(): void {
    if (!this.testRecipientValid() || this.testing()) {
      return;
    }

    this.testing.set(true);
    this.service
      .sendTestEmail({ recipientEmail: this.testRecipient().trim(), settings: this.toDto() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.testing.set(false);
          this.testDialogOpen.set(false);
          this.toaster.success(this.t('::GeoForge:EmailSettings:TestSent'));
        },
        // ABP surfaces the sanitized, localized backend message; no need to echo raw error text.
        error: () => this.testing.set(false),
      });
  }

  private emptyForm(): SettingsForm {
    return {
      displayName: '',
      senderEmail: '',
      smtpUsername: '',
      password: '',
      smtpHost: '',
      smtpPort: 587,
      enableSsl: true,
      useDefaultCredentials: false,
      authenticationEnabled: true,
      connectionTimeout: 30,
      portalUrl: '',
      supportEmail: '',
    };
  }

  private t(key: string, ...params: string[]): string {
    return this.localization.instant({ key, defaultValue: key }, ...params);
  }
}
