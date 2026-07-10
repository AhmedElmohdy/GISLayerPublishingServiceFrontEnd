import { RoutesService, eLayoutType } from '@abp/ng.core';
import { inject, provideAppInitializer } from '@angular/core';

export const APP_ROUTE_PROVIDER = [
  provideAppInitializer(() => {
    configureRoutes();
  }),
];

function configureRoutes() {
  const routes = inject(RoutesService);
  routes.add([
      {
        path: '/',
        name: '::Menu:Home',
        iconClass: 'fas fa-home',
        order: 1,
        layout: eLayoutType.application,
      },
      {
        path: '/dashboard',
        name: '::Menu:Dashboard',
        iconClass: 'fas fa-chart-line',
        order: 2,
        layout: eLayoutType.application,
        requiredPolicy: 'GISLayerPublishingService.Dashboard.Host  || GISLayerPublishingService.Dashboard.Tenant',
      },
      {
        path: '/geoforge',
        name: '::Menu:GeoForge',
        iconClass: 'fas fa-layer-group',
        order: 3,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.Layers',
      },
      {
        path: '/geoforge/dashboard',
        name: '::Menu:GeoForge:Dashboard',
        parentName: '::Menu:GeoForge',
        order: 1,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.Dashboard',
      },
      {
        path: '/geoforge/layers',
        name: '::Menu:GeoForge:Layers',
        parentName: '::Menu:GeoForge',
        order: 2,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.Layers',
      },
      {
        path: '/geoforge/import',
        name: '::Menu:GeoForge:DataSources',
        parentName: '::Menu:GeoForge',
        order: 3,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.DataSources.Import',
      },
      {
        path: '/geoforge/health',
        name: '::Menu:GeoForge:Health',
        parentName: '::Menu:GeoForge',
        order: 4,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.Health',
      },
      {
        path: '/geoforge/incidents',
        name: '::Menu:GeoForge:Incidents',
        parentName: '::Menu:GeoForge',
        order: 5,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.Incidents',
      },
      {
        path: '/geoforge/audit-logs',
        name: '::Menu:GeoForge:AuditLogs',
        parentName: '::Menu:GeoForge',
        order: 6,
        layout: eLayoutType.application,
        requiredPolicy: 'GeoForge.RequestLogs',
      },
  ]);
}
