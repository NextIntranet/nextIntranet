import { Injectable, Input } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { FilterTreeNode } from '../../shared/components/ni-category-tree/ni-category-tree.component';
import { environment } from "../../../environment";

interface LocationResponse {
  id: string;
  name: string;
  description?: string;
  parent?: string;
  children?: LocationResponse[];
  full_path?: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  @Input() apiUrl = `${environment.apiUrl}/api/v1/store/location/`;
  private cache = new Map<string, { data: any; expiry: number }>();
  private cacheDuration = 5 * 60 * 1000; // 5 minutes

  constructor(private http: HttpClient) { }

  getLocations(page: number = 1, page_size: number = 1000): Observable<any> {
    const cacheKey = `locations_${page}_${page_size}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return of(cached.data);
    }

    const params = { page: page.toString(), page_size: page_size.toString() };
    return this.http.get<any>(this.apiUrl, { params }).pipe(
      tap(data => this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration }))
    );
  }

  getLocationsTree(id?: string): Observable<FilterTreeNode[]> {
    const cacheKey = id ? `locations_tree_${id}` : `locations_tree_root`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return of(cached.data);
    }

    const url = id ? `${this.apiUrl}${id}/tree/` : `${this.apiUrl}tree/`;
    return this.http.get<FilterTreeNode[]>(url).pipe(
      tap(data => this.cache.set(cacheKey, { data, expiry: Date.now() + this.cacheDuration }))
    );
  }

  createLocation(location: LocationResponse): Observable<LocationResponse> {
    this.cache.clear();
    return this.http.post<LocationResponse>(this.apiUrl, location);
  }

  updateLocation(id: string, location: LocationResponse): Observable<LocationResponse> {
    this.cache.clear();
    return this.http.put<LocationResponse>(`${this.apiUrl}/${id}`, location);
  }

  deleteLocation(id: string): Observable<void> {
    this.cache.clear();
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
