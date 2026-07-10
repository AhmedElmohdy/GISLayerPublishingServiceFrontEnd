import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * A dashboard panel with the four states every panel needs: loading, error, empty, and content.
 *
 * They exist as one component because a dashboard where each panel invents its own empty state
 * reads as broken rather than idle, and because "this panel failed" must never be indistinguishable
 * from "this panel has nothing to show". The retry emitter is what makes the error state honest:
 * a failed panel that cannot be retried is just a dead rectangle.
 */
@Component({
  selector: 'gf-panel',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card h-100">
      <div class="card-header d-flex justify-content-between align-items-center gap-2" *ngIf="title">
        <h6 class="card-title mb-0">{{ title }}</h6>
        <ng-content select="[panelActions]"></ng-content>
      </div>

      <div class="card-body">
        <div class="gf-panel__state" *ngIf="loading">
          <div class="spinner-border spinner-border-sm text-secondary" role="status">
            <span class="visually-hidden">…</span>
          </div>
        </div>

        <div class="gf-panel__state text-danger" *ngIf="!loading && error">
          <i class="fas fa-triangle-exclamation me-2" aria-hidden="true"></i>
          <span>{{ '::GeoForge:Dashboard:LoadFailed' | abpLocalization }}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary ms-3" (click)="retry.emit()">
            {{ '::GeoForge:Dashboard:Retry' | abpLocalization }}
          </button>
        </div>

        <div class="gf-panel__state text-muted" *ngIf="!loading && !error && empty">
          {{ emptyMessage || ('::GeoForge:Dashboard:NoData' | abpLocalization) }}
        </div>

        <div [hidden]="loading || error || empty">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .gf-panel__state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 8rem;
        font-size: 0.85rem;
      }

      .card-title {
        font-size: 0.9rem;
        font-weight: 600;
      }
    `,
  ],
})
export class PanelComponent {
  @Input() title = '';

  @Input() loading = false;

  @Input() error = false;

  @Input() empty = false;

  @Input() emptyMessage = '';

  @Output() readonly retry = new EventEmitter<void>();
}
