export interface ProductionFolder {
  id: string;
  name: string;
  description?: string;
  parent?: string;
  full_path: string;
  children?: ProductionFolder[];
  created_at: Date;
}

export interface Production {
  id: string;
  name: string;
  description?: string;
  folder: string;
  folder_name?: string;
  folder_path?: string;
  link?: string;
  component_reference?: string;
  component_reference_detail?: any;
  templates?: Template[];
  templates_count?: number;
  realizations?: Realization[];
  realizations_count?: number;
  created_at: Date;
}

export interface Template {
  id: string;
  production: string;
  production_name?: string;
  name: string;
  description?: string;
  version?: string;
  components?: TemplateComponent[];
  components_count?: number;
  created_at: Date;
}

export interface TemplateComponent {
  id: string;
  template: string;
  component: string;
  component_detail?: any;
  component_name?: string;
  position: number;
  notes?: string;
  attributes?: any;
  created_at: Date;
}

export interface Realization {
  id: string;
  production: string;
  production_name?: string;
  template: string;
  template_name?: string;
  name: string;
  description?: string;
  status: RealizationStatus;
  started_at?: Date;
  completed_at?: Date;
  components?: RealizationComponent[];
  components_count?: number;
  created_at: Date;
}

export interface RealizationComponent {
  id: string;
  realization: string;
  template_component?: string;
  template_component_id?: string;
  component: string;
  component_detail?: any;
  component_name?: string;
  position: number;
  notes?: string;
  attributes?: any;
  is_modified: boolean;
  created_at: Date;
}

export enum RealizationStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export interface PaginatedResponse<T> {
  count: number;
  next?: string;
  previous?: string;
  results: T[];
}
