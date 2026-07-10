import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { GeoForgeRoutingModule } from './geoforge-routing.module';
import { DataSourceUploadComponent } from './components/data-source-upload/data-source-upload.component';
import { LayerDetailComponent } from './components/layer-detail/layer-detail.component';
import { LayerIntegrationComponent } from './components/layer-integration/layer-integration.component';
import { LayerListComponent } from './components/layer-list/layer-list.component';
import { LayerMapComponent } from './components/layer-map/layer-map.component';

/**
 * GeoForge admin UI: import a dataset, browse the layer catalog, inspect a layer, preview it on
 * a map and copy the endpoint URLs a consuming application needs.
 *
 * `LayerMapComponent` is declared here, but the ArcGIS Maps SDK it drives is not imported by
 * this module — the component pulls it in with a dynamic `import()` the first time a Map tab is
 * opened, so the SDK never reaches the initial bundle.
 */
@NgModule({
  declarations: [
    LayerListComponent,
    LayerDetailComponent,
    LayerIntegrationComponent,
    LayerMapComponent,
    DataSourceUploadComponent,
  ],
  imports: [SharedModule, GeoForgeRoutingModule],
})
export class GeoForgeModule {}
