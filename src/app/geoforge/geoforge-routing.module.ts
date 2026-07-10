import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard, permissionGuard } from '@abp/ng.core';
import { DataSourceUploadComponent } from './components/data-source-upload/data-source-upload.component';
import { LayerDetailComponent } from './components/layer-detail/layer-detail.component';
import { LayerListComponent } from './components/layer-list/layer-list.component';
import { AuditLogListComponent } from './components/monitoring/audit-log-list/audit-log-list.component';
import { ClientAnalyticsComponent } from './components/monitoring/client-analytics/client-analytics.component';
import { GeoForgeDashboardComponent } from './components/monitoring/geoforge-dashboard/geoforge-dashboard.component';
import { IncidentListComponent } from './components/monitoring/incident-list/incident-list.component';
import { LayerAnalyticsComponent } from './components/monitoring/layer-analytics/layer-analytics.component';
import { LayerHealthComponent } from './components/monitoring/layer-health/layer-health.component';

/**
 * Routes mirror the permission names defined in `GeoForgePermissions`. The guards are a UX
 * affordance only — the server enforces the same permissions on every endpoint, and a layer's
 * public/private state is checked there too.
 *
 * `layers/:id/analytics` is declared before `layers/:id` would otherwise swallow it. Angular
 * matches in declaration order, and a two-segment route registered after a one-segment wildcard
 * is unreachable.
 */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'layers' },
  {
    path: 'dashboard',
    component: GeoForgeDashboardComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Dashboard' },
  },
  {
    path: 'layers',
    component: LayerListComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Layers' },
  },
  {
    path: 'layers/:id/analytics',
    component: LayerAnalyticsComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Analytics' },
  },
  {
    path: 'layers/:id',
    component: LayerDetailComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Layers' },
  },
  {
    path: 'clients/:id/analytics',
    component: ClientAnalyticsComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Analytics' },
  },
  {
    path: 'audit-logs',
    component: AuditLogListComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.RequestLogs' },
  },
  {
    path: 'incidents',
    component: IncidentListComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Incidents' },
  },
  {
    path: 'health',
    component: LayerHealthComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Health' },
  },
  {
    path: 'import',
    component: DataSourceUploadComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.DataSources.Import' },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GeoForgeRoutingModule {}
