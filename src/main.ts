import { enableProdMode } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

// Eagerly register the Arabic locale so the `date` pipe (and any other locale-aware pipe) works when
// the UI language is Arabic. Without it Angular throws `NG0701: Missing locale data for the locale
// "ar"` on the first date rendered — English variants are built in, but `ar` is not.
registerLocaleData(localeAr);

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
