import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root'
})
export class NiParametersRelationService {
  private baseUrl = `${environment.apiUrl}/api/v1/store`;

  constructor(private http: HttpClient) {}

  getParametersByComponentId(componentId: string, page: number = 0, size: number = 100): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/component/${componentId}/parameters/`);
  }

  createParameter(componentId: string, payload: any): Observable<any> {
    const data = {
      component: componentId,
      parameter_type: null,
      value: null
    };
    return this.http.post<any>(`${this.baseUrl}/component/${componentId}/parameters/`, data);
  }

  updateParameter(id: string, payload: any): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/parameter/${id}/`, payload);
  }

  deleteParameter(id: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/parameter/${id}/`);
  }
}
