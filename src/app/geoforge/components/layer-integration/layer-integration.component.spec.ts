import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { of } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
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
      'bulkGrantClientsToLayer',
      'bulkRemoveClientsFromLayer',
      'createApiClient',
      'revokeLayerAccess',
    ], { tokenUrl: 'http://x/auth/token' });

    service.getLayerClients.and.returnValue(of([] as LayerClient[]));
    service.getAvailableClientsForLayer.and.returnValue(
      of({ totalCount: 2, items: [selectableClient, suspendedClient] }),
    );
    service.bulkGrantClientsToLayer.and.returnValue(of({ added: 1, alreadyExists: 0, failed: 0 }));
    service.bulkRemoveClientsFromLayer.and.returnValue(of({ added: 1, alreadyExists: 0, failed: 0 }));
    service.revokeLayerAccess.and.returnValue(of(undefined as void));

    toaster = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'warn', 'info', 'error']);

    const confirmation = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['warn']);
    confirmation.warn.and.returnValue(of(Confirmation.Status.confirm));
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

  it('selects a client from the available list', fakeAsync(() => {
    init();
    component.toggleSelect(selectableClient);
    expect(component.selectedCount()).toBe(1);
    expect(component.isSelected('c1')).toBeTrue();
  }));

  it('grants selected clients and moves them from available into the granted table, no reload', fakeAsync(() => {
    init();
    component.toggleSelect(selectableClient);

    component.grant();
    tick();

    expect(service.bulkGrantClientsToLayer).toHaveBeenCalledWith('layer-1', {
      clientIds: ['c1'],
      sendEmail: true,
    });
    expect(toaster.success).toHaveBeenCalled();
    // Optimistic move: now in the granted table, gone from the available list, never in both.
    expect(component.grantedClients().some(c => c.id === 'c1')).toBeTrue();
    expect(component.availableClients().some(c => c.id === 'c1')).toBeFalse();
    expect(component.selectedCount()).toBe(0);
    expect(component.lastResult()).toEqual(jasmine.objectContaining({ added: 1, action: 'grant' }));
    // The lists are not refetched — the move is purely local.
    expect(service.getLayerClients).toHaveBeenCalledTimes(1); // only the initial load
  }));

  it('bulk-removes selected granted clients and moves them back to available', fakeAsync(() => {
    init();
    // First grant c1 so it sits in the granted table.
    component.toggleSelect(selectableClient);
    component.grant();
    tick();
    expect(component.grantedClients().some(c => c.id === 'c1')).toBeTrue();

    // Select it in the granted table and bulk-remove.
    component.toggleGranted('c1');
    expect(component.grantedSelectedCount()).toBe(1);
    component.removeSelectedGranted();
    tick();

    expect(service.bulkRemoveClientsFromLayer).toHaveBeenCalledWith('layer-1', {
      clientIds: ['c1'],
      sendEmail: true,
    });
    expect(component.grantedClients().some(c => c.id === 'c1')).toBeFalse();
    expect(component.availableClients().some(c => c.id === 'c1')).toBeTrue();
    expect(component.lastResult()).toEqual(jasmine.objectContaining({ action: 'remove' }));
  }));

  it('per-row revoke moves the client back to the available list', fakeAsync(() => {
    init();
    component.toggleSelect(selectableClient);
    component.grant();
    tick();
    const granted = component.grantedClients().find(c => c.id === 'c1')!;

    component.revokeLayer(granted);
    tick();

    expect(service.revokeLayerAccess).toHaveBeenCalledWith('c1', 'layer-1', true);
    expect(component.grantedClients().some(c => c.id === 'c1')).toBeFalse();
    expect(component.availableClients().some(c => c.id === 'c1')).toBeTrue();
  }));

  it('"Select all" selects every loaded client and toggles back to empty', fakeAsync(() => {
    init();

    component.toggleSelectAll();
    expect(component.selectedCount()).toBe(2);
    expect(component.allLoadedSelected()).toBeTrue();

    component.toggleSelectAll();
    expect(component.selectedCount()).toBe(0);
  }));

  it('passes the send-email switch through to the bulk call', fakeAsync(() => {
    init();
    component.toggleSelect(selectableClient);
    component.sendEmail.set(false);

    component.grant();
    tick();

    expect(service.bulkGrantClientsToLayer).toHaveBeenCalledWith('layer-1', {
      clientIds: ['c1'],
      sendEmail: false,
    });
  }));

  it('warns when acting with nothing selected', fakeAsync(() => {
    init();
    component.grant();
    expect(toaster.warn).toHaveBeenCalledWith('::GeoForge:Integration:SelectClientFirst');
    expect(service.bulkGrantClientsToLayer).not.toHaveBeenCalled();
  }));

  it('loads the next page when the virtual list nears its end', fakeAsync(() => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ ...selectableClient, id: 'p' + i }));
    service.getAvailableClientsForLayer.and.returnValues(
      of({ totalCount: 60, items: page1 }),
      of({ totalCount: 60, items: [{ ...selectableClient, id: 'p50' }] }),
    );

    init();
    expect(component.availableClients().length).toBe(50);
    expect(component.hasMore()).toBeTrue();

    component.onScrolledIndexChange(45); // within the buffer of the end
    tick();

    expect(component.availableClients().length).toBe(51);
    expect(service.getAvailableClientsForLayer).toHaveBeenCalledTimes(2);
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
