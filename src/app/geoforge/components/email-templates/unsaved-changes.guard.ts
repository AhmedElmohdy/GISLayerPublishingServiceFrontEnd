import { CanDeactivateFn } from '@angular/router';
import { map } from 'rxjs';
import { Confirmation } from '@abp/ng.theme.shared';
import { EmailTemplatesComponent } from './email-templates.component';

/**
 * Blocks navigation away from the template editor while there are unsaved edits, unless the operator
 * confirms discarding them. A UX guard only — nothing is lost on the server either way.
 */
export const emailTemplatesUnsavedGuard: CanDeactivateFn<EmailTemplatesComponent> = component => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return component.confirmDiscard().pipe(map(status => status === Confirmation.Status.confirm));
};
