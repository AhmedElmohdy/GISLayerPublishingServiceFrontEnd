import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ChartStatus } from './chart-models';

/**
 * A status pill: colour, icon and text together, never colour alone.
 *
 * The icon is not decoration. A status conveyed only by hue is invisible to a reader with a
 * colour-vision deficiency, unreadable in a printed screenshot, and lost under a forced-colours
 * theme. This component makes it impossible to render the colour without the label.
 */
@Component({
  selector: 'gf-status-badge',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="gf-badge" [ngClass]="'gf-badge--' + status">
      <i class="fas" [ngClass]="iconClass" aria-hidden="true"></i>
      <span>{{ label }}</span>
    </span>
  `,
  styles: [
    `
      .gf-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.1rem 0.5rem;
        border-radius: 1rem;
        font-size: 0.72rem;
        font-weight: 500;
        line-height: 1.5;
        white-space: nowrap;
        border: 1px solid transparent;
      }

      .gf-badge i {
        font-size: 0.65rem;
      }

      /* The fill is a 15% wash so the text keeps its own contrast against the card, rather than
         sitting on a saturated block that fails at small sizes. The border carries the hue. */
      .gf-badge--good {
        color: #0a7d0a;
        background: rgba(12, 163, 12, 0.14);
        border-color: rgba(12, 163, 12, 0.35);
      }
      .gf-badge--warning {
        color: #8a6100;
        background: rgba(250, 178, 25, 0.16);
        border-color: rgba(250, 178, 25, 0.4);
      }
      .gf-badge--serious {
        color: #a2502a;
        background: rgba(236, 131, 90, 0.16);
        border-color: rgba(236, 131, 90, 0.4);
      }
      .gf-badge--critical {
        color: #a92e2e;
        background: rgba(208, 59, 59, 0.14);
        border-color: rgba(208, 59, 59, 0.38);
      }
      .gf-badge--neutral {
        color: #6b6a66;
        background: rgba(137, 135, 129, 0.14);
        border-color: rgba(137, 135, 129, 0.32);
      }

      /* Dark mode is selected, not flipped: the washes stay, the ink lightens to clear 4.5:1
         against the dark surface. */
      :host-context(.lpx-theme-dark) .gf-badge--good,
      :host-context(.lpx-theme-dim) .gf-badge--good {
        color: #4fc94f;
      }
      :host-context(.lpx-theme-dark) .gf-badge--warning,
      :host-context(.lpx-theme-dim) .gf-badge--warning {
        color: #f2b53c;
      }
      :host-context(.lpx-theme-dark) .gf-badge--serious,
      :host-context(.lpx-theme-dim) .gf-badge--serious {
        color: #f0a179;
      }
      :host-context(.lpx-theme-dark) .gf-badge--critical,
      :host-context(.lpx-theme-dim) .gf-badge--critical {
        color: #ef7676;
      }
      :host-context(.lpx-theme-dark) .gf-badge--neutral,
      :host-context(.lpx-theme-dim) .gf-badge--neutral {
        color: #a8a69f;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input({ required: true }) label = '';

  @Input() status: ChartStatus = 'neutral';

  /** Overrides the icon chosen from the status. Rarely needed. */
  @Input() icon?: string;

  get iconClass(): string {
    if (this.icon) {
      return this.icon;
    }

    switch (this.status) {
      case 'good':
        return 'fa-circle-check';
      case 'warning':
        return 'fa-triangle-exclamation';
      case 'serious':
        return 'fa-circle-exclamation';
      case 'critical':
        return 'fa-circle-xmark';
      default:
        return 'fa-circle-minus';
    }
  }
}
