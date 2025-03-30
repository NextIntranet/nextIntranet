import { Component, Input, forwardRef, OnInit, Output, EventEmitter } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { inject } from '@angular/core';

import { NiSelectSupplierComponent } from '../ni-select-supplier/ni-select-supplier.component';
import { SupplierRelationService } from '../../../store/services/supplier-relation.service';

interface Supplier {
  id: string;
  name: string;
  contact: string;
}

@Component({
  selector: 'ni-suppliers-list',
  template: `
    <p-table [value]="suppliers" dataKey="name" editMode="row" [loading]="loading" styleClass="p-datatable-sm">
      <ng-template pTemplate="header">
        <tr>
          <th>Supplier</th>
          <th>Symbol</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-supplier let-editing="editing" let-ri="id">
        <tr [pEditableRow]="supplier">
          <td>
            <!-- Supplier selector -->
            <p-cellEditor>
              <ng-template pTemplate="output">
                {{ supplier.supplier.name }}
              </ng-template>
              <ng-template pTemplate="input">
                <ni-select-supplier [(ngModel)]="supplier.supplier.id" (ngModelChange)="onSupplierChange(ri, supplier)" [style]="{'width':'100%'}"> </ni-select-supplier>
              </ng-template>
            </p-cellEditor>
          </td>
          <td>
            <!-- Supplier symbol -->
            <p-cellEditor>
              <ng-template pTemplate="output">
                <span *ngIf="supplier.url">
                  <a [href]="supplier.url" target="_blank" rel="noopener noreferrer">
                    <i class="pi pi-globe" style="margin-right: 0.5rem;"></i>
                  </a>
                </span>
                {{ supplier.symbol }}
              </ng-template>
              <ng-template pTemplate="input">
                <input type="text" pInputText [(ngModel)]="supplier.symbol" (ngModelChange)="onSupplierChange(ri, supplier)" [style]="{'width':'100%'}">
              </ng-template>
            </p-cellEditor>
          </td>
          <td>
            <p-cellEditor>
              <ng-template pTemplate="output">
                {{ supplier.description }}
              </ng-template>
              <ng-template pTemplate="input">
                <input type="text" pInputText [(ngModel)]="supplier.description" (ngModelChange)="onSupplierChange(ri, supplier)" [style]="{'width':'100%'}">
              </ng-template>
            </p-cellEditor>
          </td>
          <td>
            <div class="flex align-items-center justify-content-center gap-2">
              <button pButton pRipple type="button" pInitEditableRow icon="pi pi-pencil" (click)="onRowEditInit(supplier)" class="p-button-rounded p-button-text" *ngIf="!editingSupplierKeys[supplier.id]"></button>
              <button pButton pRipple type="button" pSaveEditableRow icon="pi pi-check" (click)="onRowEditSave(supplier)" class="p-button-rounded p-button-text" *ngIf="editingSupplierKeys[supplier.id]"></button>
              <button pButton pRipple type="button" pCancelEditableRow icon="pi pi-times" (click)="onRowEditCancel(supplier, ri)" class="p-button-rounded p-button-text" *ngIf="editingSupplierKeys[supplier.id]"></button>
              <button pButton pRipple type="button" pDeleteEditableRow icon="pi pi-trash" (click)="onRowDelete(supplier)" class="p-button-rounded p-button-text" *ngIf="editingSupplierKeys[supplier.id]"></button>
            </div>
          </td>
        </tr>
      </ng-template>
    </p-table>
    <hr>
    <button pButton type="button" label="Add Supplier" icon="pi pi-plus" (click)="addSupplier()"></button>
  `,
  styles: [`
    :host ::ng-deep .p-datatable-table-container {
      overflow: visible !important;
    }
  `],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NiSuppliersListComponent),
    multi: true
  },
  MessageService,
  ConfirmationService
],
  standalone: true,
  imports: [FormsModule, CommonModule, InputTextModule, ButtonModule, TableModule, ToastModule, ConfirmDialogModule, NiSelectSupplierComponent]
})
export class NiSuppliersListComponent implements ControlValueAccessor, OnInit {
  @Input() componentId: string = '';
  suppliers: Supplier[] = [];
  selectedSupplierId: string = '';
  loading: boolean = false;
  editingSupplierKeys: { [key: string]: boolean } = {};

  onChange: any = () => {};
  onTouched: any = () => {};

  constructor(
    private http: HttpClient,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private supplierRelationService: SupplierRelationService
  ) {}

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.loading = true;
    const token = localStorage.getItem('authToken') ?? '';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    console.log('Loading suppliers for component ID:', this.componentId);

    this.supplierRelationService.getSupplierRelationsByComponentId(this.componentId)
      .pipe(
        catchError(error => {
          console.error('Error loading suppliers:', error);
          this.loading = false;
          return throwError(() => error);
        })
      )
      .subscribe(data => {
        console.log('Suppliers loaded:', data);
        this.suppliers = data;
        this.loading = false;
        this.onChange(this.suppliers);
      });

  }

  writeValue(value: Supplier[]): void {
    if (value) {
      this.suppliers = value;
    } else {
      this.suppliers = [];
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onSupplierChange(index: number, supplier: Supplier): void {
    console.log('Supplier changed:', supplier, 'at index:', index);
    this.selectedSupplierId = supplier.id;
  }

  updateSupplier(supplier: Supplier): void {
  }

  addSupplier(): void {
    const newSupplier: Supplier = { name: 'New Supplier', contact: '', id: '' };
    this.suppliers.push(newSupplier);
    this.createSupplier(newSupplier);
    this.onChange(this.suppliers);
  }

  createSupplier(supplier: Supplier): void {

    this.supplierRelationService.createSupplierRelation(this.componentId, supplier)
      .pipe(
        catchError(error => {
          console.error('Error creating supplier:', error);
          return throwError(() => error);
        })
      )
      .subscribe(() => {
        console.log('Supplier created successfully');
        this.loadSuppliers();
      });

  }

  onRowDelete(supplier: any): void {
    this.deleteSupplier(supplier);
  }

  deleteSupplier(supplier: any): void {
    this.supplierRelationService.deleteSupplierRelation(supplier.id)
      .pipe(
        catchError(error => {
          console.error('Error deleting supplier:', error);
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete supplier' });
          return throwError(() => error);
        })
      )
      .subscribe(() => {
        console.log('Supplier deleted successfully');
        this.loadSuppliers();
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Supplier is deleted' });
      });
  }

  onRowEditInit(supplier: Supplier) {
    console.log('Editing supplier:', supplier);
    console.log("id", supplier.id);

    // Reset all editing states
    this.editingSupplierKeys = {};

    // Enable editing for the selected row
    this.editingSupplierKeys[supplier.id] = true;
  }

  onRowEditSave(supplier: any) {
    console.log('Saving supplier:', supplier);
    console.log("id", supplier.id);

    const token = localStorage.getItem('authToken') ?? '';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    const payload = {
      'id': supplier.id,
      'supplier': supplier.supplier.id,
      'description': supplier.description,
      'symbol': supplier.symbol
    };

    console.log('Payload:', payload);
    console.log('Supplier ID:', supplier.id);

    this.supplierRelationService.updateSupplierRelation(supplier.id, payload)
      .pipe(
      catchError(error => {
        console.error('Error updating supplier:', error);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to update supplier' });
        return throwError(() => error);
      })
      )
      .subscribe(() => {
      console.log('Supplier updated successfully');
      this.loadSuppliers();
      this.editingSupplierKeys[supplier.id] = false; // Ensure editing state is toggled off
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Supplier is updated' });
      });
  }

  onRowEditCancel(supplier: Supplier, index: number) {
    console.log('Canceling edit for supplier:', supplier);
    this.editingSupplierKeys[supplier.id] = false; // Ensure editing state is toggled off
    this.loadSuppliers(); // Reload suppliers to reset any unsaved changes
  }
}
