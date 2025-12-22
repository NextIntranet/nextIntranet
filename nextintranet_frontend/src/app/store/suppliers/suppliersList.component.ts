import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupplierService } from '../services/supplier.service';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { DataViewModule } from 'primeng/dataview';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { RippleModule } from 'primeng/ripple';
import { PaginatorModule } from 'primeng/paginator';

import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';


@Component({
  selector: 'app-suppliers-list',
  templateUrl: './suppliersList.component.html',
  styleUrls: ['./suppliersList.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TableModule,
    DataViewModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    ToastModule
  ],
  providers: [MessageService]
})
export class SuppliersListComponent implements OnInit {

  supplierService = inject(SupplierService);
  messageService = inject(MessageService);

  suppliers: any[] = [];
  filteredSuppliers: any[] = [];
  filterText: string = '';
  showAddDialog: boolean = false;
  editingSupplier: any | null = null;
  clonedSupplier: { [id: string]: any } = {};

  first = 0;
  rows = 250;
  totalRecords = 0;
  currentPage = 1;

  newSupplier: any = { name: '' };

  constructor() { }

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.supplierService.getSuppliers(this.currentPage, this.rows).subscribe((response: any) => {
      this.suppliers = response.results;
      this.filteredSuppliers = [...this.suppliers];
      this.totalRecords = response.count;
    });
  }

  filterSuppliers(): void {
    if (!this.filterText) {
      this.filteredSuppliers = [...this.suppliers];
      return;
    }
    const filterLower = this.filterText.toLowerCase();
    this.filteredSuppliers = this.suppliers.filter(s => 
      s.name?.toLowerCase().includes(filterLower) ||
      s.website?.toLowerCase().includes(filterLower) ||
      s.link_template?.toLowerCase().includes(filterLower)
    );
  }

  onEditInit(supplier: any): void {
    if (supplier.id) {
      this.clonedSupplier[supplier.id] = { ...supplier };
      this.editingSupplier = supplier;
    }
  }

  onEditSave(supplier: any): void {
    if (supplier.id) {
      this.supplierService.updateSupplier(supplier).subscribe((updatedSupplier: any) => {
        const index = this.suppliers.findIndex(s => s.id === supplier.id);
        if (index !== -1) {
          this.suppliers[index] = updatedSupplier;
          this.filteredSuppliers = [...this.suppliers];
        }
        delete this.clonedSupplier[supplier.id];
        this.messageService.add({severity: 'success', summary: 'Success', detail: 'Supplier updated'});
      });
    }
    this.editingSupplier = null;
  }

  onEditCancel(supplier: any, index: number): void {
    if (supplier.id && this.clonedSupplier[supplier.id]) {
      this.suppliers[index] = this.clonedSupplier[supplier.id];
      delete this.clonedSupplier[supplier.id];
    }
    this.editingSupplier = null;
  }

  addSupplier(): void {
    this.supplierService.createSupplier(this.newSupplier).subscribe((newSupplier: any) => {
      this.suppliers.push(newSupplier);
      this.filteredSuppliers = [...this.suppliers];
      this.newSupplier = { name: '' };
      this.showAddDialog = false;
      this.messageService.add({severity: 'success', summary: 'Success', detail: 'Supplier added'});
    });
  }

  deleteSupplier(supplier: any): void {
    if (supplier.id && confirm('Are you sure you want to delete this supplier?')) {
      this.supplierService.deleteSupplier(supplier.id).subscribe(() => {
        this.suppliers = this.suppliers.filter(s => s.id !== supplier.id);
        this.filteredSuppliers = [...this.suppliers];
        this.messageService.add({severity: 'success', summary: 'Success', detail: 'Supplier deleted'});
      });
    }
  }

  onPageChange(event: any): void {
    this.currentPage = event.page + 1;
    this.first = event.first;
    this.rows = event.rows;
    this.loadSuppliers();
  }
}
