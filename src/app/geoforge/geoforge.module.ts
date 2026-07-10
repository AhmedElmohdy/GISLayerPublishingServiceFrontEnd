import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { GeoForgeRoutingModule } from './geoforge-routing.module';
import { ClientDetailComponent } from './components/clients/client-detail/client-detail.component';
import { ClientListComponent } from './components/clients/client-list/client-list.component';
import { DataSourceUploadComponent } from './components/data-source-upload/data-source-upload.component';
import { EmailSettingsComponent } from './components/email-settings/email-settings.component';
import { EmailTemplatesComponent } from './components/email-templates/email-templates.component';
import { LayerDetailComponent } from './components/layer-detail/layer-detail.component';
import { LayerIntegrationComponent } from './components/layer-integration/layer-integration.component';
import { LayerListComponent } from './components/layer-list/layer-list.component';
import { LayerMapComponent } from './components/layer-map/layer-map.component';
import { AuditLogListComponent } from './components/monitoring/audit-log-list/audit-log-list.component';
import { BarChartComponent } from './components/monitoring/bar-chart.component';
import { ClientAnalyticsComponent } from './components/monitoring/client-analytics/client-analytics.component';
import { DateRangeComponent } from './components/monitoring/date-range.component';
import { DonutChartComponent } from './components/monitoring/donut-chart.component';
import { GeoForgeDashboardComponent } from './components/monitoring/geoforge-dashboard/geoforge-dashboard.component';
import { IncidentListComponent } from './components/monitoring/incident-list/incident-list.component';
import { KpiCardComponent } from './components/monitoring/kpi-card.component';
import { LayerAnalyticsComponent } from './components/monitoring/layer-analytics/layer-analytics.component';
import { LayerHealthComponent } from './components/monitoring/layer-health/layer-health.component';
import { LineChartComponent } from './components/monitoring/line-chart.component';
import { PanelComponent } from './components/monitoring/panel.component';
import { StatusBadgeComponent } from './components/monitoring/status-badge.component';

/**
 * GeoForge admin UI: import a dataset, browse the layer catalog, inspect a layer, preview it on
 * a map and copy the endpoint URLs a consuming application needs — plus the monitoring and
 * analytics surface.
 *
 * `LayerMapComponent` is declared here, but the ArcGIS Maps SDK it drives is not imported by
 * this module — the component pulls it in with a dynamic `import()` the first time a Map tab is
 * opened, so the SDK never reaches the initial bundle.
 *
 * The monitoring charts are hand-written SVG rather than a charting library. They read the
 * LeptonX theme's CSS custom properties directly, which is what makes light, dim, dark and RTL
 * work with no JavaScript and no per-theme configuration.
 */
@NgModule({
  declarations: [
    LayerListComponent,
    LayerDetailComponent,
    LayerIntegrationComponent,
    LayerMapComponent,
    DataSourceUploadComponent,

    // Client administration
    ClientListComponent,
    ClientDetailComponent,

    // Email notifications
    EmailSettingsComponent,
    EmailTemplatesComponent,

    // Monitoring primitives
    KpiCardComponent,
    PanelComponent,
    StatusBadgeComponent,
    DateRangeComponent,
    LineChartComponent,
    BarChartComponent,
    DonutChartComponent,

    // Monitoring pages
    GeoForgeDashboardComponent,
    LayerAnalyticsComponent,
    ClientAnalyticsComponent,
    AuditLogListComponent,
    IncidentListComponent,
    LayerHealthComponent,
  ],
  imports: [SharedModule, GeoForgeRoutingModule],
})
export class GeoForgeModule {}
