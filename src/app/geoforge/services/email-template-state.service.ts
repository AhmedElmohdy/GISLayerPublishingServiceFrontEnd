import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { PermissionService } from '@abp/ng.core';
import { GeoForgeService } from './geoforge.service';

/**
 * A cached, read-only view of which notification templates are globally enabled — the piece the
 * operation-level "send email" checkboxes need but the client object does not carry.
 *
 * <p>The fetch is gated on the <code>GeoForge.EmailTemplates.Manage</code> permission, so a user
 * who cannot read templates does not trigger a 403; in that case, and on any error, the map is empty
 * and <code>isEnabled</code> answers <em>true</em> — the backend is the authority, and defaulting to
 * "enabled" keeps the checkbox available rather than wrongly disabling it.</p>
 */
@Injectable({ providedIn: 'root' })
export class EmailTemplateStateService {
  private readonly service = inject(GeoForgeService);
  private readonly permission = inject(PermissionService);

  private cache$?: Observable<Record<string, boolean>>;

  enabledMap(): Observable<Record<string, boolean>> {
    if (!this.cache$) {
      const canRead = this.permission.getGrantedPolicy('GeoForge.EmailTemplates.Manage');
      const source = canRead ? this.service.getEmailTemplates() : of([]);

      this.cache$ = source.pipe(
        map(list => {
          const record: Record<string, boolean> = {};
          list.forEach(t => (record[t.templateKey] = t.isEnabled));
          return record;
        }),
        catchError(() => of({} as Record<string, boolean>)),
        shareReplay(1),
      );
    }
    return this.cache$;
  }

  /** An absent key (not loaded, or no permission) is treated as enabled — the backend is authoritative. */
  isEnabled(map: Record<string, boolean>, key: string): boolean {
    return map[key] !== false;
  }
}
