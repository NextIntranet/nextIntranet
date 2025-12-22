import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environment';
import {
  Production,
  ProductionFolder,
  Template,
  TemplateComponent,
  Realization,
  RealizationComponent,
  PaginatedResponse
} from '../models/production.models';

@Injectable({
  providedIn: 'root'
})
export class ProductionService {
  private apiUrl = `${environment.apiUrl}/api/v1/production`;

  constructor(private http: HttpClient) {}

  // Production Folders
  getFolders(page = 1, pageSize = 25): Observable<PaginatedResponse<ProductionFolder>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());
    return this.http.get<PaginatedResponse<ProductionFolder>>(`${this.apiUrl}/folders/`, { params });
  }

  getFolderTree(): Observable<ProductionFolder[]> {
    return this.http.get<ProductionFolder[]>(`${this.apiUrl}/folders/tree/`);
  }

  getFolder(id: string): Observable<ProductionFolder> {
    return this.http.get<ProductionFolder>(`${this.apiUrl}/folders/${id}/`);
  }

  createFolder(folder: Partial<ProductionFolder>): Observable<ProductionFolder> {
    return this.http.post<ProductionFolder>(`${this.apiUrl}/folders/`, folder);
  }

  updateFolder(id: string, folder: Partial<ProductionFolder>): Observable<ProductionFolder> {
    return this.http.patch<ProductionFolder>(`${this.apiUrl}/folders/${id}/`, folder);
  }

  deleteFolder(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/folders/${id}/`);
  }

  // Productions
  getProductions(page = 1, pageSize = 25, filters?: { folder?: string; search?: string }): Observable<PaginatedResponse<Production>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (filters?.folder) {
      params = params.set('folder', filters.folder);
    }
    if (filters?.search) {
      params = params.set('search', filters.search);
    }

    return this.http.get<PaginatedResponse<Production>>(`${this.apiUrl}/productions/`, { params });
  }

  getProduction(id: string): Observable<Production> {
    return this.http.get<Production>(`${this.apiUrl}/productions/${id}/`);
  }

  createProduction(production: Partial<Production>): Observable<Production> {
    return this.http.post<Production>(`${this.apiUrl}/productions/`, production);
  }

  updateProduction(id: string, production: Partial<Production>): Observable<Production> {
    return this.http.patch<Production>(`${this.apiUrl}/productions/${id}/`, production);
  }

  deleteProduction(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/productions/${id}/`);
  }

  // Templates
  getTemplates(page = 1, pageSize = 25, productionId?: string): Observable<PaginatedResponse<Template>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (productionId) {
      params = params.set('production', productionId);
    }

    return this.http.get<PaginatedResponse<Template>>(`${this.apiUrl}/templates/`, { params });
  }

  getTemplate(id: string): Observable<Template> {
    return this.http.get<Template>(`${this.apiUrl}/templates/${id}/`);
  }

  createTemplate(template: Partial<Template>): Observable<Template> {
    return this.http.post<Template>(`${this.apiUrl}/templates/`, template);
  }

  updateTemplate(id: string, template: Partial<Template>): Observable<Template> {
    return this.http.patch<Template>(`${this.apiUrl}/templates/${id}/`, template);
  }

  deleteTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/templates/${id}/`);
  }

  addComponentToTemplate(templateId: string, component: Partial<TemplateComponent>): Observable<TemplateComponent> {
    return this.http.post<TemplateComponent>(`${this.apiUrl}/templates/${templateId}/add-component/`, component);
  }

  startProduction(templateId: string, name?: string): Observable<Realization> {
    const data = name ? { name } : {};
    return this.http.post<Realization>(`${this.apiUrl}/templates/${templateId}/start-production/`, data);
  }

  // Template Components
  getTemplateComponents(templateId: string): Observable<PaginatedResponse<TemplateComponent>> {
    const params = new HttpParams().set('template', templateId);
    return this.http.get<PaginatedResponse<TemplateComponent>>(`${this.apiUrl}/template-components/`, { params });
  }

  updateTemplateComponent(id: string, component: Partial<TemplateComponent>): Observable<TemplateComponent> {
    return this.http.patch<TemplateComponent>(`${this.apiUrl}/template-components/${id}/`, component);
  }

  deleteTemplateComponent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/template-components/${id}/`);
  }

  // Realizations
  getRealizations(page = 1, pageSize = 25, filters?: { production?: string; status?: string }): Observable<PaginatedResponse<Realization>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('page_size', pageSize.toString());

    if (filters?.production) {
      params = params.set('production', filters.production);
    }
    if (filters?.status) {
      params = params.set('status', filters.status);
    }

    return this.http.get<PaginatedResponse<Realization>>(`${this.apiUrl}/realizations/`, { params });
  }

  getRealization(id: string): Observable<Realization> {
    return this.http.get<Realization>(`${this.apiUrl}/realizations/${id}/`);
  }

  createRealization(realization: Partial<Realization>): Observable<Realization> {
    return this.http.post<Realization>(`${this.apiUrl}/realizations/`, realization);
  }

  createRealizationFromTemplate(data: { template_id: string; name: string; description?: string }): Observable<Realization> {
    return this.http.post<Realization>(`${this.apiUrl}/realizations/create-from-template/`, data);
  }

  updateRealization(id: string, realization: Partial<Realization>): Observable<Realization> {
    return this.http.patch<Realization>(`${this.apiUrl}/realizations/${id}/`, realization);
  }

  deleteRealization(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/realizations/${id}/`);
  }

  addComponentToRealization(realizationId: string, component: Partial<RealizationComponent>): Observable<RealizationComponent> {
    return this.http.post<RealizationComponent>(`${this.apiUrl}/realizations/${realizationId}/add-component/`, component);
  }

  // Realization Components
  getRealizationComponents(realizationId: string): Observable<PaginatedResponse<RealizationComponent>> {
    const params = new HttpParams().set('realization', realizationId);
    return this.http.get<PaginatedResponse<RealizationComponent>>(`${this.apiUrl}/realization-components/`, { params });
  }

  updateRealizationComponent(id: string, component: Partial<RealizationComponent>): Observable<RealizationComponent> {
    return this.http.patch<RealizationComponent>(`${this.apiUrl}/realization-components/${id}/`, component);
  }

  deleteRealizationComponent(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/realization-components/${id}/`);
  }
}
