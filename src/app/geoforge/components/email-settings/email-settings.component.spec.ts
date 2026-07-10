import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { of } from 'rxjs';
import { ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { EmailSettingsComponent } from './email-settings.component';
import { GeoForgeService } from '../../services/geoforge.service';
import { EmailSettings } from '../../models/geoforge.models';

/** Stubs the ABP localization pipe so the template renders without the full CoreModule. */
@Pipe({ name: 'abpLocalization', standalone: false })
class MockLocalizationPipe implements PipeTransform {
  transform(key: string): string {
    return key;
  }
}

describe('EmailSettingsComponent', () => {
  let fixture: ComponentFixture<EmailSettingsComponent>;
  let component: EmailSettingsComponent;
  let service: jasmine.SpyObj<GeoForgeService>;
  let toaster: jasmine.SpyObj<ToasterService>;

  const stored: EmailSettings = {
    displayName: 'GeoForge',
    senderEmail: 'noreply@example.com',
    smtpUsername: 'mailer',
    hasPassword: true,
    smtpHost: 'smtp.mailersend.net',
    smtpPort: 587,
    enableSsl: true,
    useDefaultCredentials: false,
    authenticationEnabled: true,
    connectionTimeout: 30,
    portalUrl: 'https://portal.example.com',
    supportEmail: 'support@example.com',
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<GeoForgeService>('GeoForgeService', [
      'getEmailSettings',
      'updateEmailSettings',
      'sendTestEmail',
    ]);
    service.getEmailSettings.and.returnValue(of(stored));
    service.updateEmailSettings.and.returnValue(of(stored));
    service.sendTestEmail.and.returnValue(of(void 0));

    toaster = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'warn', 'info', 'error']);
    const localization = jasmine.createSpyObj<LocalizationService>('LocalizationService', ['instant']);
    localization.instant.and.callFake((key: unknown) =>
      typeof key === 'string' ? key : (key as { key: string }).key,
    );

    await TestBed.configureTestingModule({
      declarations: [EmailSettingsComponent, MockLocalizationPipe],
      providers: [
        { provide: GeoForgeService, useValue: service },
        { provide: ToasterService, useValue: toaster },
        { provide: LocalizationService, useValue: localization },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the settings and marks that a password is stored, without returning it', () => {
    expect(component.hasPassword()).toBeTrue();
    expect(component.form().smtpHost).toBe('smtp.mailersend.net');
    expect(component.form().password).toBe('');
  });

  it('flags a missing host and an out-of-range port', () => {
    component.patch({ smtpHost: '' });
    expect(component.errors()['smtpHost']).toBeTruthy();
    expect(component.canSave()).toBeFalse();

    component.patch({ smtpHost: 'smtp.x', smtpPort: 70000 });
    expect(component.errors()['smtpPort']).toBeTruthy();
    expect(component.canSave()).toBeFalse();
  });

  it('requires a username when authentication is enabled and default credentials are off', () => {
    component.patch({ authenticationEnabled: true, useDefaultCredentials: false, smtpUsername: '' });
    expect(component.errors()['smtpUsername']).toBeTruthy();

    component.patch({ useDefaultCredentials: true });
    expect(component.errors()['smtpUsername']).toBeFalsy();
  });

  it('validates the sender email format', () => {
    component.patch({ senderEmail: 'not-an-email' });
    expect(component.errors()['senderEmail']).toBeTruthy();

    component.patch({ senderEmail: 'ok@example.com' });
    expect(component.errors()['senderEmail']).toBeFalsy();
  });

  it('keeps the stored password when the password field is left empty', fakeAsync(() => {
    // The field starts empty (password write-only). Save without entering one.
    component.save();
    tick();

    const arg = service.updateEmailSettings.calls.mostRecent().args[0];
    expect(arg.password).toBeUndefined();
    expect(toaster.success).toHaveBeenCalled();
  }));

  it('sends a new password only when one is entered', fakeAsync(() => {
    component.patch({ password: 'brand-new' });
    component.save();
    tick();

    expect(service.updateEmailSettings.calls.mostRecent().args[0].password).toBe('brand-new');
  }));

  it('sends the test email using the values currently in the form, including unsaved ones', fakeAsync(() => {
    // Change the host in the form but do NOT save it.
    component.patch({ smtpHost: 'unsaved-host.example', smtpPort: 2525 });
    component.openTestDialog();
    component.testRecipient.set('tester@example.com');
    component.sendTest();
    tick();

    const arg = service.sendTestEmail.calls.mostRecent().args[0];
    expect(arg.recipientEmail).toBe('tester@example.com');
    expect(arg.settings.smtpHost).toBe('unsaved-host.example');
    expect(arg.settings.smtpPort).toBe(2525);
    expect(toaster.success).toHaveBeenCalled();
  }));
});
