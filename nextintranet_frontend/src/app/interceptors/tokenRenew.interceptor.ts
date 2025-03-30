import { HttpInterceptorFn, HttpRequest, HttpHandler } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject, filter, take, switchMap, catchError } from 'rxjs';
import { HttpEvent } from '@angular/common/http';
import { HttpHandlerFn } from '@angular/common/http';

import { inject } from '@angular/core';

import { Router } from '@angular/router';


import { tap } from 'rxjs/operators';
import { HttpEventType } from '@angular/common/http';
let isRefreshing = false;
let refreshSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

export function tokenRenewInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {

  const router = inject(Router);

  console.log("Token renew interceptor");

  return next(req).pipe(
    catchError(err => {
      if (err.status === 401) {
        if (!isRefreshing) {
          isRefreshing = true;
          refreshSubject.next(null);

          // return auth.refreshToken().pipe(
          //   switchMap(tokens => {
          //     isRefreshing = false;
          //     refreshSubject.next(tokens.access);
          //     return next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.access}` } }));
          //   }),
          //   catchError(() => {
          //     isRefreshing = false;
          //     auth.logout();
          //     return throwError(() => new Error('Session expired'));
          //   })
          // );
          console.log("Token renew interceptor");
          router.navigate(['/login']);

        }
        return refreshSubject.pipe(
          filter(tokenValue => tokenValue != null),
          take(1),
          switchMap(tokenValue => next(req.clone({ setHeaders: { Authorization: `Bearer ${tokenValue}` } })))
        );
      }
      return throwError(() => err);
    }),
    tap(event => {
      console.log("Event", event);

      if (event.type === HttpEventType.Response) {
        console.log(req.url, 'returned a response with status', event.status);
      }

      if (event.type === HttpEventType.Response && event.status !== 401) {
        console.log("User is not authorized");
      }
    })
  );
}