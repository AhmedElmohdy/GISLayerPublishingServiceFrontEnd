import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfirmationService, Confirmation, ToasterService } from '@abp/ng.theme.shared';
import { GeoForgeService } from '../../services/geoforge.service';
import {
  GEOMETRY_TYPE_LABELS,
  GisLayerListItem,
  LayerPublishStatus,
  PUBLISH_STATUS_LABELS,
} from '../../models/geoforge.models';

@Component({
  selector: 'app-layer-list',
  standalone: false,
  templateUrl: './layer-list.component.html',
})
export class LayerListComponent implements OnInit {
  private readonly service = inject(GeoForgeService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly toaster = inject(ToasterService);
  private readonly destroyRef = inject(DestroyRef);

  readonly geometryLabels = GEOMETRY_TYPE_LABELS;
  readonly statusLabels = PUBLISH_STATUS_LABELS;
  readonly PublishStatus = LayerPublishStatus;

  readonly layers = signal<GisLayerListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);

  readonly filter = signal('');
  readonly pageSize = 20;
  readonly page = signal(0);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    // An empty filter is omitted by `queryParams`, not stringified. Sending `undefined` here
    // would serialise as the literal text "undefined" and match no layer at all.
    this.service
      .getLayers({
        filter: this.filter().trim(),
        skipCount: this.page() * this.pageSize,
        maxResultCount: this.pageSize,
        sorting: 'creationTime DESC',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.layers.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  search(value: string): void {
    this.filter.set(value);
    this.page.set(0);
    this.load();
  }

  nextPage(): void {
    if ((this.page() + 1) * this.pageSize < this.totalCount()) {
      this.page.update(p => p + 1);
      this.load();
    }
  }

  previousPage(): void {
    if (this.page() > 0) {
      this.page.update(p => p - 1);
      this.load();
    }
  }

  publish(layer: GisLayerListItem): void {
    this.service
      .publishLayer(layer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toaster.success(`Layer '${layer.name}' is now published.`);
        this.load();
      });
  }

  unpublish(layer: GisLayerListItem): void {
    this.service
      .unpublishLayer(layer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toaster.info(`Layer '${layer.name}' is back to Draft.`);
        this.load();
      });
  }

  /**
   * Deleting a layer drops its feature table. That is irreversible once the retention window
   * on the superseded table has passed, so it is confirmed rather than one-click.
   */
  delete(layer: GisLayerListItem): void {
    this.confirmation
      .warn(
        `Layer '${layer.displayName}' and its ${layer.featureCount} features will be removed. This cannot be undone.`,
        'Delete layer?',
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status !== Confirmation.Status.confirm) {
          return;
        }

        this.service
          .deleteLayer(layer.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.toaster.success(`Layer '${layer.name}' deleted.`);
            this.load();
          });
      });
  }

  statusClass(status: LayerPublishStatus): string {
    switch (status) {
      case LayerPublishStatus.Published:
        return 'bg-success';
      case LayerPublishStatus.Draft:
        return 'bg-secondary';
      case LayerPublishStatus.Deprecated:
        return 'bg-warning text-dark';
      default:
        return 'bg-dark';
    }
  }
}
