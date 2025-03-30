import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environment';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private apiUrl = `${environment.apiUrl}/api/v1/store/category/`;
  private cache = new Map<string, { data: any; expiry: number }>();
  private cacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor(private http: HttpClient) {}

  getCategories(page: number = 1, page_size: number = 1000): Observable<any> {
    const cacheKey = `categories_${page}_${page_size}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return of(cached.data);
    }

    const params = { page: page.toString(), page_size: page_size.toString() };
    return this.http.get<any>(this.apiUrl, { params }).pipe(
      tap(data => this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration }))
    );
  }

  getCategoryById(id: number): Observable<any> {
    const cacheKey = `category_${id}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return of(cached.data);
    }

    return this.http.get<any>(`${this.apiUrl}/${id}`).pipe(
      tap(data => this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration }))
    );
  }

  getCategoryTree(id?: string): Observable<any> {
    if (id) {
      return this.http.get<any>(`${this.apiUrl}${id}/tree/`);
    } else {
      return this.http.get<any>(`${this.apiUrl}tree/`);
    }
  }

  createCategory(category: any): Observable<any> {
    this.cache.clear();
    return this.http.post<any>(this.apiUrl, category);
  }

  updateCategory(id: number, category: any): Observable<any> {
    this.cache.clear();
    return this.http.put<any>(`${this.apiUrl}/${id}`, category);
  }

  deleteCategory(id: number): Observable<void> {
    this.cache.clear();
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}