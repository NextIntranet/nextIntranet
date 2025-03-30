import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { loggingInterceptor } from '../interceptors/logging.interceptor';
import { authInterceptor } from '../interceptors/auth.interceptor';
// import { retryInterceptor } from '../interceptors/retry.interceptor';
// import { errorInterceptor } from '../interceptors/error.interceptor';

export const httpConfig = provideHttpClient(

  // Optional: Add interceptors
  withInterceptors([
    loggingInterceptor,
    authInterceptor,
  //   retryInterceptor,
  //   errorInterceptor,
  ]),

  // withInterceptorsFromDi([
  //   //loggingInterceptor,
  //   //authInterceptor,
  //   //retryInterceptor,
  //   //errorInterceptor,
  // ]),
  // Optional: Add XSRF protection for forms
  // withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
  // Optional: Specify credentials policy
  // withCredentials(),
  // Optional: If using fetch instead of XMLHttpRequest
  //withFetch(),
);
