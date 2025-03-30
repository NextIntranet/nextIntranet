import { Component, Input, Output, EventEmitter, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { SupplierService } from 'src/app/store/services/supplier.service';

@Component({
  selector: 'ni-select-supplier',
  template: `
    <p-select
      [options]="items"
      [filter]="true" filterBy="name"
      [ngModel]="value"
      (ngModelChange)="onSelectionChange($event)"
      (blur)="onTouched()"
      [placeholder]="placeholder"
      [optionLabel]="labelField"
      [optionValue]="valueField"
      [loading]="loading"
      class="w-full"
    ></p-select>
  `,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NiSelectSupplierComponent),
    multi: true
  }],
  standalone: true,
  imports: [SelectModule, FormsModule, CommonModule]
})
export class NiSelectSupplierComponent implements OnInit, ControlValueAccessor {
  @Input() labelField = 'name';
  @Input() valueField = 'id';
  @Input() placeholder = 'Select...';
  @Input() styleClass = '';

  @Input() set ngModel(value: any) {
    this.value = value;
    this.onChange(value);
  }

  @Output() ngModelChange: EventEmitter<any> = new EventEmitter<any>();

  items: any[] = [];
  value: any;
  loading = false;

  onChange = (_: any) => {};
  onTouched = () => {};

  constructor(
    private supplierService: SupplierService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loading = true;

    this.supplierService.getSuppliers()
      .pipe(
        catchError(error => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Loading Error',
            detail: 'Failed to load suppliers'
          });
          console.error('Error loading suppliers:', error);
          return throwError(() => error);
        })
      )
      .subscribe(data => {
        this.items = data.results;
        this.loading = false;
      });
  }

  writeValue(obj: any): void {
    this.value = obj;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onSelectionChange(value: any): void {
    console.log('NiSelectSupplierComponent: Selection changed to', value);
    this.value = value; // Update the internal value
    this.onChange(value); // Notify Angular forms of the change
    this.ngModelChange.emit(value); // Emit the change event
  }
}
