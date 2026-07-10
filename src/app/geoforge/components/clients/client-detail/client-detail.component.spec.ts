import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { Confirmation, ConfirmationService, ToasterService } from '@abp/ng.theme.shared';
import { LocalizationService } from '@abp/ng.core';
import { ClientDetailComponent } from './client-detail.component';
import { GeoForgeService } from '../../../services/geoforge.service';
import { ApiClient } from '../../../models/geoforge.models';

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
    notifyOnPermissionChange: true,
    notifyOnLayerAccessChange: true,
    notifyOnStatusChange: true,
    notifyOnQuotaChange: true,
    ...over,
  } as ApiClient;
}

describe('ClientDetailComponent', () => {
  let fixture: ComponentFixture<ClientDetailComponent>;
  let component: ClientDetailComponent;
  let service: jasmine.SpyObj<GeoForgeService>;
  let confirmation: jasmine.SpyObj<ConfirmationService>;

  function build(current: ApiClient): void {
    service.getApiClient.and.returnValue(of(current));
    fixture = TestBed.createComponent(ClientDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<GeoForgeService>('GeoForgeService', [
      'getApiClient',
      'suspendApiClient',
      'activateApiClient',
      'revokeApiClient',
      'grantLayerAccess',
      'revokeLayerAccess',
      'updateApiClient',
      'getClientLayers',
      'getLayers',
    ]);
    service.suspendApiClient.and.callFake(id => of(client({ id })));
    service.activateApiClient.and.callFake(id => of(client({ id })));
    service.updateApiClient.and.callFake((id, input) => of(client({ id, ...input })));
    service.grantLayerAccess.and.returnValue(of({} as never));
    service.getClientLayers.and.returnValue(of([]));
    service.getLayers.and.returnValue(of({ totalCount: 0, items: [] }));

    const toaster = jasmine.createSpyObj<ToasterService>('ToasterService', ['success', 'warn', 'info', 'error']);
    confirmation = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['warn']);
    confirmation.warn.and.returnValue(of(Confirmation.Status.confirm));

    const localization = jasmine.createSpyObj<LocalizationService>('LocalizationService', ['instant']);
    localization.instant.and.callFake((key: unknown) =>
      typeof key === 'string' ? key : (key as { key: string }).key,
    );

    const route = { snapshot: { paramMap: { get: () => 'client-1' } } };

    await TestBed.configureTestingModule({
      declarations: [ClientDetailComponent, MockLocalizationPipe],
      providers: [
        { provide: GeoForgeService, useValue: service },
        { provide: ToasterService, useValue: toaster },
        { provide: ConfirmationService, useValue: confirmation },
        { provide: LocalizationService, useValue: localization },
        { provide: ActivatedRoute, useValue: route },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('disables the notify checkbox when the client has no recipient email', () => {
    build(client({ contactEmail: undefined, notificationEmail: undefined }));
    expect(component.hasRecipient()).toBeFalse();
    expect(component.willNotify()).toBeFalse();
  });

  it('enables notifying when a contact or notification email exists', () => {
    build(client({ contactEmail: 'ops@acme.example' }));
    expect(component.hasRecipient()).toBeTrue();
    expect(component.willNotify()).toBeTrue();
    expect(component.recipientEmail()).toBe('ops@acme.example');
  });

  it('prefers the notification email over the contact email', () => {
    build(client({ contactEmail: 'contact@acme.example', notificationEmail: 'notify@acme.example' }));
    expect(component.recipientEmail()).toBe('notify@acme.example');
  });

  it('sends the sendEmailNotification flag explicitly on a status change', fakeAsync(() => {
    build(client({ contactEmail: 'ops@acme.example' }));

    component.suspend();
    tick();
    expect(service.suspendApiClient).toHaveBeenCalledWith('client-1', true);

    // Untick the operation checkbox: the flag must go through as false.
    component.notifyOnAction.set(false);
    component.suspend();
    tick();
    expect(service.suspendApiClient).toHaveBeenCalledWith('client-1', false);
  }));

  it('passes the flag on a layer grant', fakeAsync(() => {
    build(client({ contactEmail: 'ops@acme.example' }));
    component.selectedLayerToGrant.set('layer-9');
    component.grantLayer();
    tick();

    expect(service.grantLayerAccess).toHaveBeenCalledWith('client-1', {
      layerId: 'layer-9',
      sendEmailNotification: true,
    });
  }));

  it('saves notification preferences via the client update endpoint without triggering a change email', fakeAsync(() => {
    build(client({ contactEmail: 'ops@acme.example' }));
    component.patchNotif({ notifyOnQuotaChange: false, notificationEmail: 'notify@acme.example' });
    component.saveNotifications();
    tick();

    const [id, input] = service.updateApiClient.calls.mostRecent().args;
    expect(id).toBe('client-1');
    expect(input.notifyOnQuotaChange).toBeFalse();
    expect(input.notificationEmail).toBe('notify@acme.example');
    expect(input.sendEmailNotification).toBeFalse();
  }));
});
