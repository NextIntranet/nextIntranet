import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { withInterceptors } from '@angular/common/http';
import { loggingInterceptor } from './interceptors/logging.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor'
import { tokenRenewInterceptor } from './interceptors/tokenRenew.interceptor';
// import { authInterceptor } from './auth/auth.interceptor';
// import { ErrorInterceptor } from './interceptors/error.interceptor';
// import { RetryInterceptor } from './interceptors/retry.interceptor';
import { HTTP_INTERCEPTORS } from "@angular/common/http";


import { withFetch } from '@angular/common/http';
import { MessageService } from 'primeng/api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withEventReplay()),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
      },
    }),
    MessageService,

    provideHttpClient(
      withInterceptors([
        authInterceptor,
        loggingInterceptor,
        tokenRenewInterceptor,
        //ErrorInterceptor,
        //RetryInterceptor

      ]),
      withFetch()
    )
  ]
};
