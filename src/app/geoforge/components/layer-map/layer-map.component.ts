import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ToasterService } from '@abp/ng.theme.shared';
import { OAuthService } from 'angular-oauth2-oidc';
import { GisLayer, LayerFieldDataType, LayerGeometryType } from '../../models/geoforge.models';

/** The basemaps offered by the toggle, in display order. */
interface BasemapOption {
  id: string;
  label: string;
}

const BASEMAPS: BasemapOption[] = [
  { id: 'gray-vector', label: 'Light Gray' },
  { id: 'streets-vector', label: 'Streets' },
  { id: 'satellite', label: 'Imagery' },
  { id: 'topo-vector', label: 'Topographic' },
];

/**
 * The `assets` folder of `@arcgis/core`, copied into the build by `angular.json`.
 *
 * The path **must be absolute**. The SDK resolves `assetsPath` against the document's current
 * URL, not against the application root, so a relative `assets/arcgis` becomes
 * `/geoforge/layers/<id>/assets/arcgis` on this route and 404s — taking every widget's i18n
 * bundle, the basemap definitions and the worker bootstrap with it. Resolving against
 * `document.baseURI` honours the `<base href>` and so survives a sub-path deployment.
 */
const ARCGIS_ASSETS_PATH = new URL('assets/arcgis', document.baseURI).href;
const ARCGIS_THEME_HREF = `${ARCGIS_ASSETS_PATH}/esri/themes/light/main.css`;

/** One row of the popup's field table. */
interface PopupFieldInfo {
  fieldName: string;
  label: string;
  format?: Record<string, unknown>;
}

/** The shape of GeoForge's dialect-neutral `simple` style. */
interface SimpleStyle {
  fill: { color: string; opacity: number };
  stroke: { color: string; width: number };
  point: { color: string; radius: number };
}

/**
 * Esri symbols take opacity as the fourth component of a colour array, not as a separate
 * property, so a `#rrggbb` plus an opacity has to be flattened into `[r, g, b, a]`.
 */
function hexToRgba(hex: string, alpha: number): [number, number, number, number] {
  const normalized = hex.replace('#', '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map(c => c + c)
          .join('')
      : normalized;

  const value = Number.parseInt(expanded, 16);

  return Number.isNaN(value) || expanded.length !== 6
    ? [51, 136, 255, alpha]
    : [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

/**
 * Previews a published layer on a map, using the ArcGIS Maps SDK against the layer's own
 * `FeatureServer` endpoint.
 *
 * <p>Two properties are load-bearing:</p>
 * <ul>
 *   <li>
 *     <b>The SDK is loaded lazily.</b> `@arcgis/core` is tens of megabytes; a static import
 *     would put it in the initial bundle of every page in the admin UI. The dynamic
 *     <code>import()</code> below runs only when this component is first created, which the
 *     layer-detail page defers until its Map tab is opened.
 *   </li>
 *   <li>
 *     <b>The FeatureServer endpoint is taken from the layer DTO.</b> The server hands out a
 *     fully-qualified URL for exactly this purpose; PostGIS is never touched directly, and the
 *     Esri facade already speaks the protocol a native <code>FeatureLayer</code> expects.
 *   </li>
 * </ul>
 */
@Component({
  selector: 'app-layer-map',
  standalone: false,
  templateUrl: './layer-map.component.html',
  styles: [
    `
      .gf-map-view {
        width: 100%;
        height: 70vh;
        min-height: 420px;
      }
    `,
  ],
})
export class LayerMapComponent implements AfterViewInit, OnDestroy {
  private readonly toaster = inject(ToasterService);
  private readonly oauth = inject(OAuthService);

  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer!: ElementRef<HTMLDivElement>;

  @Input({ required: true }) layer!: GisLayer;

  readonly basemaps = BASEMAPS;
  readonly activeBasemap = signal(BASEMAPS[0].id);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  /**
   * The live SDK objects. Held as `unknown`-typed fields rather than imported types so that no
   * static type reference drags `@arcgis/core` into this chunk at build time.
   */
  private view?: { destroy(): void; goTo(target: unknown): Promise<unknown>; map: { basemap: unknown } };
  private featureLayer?: { fullExtent?: unknown };
  private destroyed = false;

  get featureServerUrl(): string {
    return this.layer.endpoints?.esriFeatureServer ?? '';
  }

  /** Every stored geometry type is rendered by a FeatureLayer; only the symbol differs. */
  get isRenderable(): boolean {
    return (
      !!this.featureServerUrl &&
      this.layer.geometryType !== LayerGeometryType.Unknown &&
      this.layer.geometryType !== LayerGeometryType.GeometryCollection
    );
  }

  async ngAfterViewInit(): Promise<void> {
    if (!this.isRenderable) {
      this.loading.set(false);
      this.error.set(
        this.featureServerUrl
          ? 'This geometry type has no map preview.'
          : 'Publish the layer to preview it on a map.',
      );
      return;
    }

    try {
      await this.initializeMap();
    } catch (reason: unknown) {
      if (!this.destroyed) {
        this.error.set('The map could not be loaded.');
        console.error('GeoForge: ArcGIS map initialisation failed.', reason);
      }
    } finally {
      if (!this.destroyed) {
        this.loading.set(false);
      }
    }
  }

  /**
   * The MapView owns a WebGL context and a DOM subtree; neither is released by Angular removing
   * the host element. Leaking one per tab visit exhausts the browser's WebGL contexts after a
   * handful of layers, and the view keeps polling the FeatureServer in the background.
   */
  ngOnDestroy(): void {
    this.destroyed = true;

    this.view?.destroy();
    this.view = undefined;
    this.featureLayer = undefined;
  }

  // ---- Toolbar -------------------------------------------------------------

  /** Swapping the basemap never re-fetches the operational layer. */
  async setBasemap(id: string): Promise<void> {
    if (!this.view || this.activeBasemap() === id) {
      return;
    }

    const { default: Basemap } = await import('@arcgis/core/Basemap');
    this.view.map.basemap = Basemap.fromId(id);
    this.activeBasemap.set(id);
  }

  async zoomToLayer(): Promise<void> {
    if (!this.view) {
      return;
    }

    const target = this.featureLayer?.fullExtent ?? (await this.declaredExtent());

    if (target) {
      await this.view.goTo(target);
    }
  }

  copyFeatureServiceUrl(): void {
    void navigator.clipboard
      .writeText(this.featureServerUrl)
      .then(() => this.toaster.info('Feature Service URL copied.'));
  }

  openInNewTab(): void {
    window.open(this.featureServerUrl, '_blank', 'noopener');
  }

  // ---- Map construction ----------------------------------------------------

  private async initializeMap(): Promise<void> {
    this.injectTheme();

    // One dynamic import per module keeps the lazy chunk to what is actually used.
    const [
      { default: esriConfig },
      { default: EsriMap },
      { default: MapView },
      { default: FeatureLayer },
      { default: Legend },
      { default: ScaleBar },
      { default: Home },
    ] = await Promise.all([
      import('@arcgis/core/config'),
      import('@arcgis/core/Map'),
      import('@arcgis/core/views/MapView'),
      import('@arcgis/core/layers/FeatureLayer'),
      import('@arcgis/core/widgets/Legend'),
      import('@arcgis/core/widgets/ScaleBar'),
      import('@arcgis/core/widgets/Home'),
    ]);

    // The tab may have been closed while the chunk was downloading.
    if (this.destroyed) {
      return;
    }

    esriConfig.assetsPath = ARCGIS_ASSETS_PATH;
    this.authorizeRequestsToOurApi(esriConfig);

    const featureLayer = new FeatureLayer({
      url: this.featureServerUrl,
      title: this.layer.displayName,
      outFields: ['*'],

      // The Esri facade emits `drawingInfo: null` unless the layer carries an `esri-renderer`
      // style, and the default style GeoForge creates is the neutral `simple` dialect. Without
      // a renderer the SDK draws nothing and the Legend reports "no legend", so the persisted
      // style is translated here rather than left to a server that must not change.
      renderer: this.buildRenderer(),
      legendEnabled: true,
      popupEnabled: true,
      popupTemplate: {
        // A layer's own name tells the operator nothing they did not already know; the clicked
        // feature's label does. Falls back to the layer name when it has no label-ish field.
        title: this.buildPopupTitle(),
        outFields: ['*'],

        // A static `fields` element, not a content function. The SDK autocasts this at template
        // construction; a function must return constructed Content instances, and returning
        // plain objects makes the popup render its "Error" state instead of the feature.
        content: [{ type: 'fields', fieldInfos: this.buildFieldInfos() }],
      },
    });

    const map = new EsriMap({
      basemap: this.activeBasemap(),
      layers: [featureLayer],
    });

    const view = new MapView({
      container: this.mapContainer.nativeElement,
      map,
      // Zoom is a default widget; Home and the rest are added explicitly.
      popupEnabled: true,
      popup: { dockEnabled: false },
    });

    view.ui.add(new Home({ view }), 'top-left');
    view.ui.add(new ScaleBar({ view, unit: 'metric' }), 'bottom-left');
    view.ui.add(new Legend({ view }), 'bottom-right');

    this.view = view as never;
    this.featureLayer = featureLayer as never;

    await view.when();
    if (this.destroyed) {
      return;
    }

    // Prefer the layer's own extent once it has loaded; fall back to the DTO's, which is
    // already in WGS 84 and is correct even when the service metadata omits one.
    await featureLayer.when();
    await this.zoomToLayer();
  }

  // ---- Popup ---------------------------------------------------------------

  /**
   * The popup heading. Esri substitutes `{field}` against the clicked feature, so a label-ish
   * text column becomes the feature's own name — "Riyadh" rather than "Main_Cities".
   *
   * Candidates are tried in order of specificity. A loose pattern such as `*_name` is not enough:
   * on a real layer it matches provenance columns like `orig_layer_name`, whose value is the
   * layer's name — which is exactly the useless title this is meant to replace.
   */
  private buildPopupTitle(): string {
    const candidates = ['name', 'title', 'label', 'display_name', 'feature_name'];

    for (const candidate of candidates) {
      const match = this.layer.fields.find(
        field =>
          field.isVisible &&
          field.dataType === LayerFieldDataType.Text &&
          field.name.toLowerCase() === candidate,
      );

      if (match) {
        return `{${match.name}}`;
      }
    }

    return this.layer.displayName;
  }

  /**
   * One popup row per visible field, plus the object id last.
   *
   * `format` is omitted for text: passing a numeric format to a string field makes the SDK
   * render it as `NaN`.
   */
  private buildFieldInfos(): PopupFieldInfo[] {
    const fieldInfos: PopupFieldInfo[] = this.layer.fields
      .filter(field => field.isVisible)
      .map(field => {
        const info: PopupFieldInfo = {
          fieldName: field.name,
          label: field.alias || field.name,
        };

        const format = this.formatFor(field.dataType);
        if (format) {
          info.format = format;
        }

        return info;
      });

    // GeoForge's surrogate key: useful for support, so shown, but shown last.
    fieldInfos.push({
      fieldName: this.layer.objectIdField,
      label: this.layer.objectIdField,
    });

    return fieldInfos;
  }

  /** Esri's number/date formatting hints. Text needs none. */
  private formatFor(dataType: LayerFieldDataType): Record<string, unknown> | undefined {
    switch (dataType) {
      case LayerFieldDataType.Integer:
      case LayerFieldDataType.BigInt:
        return { digitSeparator: true, places: 0 };

      case LayerFieldDataType.Double:
        return { digitSeparator: true, places: 2 };

      case LayerFieldDataType.Date:
        return { dateFormat: 'short-date' };

      case LayerFieldDataType.Timestamp:
        return { dateFormat: 'short-date-short-time' };

      default:
        return undefined;
    }
  }

  // ---- Symbology -----------------------------------------------------------

  /**
   * Translates the layer's persisted `simple` style into an Esri renderer.
   *
   * `simple` is GeoForge's dialect-neutral style, and the one dialect it promises is
   * mechanically translatable. The mapping is total: every stored geometry type is Point,
   * MultiPoint, MultiLineString or MultiPolygon, so there is no fall-through case that leaves
   * a layer unsymbolised.
   */
  private buildRenderer() {
    const style = this.readSimpleStyle();

    const stroke = {
      color: style.stroke.color,
      width: style.stroke.width,
    };

    switch (this.layer.geometryType) {
      case LayerGeometryType.LineString:
      case LayerGeometryType.MultiLineString:
        return {
          type: 'simple' as const,
          symbol: { type: 'simple-line' as const, ...stroke },
        };

      case LayerGeometryType.Polygon:
      case LayerGeometryType.MultiPolygon:
        return {
          type: 'simple' as const,
          symbol: {
            type: 'simple-fill' as const,
            color: hexToRgba(style.fill.color, style.fill.opacity),
            outline: stroke,
          },
        };

      default:
        return {
          type: 'simple' as const,
          symbol: {
            type: 'simple-marker' as const,
            style: 'circle' as const,
            // The style states a radius; an Esri marker is sized by diameter.
            size: style.point.radius * 2,
            color: style.point.color,
            outline: { color: style.stroke.color, width: 1 },
          },
        };
    }
  }

  /**
   * The default style the server always attaches. A layer whose style was hand-edited into
   * something unparseable still renders — with these defaults — rather than showing an empty map.
   */
  private readSimpleStyle(): SimpleStyle {
    const fallback: SimpleStyle = {
      fill: { color: '#3388ff', opacity: 0.35 },
      stroke: { color: '#1a5fb4', width: 1.5 },
      point: { color: '#e66100', radius: 6 },
    };

    const definition = this.layer.styles?.find(s => s.dialect === 'simple')?.definitionJson;
    if (!definition) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(definition) as Partial<SimpleStyle>;

      return {
        fill: { ...fallback.fill, ...parsed.fill },
        stroke: { ...fallback.stroke, ...parsed.stroke },
        point: { ...fallback.point, ...parsed.point },
      };
    } catch {
      return fallback;
    }
  }

  /**
   * A layer that is published but not public is served only to a caller holding the GeoForge
   * permission. The SDK issues its own `fetch` calls and knows nothing about ABP's OAuth
   * interceptor, so the bearer token is attached here — scoped by URL, so it is never sent to
   * Esri's basemap CDN.
   */
  private authorizeRequestsToOurApi(esriConfig: {
    request: { interceptors?: unknown[] };
  }): void {
    const token = this.oauth.getAccessToken();
    if (!token || this.layer.isPublic) {
      return;
    }

    esriConfig.request.interceptors ??= [];
    esriConfig.request.interceptors.push({
      urls: this.featureServerUrl,
      before: (params: { requestOptions: { headers?: Record<string, string> } }) => {
        params.requestOptions.headers = {
          ...params.requestOptions.headers,
          Authorization: `Bearer ${token}`,
        };
      },
    });
  }

  /** The layer's declared extent, as an SDK `Extent` in WGS 84. */
  private async declaredExtent(): Promise<unknown> {
    const extent = this.layer.extent;
    if (!extent) {
      return null;
    }

    const { default: Extent } = await import('@arcgis/core/geometry/Extent');

    return new Extent({
      xmin: extent.xMin,
      ymin: extent.yMin,
      xmax: extent.xMax,
      ymax: extent.yMax,
      spatialReference: { wkid: 4326 },
    });
  }

  /**
   * The SDK's stylesheet ships inside its assets folder. It is linked at runtime rather than
   * listed in `angular.json` styles, so it is fetched only by a user who opens a Map tab.
   */
  private injectTheme(): void {
    if (document.querySelector(`link[href="${ARCGIS_THEME_HREF}"]`)) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ARCGIS_THEME_HREF;
    document.head.appendChild(link);
  }
}
