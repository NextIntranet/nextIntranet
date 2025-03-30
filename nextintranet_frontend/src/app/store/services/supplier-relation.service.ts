import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SupplierRelationService {
  private baseUrl = 'http://localhost:8080/api/v1/store/supplier/relation/';
  private componentUrl = 'http://localhost:8080/api/v1/store/component/';

  constructor(private http: HttpClient) {}

  getSupplierRelationById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}${id}/`);
  }

  updateSupplierRelation(id: any, relation: any): Observable<any> {
    console.log('Updating supplier relation:', relation);
    console.log('ID:', id);
    return this.http.patch<any>(`${this.baseUrl}${id}/`, relation);
  }

  getSupplierRelationsByComponentId(componentId: string): Observable<any> {
    return this.http.get<any>(`${this.componentUrl}${componentId}/supplier/`);
  }

  createSupplierRelation(componentId: any, payload: any): Observable<any> {
    const data = {
      component: componentId,
      supplier: null,
      symbol: null,
    }
    return this.http.post<any>(`${this.componentUrl}${componentId}/supplier/`, data);
  }

  deleteSupplierRelation(id: any): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}${id}/`);
  }
}
