import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../../environment";

@Injectable({
  providedIn: "root",
})
export class StoreComponentService {
  components: any[] = [];
  page: number = 1;
  pageSize: number = 10;
  selectedCategoryIds: string[] = [];
  selectedLocationIds: string[] = [];
  public initialLoadDone = false;

  constructor(private http: HttpClient) {}

  parseUrlParams(params: HttpParams): void {
    if (params.has('page')) {
      this.page = Number(params.get('page')) || 1;
    }

    if (params.has('page_size')) {
      this.pageSize = Number(params.get('page_size')) || 10;
    }

    if (params.has('categories')) {
      const categoriesStr = params.get('categories') || '';
      if (categoriesStr) {
        this.selectedCategoryIds = categoriesStr.split(',').filter(id => id);
      }
    }

    if (params.has('locations')) {
      const locationsStr = params.get('locations') || '';
      if (locationsStr) {
        this.selectedLocationIds = locationsStr.split(',').filter(id => id);
      }
    }

  }

  loadComponents(page: number = this.page, pageSize: number = this.pageSize, searchTerm: string = '', categoryIds: string[] = [], locationIds: string[] = []): Observable<any> {

    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (searchTerm) {
      params = params.set('search', searchTerm);
    }

    if (categoryIds && categoryIds.length > 0) {
      params = params.set('categories', categoryIds.join(','));
    }

    if (locationIds && locationIds.length > 0) {
      params = params.set('locations', locationIds.join(','));
    }

    const token = localStorage.getItem('authToken');
    const headers = { Authorization: `Bearer ${token}` };

    return this.http.get<any>(`${environment.apiUrl}/api/v1/store/components/`, { params, headers });
  }
}