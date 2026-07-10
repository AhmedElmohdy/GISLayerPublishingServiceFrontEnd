import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard, permissionGuard } from '@abp/ng.core';
import { DataSourceUploadComponent } from './components/data-source-upload/data-source-upload.component';
import { LayerDetailComponent } from './components/layer-detail/layer-detail.component';
import { LayerListComponent } from './components/layer-list/layer-list.component';

/**
 * Routes mirror the permission names defined in `GeoForgePermissions`. The guards are a UX
 * affordance only — the server enforces the same permissions on every endpoint, and a layer's
 * public/private state is checked there too.
 */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'layers' },
  {
    path: 'layers',
    component: LayerListComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Layers' },
  },
  {
    path: 'layers/:id',
    component: LayerDetailComponent,
    canActivate: [authGuard, permissionGuard],
    data: { requiredPolicy: 'GeoForge.Layers' },
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
