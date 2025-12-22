import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupplierService } from '../services/supplier.service';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-supplier-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CardModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    ProgressSpinnerModule
  ],
  providers: [MessageService],
  templateUrl: './supplier-detail.component.html',
  styleUrl: './supplier-detail.component.css'
})
export class SupplierDetailComponent implements OnInit {
  supplierId: string = '';
  supplier: any = null;
  loading = true;
  editMode = false;
  editedSupplier: any = {};

  constructor(
    private route: ActivatedRoute,
    private supplierService: SupplierService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.supplierId = params['id'];
      this.loadSupplierDetail();
    });
  }

  loadSupplierDetail() {
    this.loading = true;
    this.supplierService.getSuppliers(1, 1000).subscribe({
      next: (response: any) => {
        this.supplier = response.results.find((s: any) => s.id === this.supplierId);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.editedSupplier = { ...this.supplier };
    }
  }

  cancelEdit() {
    this.editMode = false;
    this.editedSupplier = {};
  }

  saveChanges() {
    this.supplierService.updateSupplier(this.editedSupplier).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Supplier updated successfully'
        });
        this.supplier = { ...this.editedSupplier };
        this.editMode = false;
        this.loadSupplierDetail();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update supplier'
        });
      }
    });
  }
}
