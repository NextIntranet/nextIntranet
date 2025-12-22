import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ProductionService } from '../services/production.service';
import { Production, ProductionFolder } from '../models/production.models';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-production-edit',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ToastModule
  ],
  providers: [MessageService],
  templateUrl: './production-edit.component.html',
  styleUrls: ['./production-edit.component.scss']
})
export class ProductionEditComponent implements OnInit {
  productionForm: FormGroup;
  folders: ProductionFolder[] = [];
  isEditMode = false;
  productionId?: string;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private productionService: ProductionService,
    private router: Router,
    private route: ActivatedRoute,
    private messageService: MessageService
  ) {
    this.productionForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      folder: ['', Validators.required],
      link: [''],
      component_reference: ['']
    });
  }

  ngOnInit(): void {
    this.loadFolders();
    
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.isEditMode = true;
        this.productionId = id;
        this.loadProduction(id);
      }
    });
  }

  loadFolders(): void {
    this.productionService.getFolders(1, 1000).subscribe({
      next: (response) => {
        this.folders = response.results;
      },
      error: (error) => {
        console.error('Error loading folders:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se načíst složky'
        });
      }
    });
  }

  loadProduction(id: string): void {
    this.productionService.getProduction(id).subscribe({
      next: (production) => {
        this.productionForm.patchValue({
          name: production.name,
          description: production.description,
          folder: production.folder,
          link: production.link,
          component_reference: production.component_reference
        });
      },
      error: (error) => {
        console.error('Error loading production:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se načíst výrobní projekt'
        });
      }
    });
  }

  onSubmit(): void {
    if (this.productionForm.invalid) {
      Object.keys(this.productionForm.controls).forEach(key => {
        this.productionForm.controls[key].markAsTouched();
      });
      return;
    }

    this.loading = true;
    const productionData = this.productionForm.value;

    const request = this.isEditMode && this.productionId
      ? this.productionService.updateProduction(this.productionId, productionData)
      : this.productionService.createProduction(productionData);

    request.subscribe({
      next: (production) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Úspěch',
          detail: this.isEditMode ? 'Projekt byl upraven' : 'Projekt byl vytvořen'
        });
        this.router.navigate(['/production', production.id]);
      },
      error: (error) => {
        console.error('Error saving production:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se uložit projekt'
        });
        this.loading = false;
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/production']);
  }
}
