import { Component, Input, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'ni-select-parameterTypes',
  template: `
    <p-select
      [options]="items"
      [filter]="true" filterBy="name"
      [(ngModel)]="value"
      (ngModelChange)="onChange($event)"
      (blur)="onTouched()"
      [optionLabel]="labelField"
      [optionValue]="valueField"
      [placeholder]="placeholder"
      [styleClass]="styleClass"
      [loading]="loading">
    </p-select>
  `,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NiSelectParameterTypesComponent),
    multi: true
  }],
  standalone: true,
  imports: [SelectModule, FormsModule, CommonModule]
})
export class NiSelectParameterTypesComponent implements OnInit, ControlValueAccessor {
  @Input() apiUrl = 'http://localhost:8080/api/v1/store/parameterTypes/';
  @Input() labelField = 'name';
  @Input() valueField = 'id';
  @Input() placeholder = 'Select...';
  @Input() styleClass = '';

  items: any[] = [];
  value: any;
  loading = false;

  onChange = (_: any) => {};
  onTouched = () => {};

  constructor(
    private http: HttpClient,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loading = true;
    const token = localStorage.getItem('authToken') ?? '';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    this.http.get<any[]>(this.apiUrl, { headers })
      .pipe(
        catchError(error => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Loading Error',
            detail: 'Failed to load parameter types'
          });
          console.error('Error loading parameter types:', error);
          return throwError(() => error);
        })
      )
      .subscribe(data => {
        this.items = data;
        this.loading = false;
      });
  }

  writeValue(obj: any): void { this.value = obj; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
