import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ToasterService } from '@abp/ng.theme.shared';
import {
  GetIncidentsInput,
  INCIDENT_STATUS_KEYS,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  SEVERITY_KEYS,
} from '../../../models/monitoring.models';
import { GeoForgeMonitoringService } from '../../../services/geoforge-monitoring.service';
import { ResolvedPeriod, incidentStatusStatus, resolvePeriod, severityStatus } from '../monitoring-shared';

/**
 * Incident triage: `/geoforge/incidents`.
 *
 * The list is deliberately not a stream of failures. One broken layer produces thousands of
 * failed requests and exactly one row here, whose occurrence count climbs. The number an
 * operator acts on is the count, not the length of the list.
 */
@Component({
  selector: 'app-incident-list',
  standalone: false,
  templateUrl: './incident-list.component.html',
  styleUrls: ['./incident-list.component.scss'],
})
export class IncidentListComponent implements OnInit {
  private readonly service = inject(GeoForgeMonitoringService);
  private readonly toaster = inject(ToasterService);
  private readonly destroyRef = inject(DestroyRef);

  readonly incidents = signal<Incident[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly page = signal(0);
  readonly expandedId = signal<string | null>(null);
  readonly saving = signal<string | null>(null);

  readonly pageSize = 20;

  readonly period = signal<ResolvedPeriod>(resolvePeriod('last30'));
  readonly filters = signal<GetIncidentsInput>({});

  readonly severityStatus = severityStatus;
  readonly incidentStatusStatus = incidentStatusStatus;
  readonly severityKeys = SEVERITY_KEYS;
  readonly statusKeys = INCIDENT_STATUS_KEYS;

  readonly severities = [IncidentSeverity.Information, IncidentSeverity.Warning, IncidentSeverity.Critical];

  readonly statuses = [
    IncidentStatus.Open,
    IncidentStatus.Investigating,
    IncidentStatus.Resolved,
    IncidentStatus.Ignored,
  ];

  ngOnInit(): void {
    this.load();
  }

  onPeriodChange(period: ResolvedPeriod): void {
    this.period.set(period);
    this.page.set(0);
    this.load();
  }

  setFilter<K extends keyof GetIncidentsInput>(key: K, value: unknown): void {
    this.filters.update(current => {
      const next = { ...current };

      if (value === '' || value === null || value === undefined) {
        delete next[key];
      } else {
        next[key] = value as GetIncidentsInput[K];
      }

      return next;
    });

    this.page.set(0);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.service
      .getIncidents({
        ...this.period(),
        ...this.filters(),
        skipCount: this.page() * this.pageSize,
        maxResultCount: this.pageSize,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.incidents.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  toggleDetails(id: string): void {
    this.expandedId.update(current => (current === id ? null : id));
  }

  /**
   * Replaces the row in place rather than reloading the list. A reload would re-sort, and the
   * incident the operator just triaged would jump out from under the cursor.
   */
  updateStatus(incident: Incident, status: IncidentStatus, notes: string): void {
    this.saving.set(incident.id);

    this.service
      .updateIncidentStatus(incident.id, { status, resolutionNotes: notes || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.incidents.update(list => list.map(i => (i.id === updated.id ? updated : i)));
          this.saving.set(null);
          this.toaster.success('::GeoForge:Incidents:Updated');
        },
        error: () => this.saving.set(null),
      });
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
}
