import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductionService } from '../services/production.service';
import { Template, TemplateComponent } from '../models/production.models';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { FileUploadModule } from 'primeng/fileupload';
import { CheckboxModule } from 'primeng/checkbox';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environment';
import { StoreComponentService } from '../../store/services/store.service';

@Component({
  selector: 'app-template-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    TableModule,
    InputTextModule,
    InputNumberModule,
    DialogModule,
    ToastModule,
    FileUploadModule,
    CheckboxModule,
    AutoCompleteModule
  ],
  providers: [MessageService],
  templateUrl: './template-detail.component.html',
  styleUrls: ['./template-detail.component.scss']
})
export class TemplateDetailComponent implements OnInit {
  template?: Template;
  components: TemplateComponent[] = [];
  loading = false;
  templateId?: string;
  
  showAddDialog = false;
  showImportDialog = false;
  componentForm: FormGroup;
  editingComponent?: TemplateComponent;
  clearExisting = false;
  uploadingBom = false;
  
  availableComponents: Array<{label: string, value: string}> = [];
  
  // Make Object available in template
  Object = Object;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private http: HttpClient,
    private productionService: ProductionService,
    private storeService: StoreComponentService,
    private messageService: MessageService
  ) {
    this.componentForm = this.fb.group({
      component: [''],
      position: [0],
      notes: [''],
      attributes: [{}]
    });
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.templateId = id;
        this.loadTemplate(id);
      }
    });
    this.loadComponents('');
  }

  loadTemplate(id: string): void {
    this.loading = true;
    this.productionService.getTemplate(id).subscribe({
      next: (template) => {
        this.template = template;
        this.components = template.components || [];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading template:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se načíst šablonu'
        });
        this.loading = false;
      }
    });
  }

  onAddComponent(): void {
    this.editingComponent = undefined;
    this.componentForm.reset({ position: this.components.length, attributes: {} });
    this.showAddDialog = true;
  }

  onEditComponent(component: TemplateComponent): void {
    this.editingComponent = component;
    
    // Find the component in availableComponents to set proper label
    const selectedComponent = component.component ? 
      this.availableComponents.find(c => c.value === component.component) : null;
    
    this.componentForm.patchValue({
      component: selectedComponent || component.component,
      position: component.position,
      notes: component.notes,
      attributes: component.attributes || {}
    });
    this.showAddDialog = true;
  }

  onSaveComponent(): void {
    if (this.componentForm.invalid || !this.templateId) return;

    const formValue = this.componentForm.value;
    const componentData = {
      ...formValue,
      component: typeof formValue.component === 'object' ? formValue.component?.value : formValue.component
    };

    if (this.editingComponent) {
      // Update existing component
      this.productionService.updateTemplateComponent(this.editingComponent.id, componentData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Úspěch',
            detail: 'Součástka byla upravena'
          });
          this.showAddDialog = false;
          this.loadTemplate(this.templateId!);
        },
        error: (error) => {
          console.error('Error updating component:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Chyba',
            detail: 'Nepodařilo se upravit součástku'
          });
        }
      });
    } else {
      // Add new component
      this.productionService.addComponentToTemplate(this.templateId, componentData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Úspěch',
            detail: 'Součástka byla přidána'
          });
          this.showAddDialog = false;
          this.loadTemplate(this.templateId!);
        },
        error: (error) => {
          console.error('Error adding component:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Chyba',
            detail: 'Nepodařilo se přidat součástku'
          });
        }
      });
    }
  }

  onDeleteComponent(component: TemplateComponent): void {
    if (!confirm(`Opravdu chcete odstranit součástku ${component.component_name}?`)) return;

    this.productionService.deleteTemplateComponent(component.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Úspěch',
          detail: 'Součástka byla odstraněna'
        });
        if (this.templateId) {
          this.loadTemplate(this.templateId);
        }
      },
      error: (error) => {
        console.error('Error deleting component:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se odstranit součástku'
        });
      }
    });
  }

  onBack(): void {
    if (this.template?.production) {
      this.router.navigate(['/production', this.template.production]);
    } else {
      this.router.navigate(['/production']);
    }
  }

  onImportBom(): void {
    this.clearExisting = false;
    this.showImportDialog = true;
  }

  onUpload(event: any): void {
    if (!this.templateId) return;

    const file = event.files[0];
    if (!file) return;

    this.uploadingBom = true;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('clear_existing', this.clearExisting.toString());

    const token = localStorage.getItem('authToken');
    const headers = { 'Authorization': `Bearer ${token}` };

    this.http.post(
      `${environment.apiUrl}/api/v1/production/templates/${this.templateId}/import-bom/`,
      formData,
      { headers }
    ).subscribe({
      next: (response: any) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Úspěch',
          detail: `Přidáno ${response.components_added} součástek` + 
                  (response.components_failed > 0 ? `, ${response.components_failed} selhalo` : '')
        });
        
        if (response.errors && response.errors.length > 0) {
          console.error('Import errors:', response.errors);
        }
        
        this.showImportDialog = false;
        this.uploadingBom = false;
        this.loadTemplate(this.templateId!);
      },
      error: (error) => {
        console.error('Error importing BOM:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: error.error?.error || 'Nepodařilo se importovat BOM'
        });
        this.uploadingBom = false;
      }
    });
  }

  loadComponents(searchTerm: string): void {
    this.storeService.loadComponents(1, 50, searchTerm).subscribe({
      next: (response) => {
        this.availableComponents = response.results.map((comp: any) => ({
          label: `${comp.name} (${comp.id})`,
          value: comp.id
        }));
      },
      error: (error) => {
        console.error('Error loading components:', error);
      }
    });
  }

  onComponentSearch(event: any): void {
    const query = event.query || '';
    this.loadComponents(query);
  }

  onStartProduction(): void {
    if (!this.templateId) return;

    this.productionService.startProduction(this.templateId).subscribe({
      next: (realization) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Úspěch',
          detail: 'Výroba zahájena'
        });
        // Navigate to manufacturing view
        this.router.navigate(['/production/manufacturing', realization.id]);
      },
      error: (error) => {
        console.error('Error starting production:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se zahájit výrobu'
        });
      }
    });
  }
}
