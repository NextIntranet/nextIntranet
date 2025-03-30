import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root'
})
export class SupplierService {
  private baseUrl = `${environment.apiUrl}/api/v1/store/supplier/`;
  private cache = new Map<string, { data: any; expiry: number }>();
  private cacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor(private http: HttpClient) {}

  getSuppliers(page: number = 1, pageSize: number = 1000): Observable<any> {
    const cacheKey = `suppliers_${page}_${pageSize}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return of(cached.data);
    }

    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    return this.http.get<any>(this.baseUrl, { params }).pipe(
      tap(data => this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration }))
    );
  }

  getSupplierById(id: string): Observable<any> {
    const cacheKey = `supplier_${id}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return of(cached.data);
    }

    return this.http.get<any>(`${this.baseUrl}${id}/`).pipe(
      tap(data => this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration }))
    );
  }

  createSupplier(supplier: any): Observable<any> {
    this.cache.clear();
    return this.http.post<any>(this.baseUrl, supplier);
  }

  updateSupplier(supplier: any): Observable<any> {
    if (!supplier.id) {
      throw new Error('Chybí ID dodavatele pro update');
    }
    this.cache.clear();
    return this.http.patch<any>(`${this.baseUrl}${supplier.id}/`, supplier);
  }

  deleteSupplier(id: string): Observable<any> {
    this.cache.clear();
    return this.http.delete<any>(`${this.baseUrl}${id}/`);
  }
}
