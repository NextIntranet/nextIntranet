import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupplierService } from '../services/supplier.service';

// PrimeNG imports
import { TableModule } from 'primeng/table';
import { DataViewModule } from 'primeng/dataview';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { RippleModule } from 'primeng/ripple';
import { PaginatorModule } from 'primeng/paginator';

import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';


@Component({
  selector: 'app-suppliers-list',
  templateUrl: './suppliersList.component.html',
  styleUrls: ['./suppliersList.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    DataViewModule,
    ButtonModule,
    InputTextModule,
    RippleModule,
    PaginatorModule,
    InputGroupModule,
    InputGroupAddonModule
  ]
})
export class SuppliersListComponent implements OnInit {

  supplierService = inject(SupplierService);

  suppliers: any[] = [];
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
      this.totalRecords = response.count;
    });
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
        }
        delete this.clonedSupplier[supplier.id];
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
      this.newSupplier = { name: '' };
    });
  }

  deleteSupplier(supplier: any): void {
    if (supplier.id) {
      this.supplierService.deleteSupplier(supplier.id).subscribe(() => {
        this.suppliers = this.suppliers.filter(s => s.id !== supplier.id);
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
