import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { ToasterService } from '@abp/ng.theme.shared';
import { GeoForgeService } from '../../services/geoforge.service';
import {
  FIELD_TYPE_LABELS,
  GEOMETRY_TYPE_LABELS,
  GisLayer,
  LayerPublishStatus,
  PUBLISH_STATUS_LABELS,
} from '../../models/geoforge.models';

/** One row of the "how do I consume this?" table. */
interface ConsumerEndpoint {
  client: string;
  protocol: string;
  url: string;
  note: string;
}

export type LayerDetailTab = 'overview' | 'fields' | 'endpoints' | 'map';

@Component({
  selector: 'app-layer-detail',
  standalone: false,
  templateUrl: './layer-detail.component.html',
})
export class LayerDetailComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly route = inject(ActivatedRoute);
  private readonly toaster = inject(ToasterService);
  private readonly destroyRef = inject(DestroyRef);

  readonly geometryLabels = GEOMETRY_TYPE_LABELS;
  readonly fieldTypeLabels = FIELD_TYPE_LABELS;
  readonly statusLabels = PUBLISH_STATUS_LABELS;
  readonly PublishStatus = LayerPublishStatus;

  readonly layer = signal<GisLayer | null>(null);
  readonly loading = signal(true);

  readonly activeTab = signal<LayerDetailTab>('overview');

  /**
   * Latches on the first visit to the Map tab, and never unlatches.
   *
   * The template keeps the map mounted (hidden) once it has been created, rather than
   * destroying it on every tab switch: rebuilding a MapView re-downloads the basemap tiles and
   * re-queries the FeatureServer, which is exactly the "reload the layer unnecessarily" the
   * component exists to avoid. The `@if` on this signal is what makes the first load lazy.
   */
  readonly mapEverOpened = signal(false);

  /** A layer with no endpoints is not being served, so there is nothing to preview. */
  readonly canPreview = computed(() => !!this.layer()?.endpoints?.esriFeatureServer);

  selectTab(tab: LayerDetailTab): void {
    this.activeTab.set(tab);

    if (tab === 'map') {
      this.mapEverOpened.set(true);
    }
  }

  /**
   * The endpoint table. Each client gets the endpoint it consumes natively rather than a
   * lowest-common-denominator one — that mapping is the whole reason the layer detail response
   * carries fully-qualified URLs.
   */
  readonly endpoints = computed<ConsumerEndpoint[]>(() => {
    const l = this.layer();
    if (!l?.endpoints) {
      return [];
    }

    const large = l.featureCount > 100_000;

    return [
      {
        client: 'ArcGIS JS API',
        protocol: 'Esri FeatureServer',
        url: l.endpoints.esriFeatureServer,
        note: 'Point a native FeatureLayer at this URL. It pages on its own.',
      },
      {
        client: 'Mapbox GL / MapLibre',
        protocol: 'Vector tiles (MVT)',
        url: l.endpoints.vectorTiles,
        note: `source-layer is "${l.name}".`,
      },
      {
        client: 'Leaflet / Flutter',
        protocol: 'GeoJSON',
        url: l.endpoints.geoJson,
        note: large
          ? 'This layer is large — prefer the vector tile endpoint.'
          : 'Add &bbox=… and &simplify=… when panning.',
      },
      {
        client: 'OpenLayers / QGIS',
        protocol: 'OGC API – Features',
        url: l.endpoints.ogcFeatures,
        note: 'Works with the bbox loading strategy, no adapter needed.',
      },
      {
        client: 'Any',
        protocol: 'TileJSON',
        url: l.endpoints.tileJson,
        note: 'Self-configuring descriptor for tile clients.',
      },
    ];
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.load(id);
    }
  }

  private load(id: string): void {
    this.loading.set(true);

    this.service
      .getLayer(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: layer => {
          this.layer.set(layer);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  publish(): void {
    const l = this.layer();
    if (!l) {
      return;
    }

    this.service
      .publishLayer(l.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => {
        this.layer.set(updated);
        this.toaster.success('Layer published.');
      });
  }

  unpublish(): void {
    const l = this.layer();
    if (!l) {
      return;
    }

    this.service
      .unpublishLayer(l.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => this.layer.set(updated));
  }

  /** Separate permission from Update on the server: this is what makes a layer world-readable. */
  toggleVisibility(): void {
    const l = this.layer();
    if (!l) {
      return;
    }

    this.service
      .setLayerAccess(l.id, !l.isPublic, l.isSensitive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(updated => {
        this.layer.set(updated);
        this.toaster.info(updated.isPublic ? 'Layer is now public.' : 'Layer is no longer public.');
      });
  }

  copy(url: string): void {
    void navigator.clipboard.writeText(url).then(() => this.toaster.info('Copied.'));
  }

  extentText(): string {
    const e = this.layer()?.extent;
    return e ? `${e.xMin.toFixed(5)}, ${e.yMin.toFixed(5)} → ${e.xMax.toFixed(5)}, ${e.yMax.toFixed(5)}` : '—';
  }
}
