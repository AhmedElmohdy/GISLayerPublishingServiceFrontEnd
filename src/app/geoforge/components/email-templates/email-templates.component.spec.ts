import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { of } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { EmailTemplatesComponent } from './email-templates.component';
import { GeoForgeService } from '../../services/geoforge.service';
import { EmailTemplate } from '../../models/geoforge.models';

@Pipe({ name: 'abpLocalization', standalone: false })
class MockLocalizationPipe implements PipeTransform {
  transform(key: string): string {
    return key;
  }
}

const PLACEHOLDERS = ['ClientName', 'ClientId', 'RecipientName', 'NewStatus', 'PortalUrl', 'ClientSecret'];

function template(key: string, over: Partial<EmailTemplate> = {}): EmailTemplate {
  return {
    id: key,
    templateKey: key,
    displayName: key,
    description: 'desc',
    subject: `Subject for ${key}`,
    body: `<p>Body {{ClientName}}</p>`,
    isEnabled: true,
    isHtml: true,
    creationTime: '2026-01-01T00:00:00Z',
    concurrencyStamp: 'stamp-1',
    availablePlaceholders: PLACEHOLDERS,
    ...over,
  };
}

describe('EmailTemplatesComponent', () => {
  let fixture: ComponentFixture<EmailTemplatesComponent>;
  let component: EmailTemplatesComponent;
  let service: jasmine.SpyObj<GeoForgeService>;
  let confirmation: jasmine.SpyObj<ConfirmationService>;

  const templates = [
    template('ClientIdCreated'),
    template('ClientStatusChanged'),
    template('ClientQuotaChanged'),
  ];

  beforeEach(async () => {
    service = jasmine.createSpyObj<GeoForgeService>('GeoForgeService', [
      'getEmailTemplates',
      'updateEmailTemplate',
      'restoreEmailTemplate',
      'sendTemplatePreview',
    ]);
    service.getEmailTemplates.and.returnValue(of(templates));
    service.updateEmailTemplate.and.callFake((key, input) =>
      of(template(key, { ...input, concurrencyStamp: 'stamp-2' })),
    );
    service.restoreEmailTemplate.and.callFake(key => of(template(key, { subject: `Subject for ${key}` })));
    service.sendTemplatePreview.and.returnValue(of(void 0));

    const toaster = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'warn', 'info', 'error']);
    confirmation = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['warn']);
    confirmation.warn.and.returnValue(of(Confirmation.Status.confirm));

    const localization = jasmine.createSpyObj<LocalizationService>('LocalizationService', ['instant']);
    localization.instant.and.callFake((key: unknown) =>
      typeof key === 'string' ? key : (key as { key: string }).key,
    );

    await TestBed.configureTestingModule({
      declarations: [EmailTemplatesComponent, MockLocalizationPipe],
      providers: [
        { provide: GeoForgeService, useValue: service },
        { provide: ToasterService, useValue: toaster },
        { provide: ConfirmationService, useValue: confirmation },
        { provide: LocalizationService, useValue: localization },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailTemplatesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the predefined templates and selects the first', () => {
    expect(component.templates().length).toBe(3);
    expect(component.selectedKey()).toBe('ClientIdCreated');
  });

  it('exposes no create or delete actions — the catalogue is fixed', () => {
    expect((component as unknown as Record<string, unknown>)['createTemplate']).toBeUndefined();
    expect((component as unknown as Record<string, unknown>)['deleteTemplate']).toBeUndefined();
    // The service has no create/delete template API either.
    expect('createEmailTemplate' in GeoForgeService.prototype).toBeFalse();
    expect('deleteEmailTemplate' in GeoForgeService.prototype).toBeFalse();
  });

  it('marks the editor dirty on edit and saves the subject and body', fakeAsync(() => {
    component.patch({ subject: 'Edited subject {{ClientName}}' });
    expect(component.dirty()).toBeTrue();

    component.save();
    tick();

    const [key, input] = service.updateEmailTemplate.calls.mostRecent().args;
    expect(key).toBe('ClientIdCreated');
    expect(input.subject).toBe('Edited subject {{ClientName}}');
    expect(component.dirty()).toBeFalse();
  }));

  it('flags an unknown placeholder and blocks the save', fakeAsync(() => {
    component.patch({ body: '<p>{{NoSuchToken}}</p>' });
    expect(component.unknownPlaceholders()).toContain('NoSuchToken');

    component.save();
    tick();
    expect(service.updateEmailTemplate).not.toHaveBeenCalled();
  }));

  it('flags the secret placeholder outside the creation template', fakeAsync(() => {
    // Select a non-creation template, then reference the secret.
    component.select(templates[1]);
    tick();
    component.patch({ body: 'Secret is {{ClientSecret}}' });
    expect(component.unknownPlaceholders()).toContain('ClientSecret');
  }));

  it('restores a template to its default after confirmation', fakeAsync(() => {
    component.patch({ subject: 'temporary' });
    component.restore();
    tick();

    expect(confirmation.warn).toHaveBeenCalled();
    expect(service.restoreEmailTemplate).toHaveBeenCalledWith('ClientIdCreated');
  }));

  it('previews with the unsaved editor content', fakeAsync(() => {
    component.patch({ subject: 'Unsaved preview subject' });
    component.openPreviewDialog();
    component.previewRecipient.set('preview@example.com');
    component.sendPreview();
    tick();

    const [, input] = service.sendTemplatePreview.calls.mostRecent().args;
    expect(input.recipientEmail).toBe('preview@example.com');
    expect(input.subject).toBe('Unsaved preview subject');
  }));

  it('reports unsaved changes to the route guard', () => {
    expect(component.hasUnsavedChanges()).toBeFalse();
    component.patch({ subject: 'dirty now' });
    expect(component.hasUnsavedChanges()).toBeTrue();
  });
});
