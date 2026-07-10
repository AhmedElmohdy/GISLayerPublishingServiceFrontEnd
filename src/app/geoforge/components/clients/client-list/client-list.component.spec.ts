import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { of } from 'rxjs';
import { ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { ClientListComponent } from './client-list.component';
import { GeoForgeService } from '../../../services/geoforge.service';
import { EmailTemplateStateService } from '../../../services/email-template-state.service';
import {
  ApiClient,
  ApiClientSecret,
  CLIENT_ID_CREATED_TEMPLATE_KEY,
  ClientQuotaType,
} from '../../../models/geoforge.models';

@Pipe({ name: 'abpLocalization', standalone: false })
class MockLocalizationPipe implements PipeTransform {
  transform(key: string): string {
    return key;
  }
}

function client(over: Partial<ApiClient> = {}): ApiClient {
  return {
    id: 'client-1',
    name: 'Acme',
    clientId: 'acme',
    status: 0,
    effectiveStatus: 0,
    quotaType: 0,
    usedRequests: 0,
    isQuotaExhausted: false,
    quotaResetPolicy: 0,
    environment: 0,
    grantedLayers: [],
    grantedLayerCount: 0,
    creationTime: '2026-01-01T00:00:00Z',
    ...over,
  } as ApiClient;
}

/**
 * Covers the "New client" panel added to the global client list: its open/close toggle, the
 * {@link ClientListComponent.canCreate} validation gate (name, limited-quota, send-credentials +
 * contact email), and that {@link ClientListComponent.createClient} posts a create with no layer
 * grant and reveals the one-time secret on success.
 */
describe('ClientListComponent — new-client panel', () => {
  let fixture: ComponentFixture<ClientListComponent>;
  let component: ClientListComponent;
  let service: jasmine.SpyObj<GeoForgeService>;
  let toaster: jasmine.SpyObj<ToasterService>;
  let templateEnabled: boolean;

  /** Builds the component; ngOnInit resolves the template-enabled state and the first page. */
  function build(): void {
    fixture = TestBed.createComponent(ClientListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit
    tick(300); // flush the debounced initial reload
  }

  beforeEach(async () => {
    templateEnabled = true;

    service = jasmine.createSpyObj<GeoForgeService>('GeoForgeService', [
      'getApiClients',
      'createApiClient',
    ]);
    service.getApiClients.and.returnValue(of({ totalCount: 1, items: [client()] }));
    service.createApiClient.and.callFake((input): ReturnType<GeoForgeService['createApiClient']> => {
      const secret: ApiClientSecret = {
        client: client({ clientId: 'new-client', name: input.name }),
        secret: 'PLAINTEXT-SECRET-VALUE',
      };
      return of(secret);
    });

    toaster = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'warn', 'info', 'error']);
    const confirmation = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['warn']);

    const localization = jasmine.createSpyObj<LocalizationService>('LocalizationService', ['instant']);
    localization.instant.and.callFake((key: unknown) =>
      typeof key === 'string' ? key : (key as { key: string }).key,
    );

    const templateState = jasmine.createSpyObj<EmailTemplateStateService>('EmailTemplateStateService', [
      'enabledMap',
      'isEnabled',
    ]);
    templateState.enabledMap.and.callFake(() =>
      of({ [CLIENT_ID_CREATED_TEMPLATE_KEY]: templateEnabled }),
    );
    templateState.isEnabled.and.callFake((map, key) => map[key] !== false);

    await TestBed.configureTestingModule({
      declarations: [ClientListComponent, MockLocalizationPipe],
      providers: [
        { provide: GeoForgeService, useValue: service },
        { provide: ToasterService, useValue: toaster },
        { provide: ConfirmationService, useValue: confirmation },
        { provide: LocalizationService, useValue: localization },
        { provide: EmailTemplateStateService, useValue: templateState },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('toggles the create panel open and closed, resetting the form on open', fakeAsync(() => {
    build();
    expect(component.showCreate()).toBeFalse();

    component.patchForm({ name: 'stale' });
    component.toggleCreate();
    expect(component.showCreate()).toBeTrue();
    expect(component.form().name).toBe(''); // reset on open
    expect(component.form().sendCredentials).toBeFalse(); // off by default: name-only is submittable
    expect(component.canCreate()).toBeFalse(); // still needs a name
    component.patchForm({ name: 'Reporting' });
    expect(component.canCreate()).toBeTrue(); // no email needed when not sending credentials

    component.toggleCreate();
    expect(component.showCreate()).toBeFalse();
  }));

  it('blocks create until a non-blank name is entered', fakeAsync(() => {
    build();
    component.toggleCreate();
    component.patchForm({ sendCredentials: false });

    expect(component.canCreate()).toBeFalse();
    component.patchForm({ name: '   ' });
    expect(component.canCreate()).toBeFalse();
    component.patchForm({ name: 'Reporting Integration' });
    expect(component.canCreate()).toBeTrue();
  }));

  it('requires a positive quota limit when the quota is Limited', fakeAsync(() => {
    build();
    component.patchForm({ name: 'Reporting', sendCredentials: false, quotaType: ClientQuotaType.Limited });

    component.patchForm({ quotaLimit: null });
    expect(component.canCreate()).toBeFalse();
    component.patchForm({ quotaLimit: 0 });
    expect(component.canCreate()).toBeFalse();
    component.patchForm({ quotaLimit: 5000 });
    expect(component.canCreate()).toBeTrue();
  }));

  it('requires a valid contact email only when credentials will be emailed', fakeAsync(() => {
    build();
    component.patchForm({ name: 'Reporting', sendCredentials: true });
    expect(component.willSendCredentials()).toBeTrue();

    // send-on + no/invalid email -> blocked
    expect(component.canCreate()).toBeFalse();
    component.patchForm({ contactEmail: 'not-an-email' });
    expect(component.canCreate()).toBeFalse();
    component.patchForm({ contactEmail: 'ops@acme.example' });
    expect(component.canCreate()).toBeTrue();

    // turning the send off drops the email requirement
    component.patchForm({ sendCredentials: false, contactEmail: '' });
    expect(component.canCreate()).toBeTrue();
  }));

  it('does not require a contact email when the creation template is disabled', fakeAsync(() => {
    templateEnabled = false;
    build();
    component.patchForm({ name: 'Reporting', sendCredentials: true });

    expect(component.sendCredentialsTemplateEnabled()).toBeFalse();
    expect(component.willSendCredentials()).toBeFalse();
    expect(component.canCreate()).toBeTrue(); // email not required, since nothing will be sent
  }));

  it('creates a client with no layer grant and reveals the one-time secret', fakeAsync(() => {
    build();
    component.toggleCreate();
    component.patchForm({
      name: '  Reporting Integration  ',
      quotaType: ClientQuotaType.Limited,
      quotaLimit: 1000,
      sendCredentials: false,
    });

    component.createClient();
    tick(300);

    expect(service.createApiClient).toHaveBeenCalledTimes(1);
    const input = service.createApiClient.calls.mostRecent().args[0];
    expect(input.name).toBe('Reporting Integration'); // trimmed
    expect(input.quotaType).toBe(ClientQuotaType.Limited);
    expect(input.quotaLimit).toBe(1000);
    expect(input.grantedLayerIds).toEqual([]); // the admin list grants no layer
    expect(input.sendNotificationEmail).toBeFalse();

    expect(component.revealedSecret()).toEqual({
      clientId: 'new-client',
      secret: 'PLAINTEXT-SECRET-VALUE',
    });
    expect(component.showCreate()).toBeFalse(); // panel closes on success
    expect(toaster.success).toHaveBeenCalled();
  }));

  it('sends the credentials email flag and omits the quota limit for an unlimited client', fakeAsync(() => {
    build();
    component.toggleCreate();
    component.patchForm({
      name: 'Emailed Client',
      quotaType: ClientQuotaType.Unlimited,
      quotaLimit: 999, // should be dropped for an unlimited client
      sendCredentials: true,
      contactEmail: 'ops@acme.example',
    });

    component.createClient();
    tick(300);

    const input = service.createApiClient.calls.mostRecent().args[0];
    expect(input.quotaLimit).toBeUndefined();
    expect(input.sendNotificationEmail).toBeTrue();
    expect(input.contactEmail).toBe('ops@acme.example');
    expect(toaster.info).toHaveBeenCalled(); // "credentials email queued" notice
  }));
});
