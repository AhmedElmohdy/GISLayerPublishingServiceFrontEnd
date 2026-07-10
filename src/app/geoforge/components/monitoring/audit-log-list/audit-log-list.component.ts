import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToasterService } from '@abp/ng.theme.shared';
import {
  AUTH_TYPE_KEYS,
  GeoForgeAuthenticationType,
  GeoForgeOperation,
  GetRequestLogsInput,
  OPERATION_KEYS,
  RequestLog,
  RequestLogExportFormat,
} from '../../../models/monitoring.models';
import {
  GeoForgeMonitoringService,
  saveBlob,
} from '../../../services/geoforge-monitoring.service';
import { ResolvedPeriod, resolvePeriod, statusCodeStatus } from '../monitoring-shared';

/**
 * The request audit log: `/geoforge/audit-logs`.
 *
 * Every filter is applied on the server. The table is the largest in the schema, and a client
 * that pulled a page and filtered it in the browser would be filtering a page rather than the
 * log — showing "no results" for a query that has ten thousand matches on page four hundred.
 */
@Component({
  selector: 'app-audit-log-list',
  standalone: false,
  templateUrl: './audit-log-list.component.html',
  styleUrls: ['./audit-log-list.component.scss'],
})
export class AuditLogListComponent implements OnInit {
  private readonly service = inject(GeoForgeMonitoringService);
  private readonly toaster = inject(ToasterService);
  private readonly destroyRef = inject(DestroyRef);

  readonly logs = signal<RequestLog[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly exporting = signal(false);
  readonly page = signal(0);
  readonly expandedId = signal<string | null>(null);

  readonly pageSize = 25;

  readonly period = signal<ResolvedPeriod>(resolvePeriod('last7'));

  /** Mutable filter state. Bound directly by the template's controls. */
  readonly filters = signal<GetRequestLogsInput>({});

  readonly ExportFormat = RequestLogExportFormat;
  readonly operationKeys = OPERATION_KEYS;
  readonly authTypeKeys = AUTH_TYPE_KEYS;
  readonly statusCodeStatus = statusCodeStatus;

  readonly httpMethods = ['GET', 'POST', 'PUT', 'DELETE'];

  readonly operations = Object.values(GeoForgeOperation).filter(
    (value): value is GeoForgeOperation => typeof value === 'number'
  );

  readonly authTypes = Object.values(GeoForgeAuthenticationType).filter(
    (value): value is GeoForgeAuthenticationType => typeof value === 'number'
  );

  ngOnInit(): void {
    this.load();
  }

  onPeriodChange(period: ResolvedPeriod): void {
    this.period.set(period);
    this.page.set(0);
    this.load();
  }

  /**
   * Applies one filter. An empty string clears the key rather than sending `""`, which the
   * server would treat as a filter that matches nothing.
   */
  setFilter<K extends keyof GetRequestLogsInput>(key: K, value: unknown): void {
    this.filters.update(current => {
      const next = { ...current };

      if (value === '' || value === null || value === undefined) {
        delete next[key];
      } else {
        next[key] = value as GetRequestLogsInput[K];
      }

      return next;
    });

    this.page.set(0);
    this.load();
  }

  clearFilters(): void {
    this.filters.set({});
    this.page.set(0);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.service
      .getRequestLogs(this.query())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.logs.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  /**
   * Exports exactly what the table is showing, minus its paging. The server refuses a filter
   * wider than the configured row cap rather than truncating, so a 413 here is a real answer:
   * narrow the filter.
   */
  export(format: RequestLogExportFormat): void {
    this.exporting.set(true);
    this.toaster.info('::GeoForge:Audit:ExportStarted', '', { life: 2000 });

    const { skipCount, maxResultCount, ...filters } = this.query();

    this.service
      .exportRequestLogs(filters, format)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          const extension = format === RequestLogExportFormat.Excel ? 'xlsx' : 'csv';
          saveBlob(blob, `geoforge-request-logs.${extension}`);
          this.exporting.set(false);
        },
        error: () => {
          this.exporting.set(false);
        },
      });
  }

  toggleDetails(id: string): void {
    this.expandedId.update(current => (current === id ? null : id));
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

  private query(): GetRequestLogsInput {
    return {
      ...this.period(),
      ...this.filters(),
      skipCount: this.page() * this.pageSize,
      maxResultCount: this.pageSize,
    };
  }
}
