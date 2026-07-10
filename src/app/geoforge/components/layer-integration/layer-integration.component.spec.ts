import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { LayerIntegrationComponent } from './layer-integration.component';
import { GeoForgeService } from '../../services/geoforge.service';
import { EmailTemplateStateService } from '../../services/email-template-state.service';
import {
  ApiClientEffectiveStatus,
  AvailableClient,
  ClientQuotaType,
  GisLayer,
  LayerClient,
} from '../../models/geoforge.models';

/**
 * The Integration Helper's client-access behaviour: switching between "choose existing" and
 * "create new", the guards on selecting an unselectable client, the duplicate-grant message, and
 * that creating a client grants it this layer. The snippet-building half is left alone; it is
 * pure string assembly with no branches worth a browser.
 */
/** Stubs the ABP localization pipe so the template renders without the full CoreModule. */
@Pipe({ name: 'abpLocalization', standalone: false })
class MockLocalizationPipe implements PipeTransform {
  transform(key: string): string {
    return key;
  }
}

describe('LayerIntegrationComponent', () => {
  let fixture: ComponentFixture<LayerIntegrationComponent>;
  let component: LayerIntegrationComponent;
  let service: jasmine.SpyObj<GeoForgeService>;
  let toaster: jasmine.SpyObj<ToasterService>;

  const layer = { id: 'layer-1', name: 'riyadh', isPublic: false, endpoints: { esriFeatureServer: 'http://x/FeatureServer' } } as unknown as GisLayer;

  const selectableClient: AvailableClient = {
    id: 'c1',
    name: 'Reporting',
    clientId: 'reporting',
    effectiveStatus: ApiClientEffectiveStatus.Active,
    quotaType: ClientQuotaType.Unlimited,
    usedRequests: 0,
    grantedLayerCount: 2,
    isAlreadyGranted: false,
    isSelectable: true,
  };

  const suspendedClient: AvailableClient = {
    ...selectableClient,
    id: 'c2',
    name: 'Suspended',
    clientId: 'suspended',
    effectiveStatus: ApiClientEffectiveStatus.Suspended,
    isSelectable: false,
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<GeoForgeService>('GeoForgeService', [
      'getLayerClients',
      'getAvailableClientsForLayer',
      'grantLayerAccess',
      'createApiClient',
      'revokeLayerAccess',
    ], { tokenUrl: 'http://x/auth/token' });

    service.getLayerClients.and.returnValue(of([] as LayerClient[]));
    service.getAvailableClientsForLayer.and.returnValue(
      of({ totalCount: 2, items: [selectableClient, suspendedClient] }),
    );

    toaster = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'warn', 'info', 'error']);

    const confirmation = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['warn']);
    const localization = jasmine.createSpyObj<LocalizationService>('LocalizationService', ['instant']);
    localization.instant.and.callFake((key: unknown) =>
      typeof key === 'string' ? key : (key as { key: string }).key,
    );

    const templateState = {
      enabledMap: () => of({} as Record<string, boolean>),
      isEnabled: () => true,
    };

    await TestBed.configureTestingModule({
      declarations: [LayerIntegrationComponent, MockLocalizationPipe],
      providers: [
        { provide: GeoForgeService, useValue: service },
        { provide: ToasterService, useValue: toaster },
        { provide: ConfirmationService, useValue: confirmation },
        { provide: LocalizationService, useValue: localization },
        { provide: EmailTemplateStateService, useValue: templateState },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(LayerIntegrationComponent);
    component = fixture.componentInstance;
    component.layer = layer;
  });

  /** Runs ngOnInit and lets the debounced picker query settle. Call inside a fakeAsync test. */
  function init(): void {
    fixture.detectChanges();
    tick(300);
  }

  it('defaults to the "choose existing" mode and loads candidates', fakeAsync(() => {
    init();
    expect(component.mode()).toBe('existing');
    expect(component.availableClients().length).toBe(2);
  }));

  it('switches to the create-new mode', fakeAsync(() => {
    init();
    component.setMode('new');
    expect(component.mode()).toBe('new');
  }));

  it('refuses to select a suspended (unselectable) client', fakeAsync(() => {
    init();
    component.select(suspendedClient);
    expect(component.selectedClientId()).toBeNull();
  }));

  it('selects a selectable client and grants it access', fakeAsync(() => {
    init();
    service.grantLayerAccess.and.returnValue(of({} as never));

    component.select(selectableClient);
    expect(component.selectedClientId()).toBe('c1');

    component.grantSelected();
    tick();

    expect(service.grantLayerAccess).toHaveBeenCalledWith('c1', { layerId: 'layer-1' });
    expect(toaster.success).toHaveBeenCalled();
    expect(component.selectedClientId()).toBeNull();
  }));

  it('shows a duplicate message instead of an error on a 409', fakeAsync(() => {
    init();
    service.grantLayerAccess.and.returnValue(throwError(() => ({ status: 409 })));

    component.select(selectableClient);
    component.grantSelected();
    tick();

    expect(toaster.warn).toHaveBeenCalledWith('::GeoForge:Integration:DuplicateToast');
  }));

  it('warns when granting with nothing selected', fakeAsync(() => {
    init();
    component.grantSelected();
    expect(toaster.warn).toHaveBeenCalledWith('::GeoForge:Integration:SelectClientFirst');
    expect(service.grantLayerAccess).not.toHaveBeenCalled();
  }));

  it('blocks creating until a name is present, and requires a limit for a limited quota', fakeAsync(() => {
    init();
    component.setMode('new');
    // Uncheck the send-credentials box so this test isolates the name/quota rules.
    component.patchForm({ sendCredentials: false });
    expect(component.canCreate()).toBeFalse();

    component.patchForm({ name: 'New client' });
    expect(component.canCreate()).toBeTrue();

    component.patchForm({ quotaType: ClientQuotaType.Limited, quotaLimit: null });
    expect(component.canCreate()).toBeFalse();

    component.patchForm({ quotaLimit: 1000 });
    expect(component.canCreate()).toBeTrue();
  }));

  it('requires a contact email when the send-credentials box is checked', fakeAsync(() => {
    init();
    component.setMode('new');
    component.patchForm({ name: 'New client' });

    // sendCredentials defaults to true, so a valid contact email is required.
    expect(component.willSendCredentials()).toBeTrue();
    expect(component.canCreate()).toBeFalse();

    component.patchForm({ contactEmail: 'ops@acme.example' });
    expect(component.canCreate()).toBeTrue();
  }));

  it('disables and ignores sending when the creation template is globally disabled', fakeAsync(() => {
    init();
    component.setMode('new');
    // Simulate the template being off: no contact email is then required.
    component.sendCredentialsTemplateEnabled.set(false);
    component.patchForm({ name: 'New client' });

    expect(component.willSendCredentials()).toBeFalse();
    expect(component.canCreate()).toBeTrue();
  }));

  it('creates a client already granted this layer, sends the flag explicitly, and reveals its secret once', fakeAsync(() => {
    init();
    service.createApiClient.and.returnValue(
      of({ client: { clientId: 'new-client' }, secret: 'S3CR3T' } as never),
    );

    component.setMode('new');
    component.patchForm({ name: 'New client', contactEmail: 'ops@acme.example' });
    component.createClient();
    tick();

    const arg = service.createApiClient.calls.mostRecent().args[0];
    expect(arg.grantedLayerIds).toEqual(['layer-1']);
    expect(arg.contactEmail).toBe('ops@acme.example');
    expect(arg.sendNotificationEmail).toBeTrue();
    expect(component.revealedSecret()).toEqual({ clientId: 'new-client', secret: 'S3CR3T' });
    // The operator is told the credentials email was queued, without the flow being treated as failed.
    expect(toaster.info).toHaveBeenCalled();
  }));
});
