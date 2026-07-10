import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { GeoForgeService } from '../../services/geoforge.service';
import {
  CLIENT_ID_CREATED_TEMPLATE_KEY,
  EmailTemplate,
  UpdateEmailTemplate,
} from '../../models/geoforge.models';

/** The editable working copy of the selected template. */
interface TemplateEditor {
  subject: string;
  body: string;
  isEnabled: boolean;
  isHtml: boolean;
}

const TOKEN_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * The email-templates page at /geoforge/email-templates.
 *
 * <p>A master-detail over the six predefined templates. There is no add or delete — the catalogue
 * is system-owned. The editor validates placeholders as you type (unknown tokens are flagged before
 * a save the backend would refuse anyway), guards against navigating away with unsaved edits, and
 * previews with the unsaved content so an operator sees the real shape before saving.</p>
 */
@Component({
  selector: 'app-email-templates',
  standalone: false,
  templateUrl: './email-templates.component.html',
})
export class EmailTemplatesComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly toaster = inject(ToasterService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  readonly restoring = signal(false);
  readonly previewing = signal(false);

  readonly templates = signal<EmailTemplate[]>([]);
  readonly selectedKey = signal<string>('');
  readonly editor = signal<TemplateEditor>({ subject: '', body: '', isEnabled: true, isHtml: true });

  readonly previewDialogOpen = signal(false);
  readonly previewRecipient = signal('');

  readonly selected = computed<EmailTemplate | undefined>(() =>
    this.templates().find(t => t.templateKey === this.selectedKey()),
  );

  readonly dirty = computed<boolean>(() => {
    const t = this.selected();
    const e = this.editor();
    if (!t) {
      return false;
    }
    return t.subject !== e.subject || t.body !== e.body || t.isEnabled !== e.isEnabled || t.isHtml !== e.isHtml;
  });

  /** Placeholder tokens used in the editor that are not in the supported set (or the secret out of place). */
  readonly unknownPlaceholders = computed<string[]>(() => {
    const t = this.selected();
    if (!t) {
      return [];
    }
    const e = this.editor();
    const allowed = new Set(t.availablePlaceholders);
    const unknown = new Set<string>();

    for (const text of [e.subject, e.body]) {
      // A fresh regex per pass, so its lastIndex state never leaks between calls.
      const re = new RegExp(TOKEN_PATTERN.source, 'g');
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const name = match[1];
        if (!allowed.has(name)) {
          unknown.add(name);
        }
        // The secret is only valid in the creation template.
        if (name === 'ClientSecret' && t.templateKey !== CLIENT_ID_CREATED_TEMPLATE_KEY) {
          unknown.add(name);
        }
      }
    }
    return Array.from(unknown);
  });

  readonly previewRecipientValid = computed(() =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.previewRecipient().trim()),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.service
      .getEmailTemplates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: templates => {
          this.templates.set(templates);
          this.loading.set(false);
          if (templates.length > 0) {
            this.applySelection(templates[0]);
          }
        },
        // Surface a retryable error state rather than an indistinguishable empty page — the symptom
        // that hid a missing table/seed. An empty (but successful) list renders its own empty state.
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }

  private applySelection(template: EmailTemplate): void {
    this.selectedKey.set(template.templateKey);
    this.editor.set({
      subject: template.subject,
      body: template.body,
      isEnabled: template.isEnabled,
      isHtml: template.isHtml,
    });
  }

  select(template: EmailTemplate): void {
    if (template.templateKey === this.selectedKey()) {
      return;
    }
    if (this.dirty()) {
      this.confirmation
        .warn(this.t('::GeoForge:EmailTemplates:DiscardChanges'), this.t('::GeoForge:EmailTemplates:Title'))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(status => {
          if (status === Confirmation.Status.confirm) {
            this.applySelection(template);
          }
        });
      return;
    }
    this.applySelection(template);
  }

  patch(patch: Partial<TemplateEditor>): void {
    this.editor.update(e => ({ ...e, ...patch }));
  }

  /** The template display name, localized by key when a translation exists, else the seeded name. */
  templateName(template: EmailTemplate): string {
    const key = `::GeoForge:EmailTemplate:${template.templateKey}`;
    const localized = this.t(key);
    return localized === key ? template.displayName : localized;
  }

  copyPlaceholder(token: string): void {
    void navigator.clipboard
      .writeText(`{{${token}}}`)
      .then(() => this.toaster.info(this.t('::GeoForge:Common:Copied')));
  }

  save(): void {
    const template = this.selected();
    if (!template || this.saving() || this.unknownPlaceholders().length > 0) {
      return;
    }

    const e = this.editor();
    const input: UpdateEmailTemplate = {
      subject: e.subject,
      body: e.body,
      isEnabled: e.isEnabled,
      isHtml: e.isHtml,
      concurrencyStamp: template.concurrencyStamp,
    };

    this.saving.set(true);
    this.service
      .updateEmailTemplate(template.templateKey, input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.saving.set(false);
          this.replaceTemplate(updated);
          this.applySelection(updated);
          this.toaster.success(this.t('::GeoForge:EmailTemplates:Saved'));
        },
        error: () => this.saving.set(false),
      });
  }

  restore(): void {
    const template = this.selected();
    if (!template) {
      return;
    }
    this.confirmation
      .warn(this.t('::GeoForge:EmailTemplates:RestoreConfirm'), this.t('::GeoForge:EmailTemplates:Restore'))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status !== Confirmation.Status.confirm) {
          return;
        }
        this.restoring.set(true);
        this.service
          .restoreEmailTemplate(template.templateKey)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: restored => {
              this.restoring.set(false);
              this.replaceTemplate(restored);
              this.applySelection(restored);
              this.toaster.success(this.t('::GeoForge:EmailTemplates:Restored'));
            },
            error: () => this.restoring.set(false),
          });
      });
  }

  openPreviewDialog(): void {
    this.previewRecipient.set('');
    this.previewDialogOpen.set(true);
  }

  closePreviewDialog(): void {
    this.previewDialogOpen.set(false);
  }

  sendPreview(): void {
    const template = this.selected();
    if (!template || !this.previewRecipientValid() || this.previewing()) {
      return;
    }
    const e = this.editor();
    this.previewing.set(true);
    this.service
      .sendTemplatePreview(template.templateKey, {
        recipientEmail: this.previewRecipient().trim(),
        // Preview the unsaved editor content.
        subject: e.subject,
        body: e.body,
        isHtml: e.isHtml,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.previewing.set(false);
          this.previewDialogOpen.set(false);
          this.toaster.success(this.t('::GeoForge:EmailTemplates:PreviewSent'));
        },
        error: () => this.previewing.set(false),
      });
  }

  /** Consulted by the unsaved-changes route guard. */
  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  /** Returns an observable the guard can wait on: confirm discard, or allow when clean. */
  confirmDiscard(): Observable<Confirmation.Status> {
    return this.confirmation.warn(
      this.t('::GeoForge:EmailTemplates:DiscardChanges'),
      this.t('::GeoForge:EmailTemplates:Title'),
    );
  }

  private replaceTemplate(updated: EmailTemplate): void {
    this.templates.update(list => list.map(t => (t.templateKey === updated.templateKey ? updated : t)));
  }

  private t(key: string, ...params: string[]): string {
    return this.localization.instant({ key, defaultValue: key }, ...params);
  }
}
