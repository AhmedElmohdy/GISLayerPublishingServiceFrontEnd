import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-dashboard',
  template: `
    <app-host-dashboard *abpPermission="'GISLayerPublishingService.Dashboard.Host'"></app-host-dashboard>
  `,
})
export class DashboardComponent {}
