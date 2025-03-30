
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { retry } from 'rxjs/operators';
import { timer } from 'rxjs';


@Injectable()
export class RetryInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler) {
    return next.handle(req).pipe(retry({ count: 2, delay: () => timer(1000) }));
  }
}
