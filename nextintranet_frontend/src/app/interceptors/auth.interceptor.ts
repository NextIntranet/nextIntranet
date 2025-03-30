import { HttpInterceptorFn, HttpRequest, HttpHandler } from '@angular/common/http';
import { Observable } from 'rxjs';
import { HttpEvent } from '@angular/common/http';
import { HttpHandlerFn } from '@angular/common/http';

import { inject } from '@angular/core';
// import { AuthService } from '../services/auth.service';

export function authInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {

  const token = localStorage.getItem('authToken');
  console.log("=====================");
  console.log('AuthInterceptor:');
  console.log('Request URL:', req.url);
  console.log('Request Method:', req.method);
  console.log('Token:', token);


  const clonedRequest = token
    ? req.clone({
      setHeaders: {
      Authorization: `Bearer ${token}`,
      }
    })
    : req;

  return next(clonedRequest);
}
