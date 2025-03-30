import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { httpConfig } from './app/config/http.config';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';


bootstrapApplication(AppComponent, {
  ...appConfig,
  // providers: [
  //   provideClientHydration(),
  //   provideHttpClient(withFetch()),
  //   // provideServiceWorker('ngsw-worker.js', {
  //   //   enabled: !isDevMode(),
  //   //   registrationStrategy: 'registerWhenStable:30000'
  //   // })
  // ]
}).catch(console.error);
