import { Component, Input, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { CategoryService } from 'src/app/store/services/category.service';

@Component({
  selector: 'ni-select-category',
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
    useExisting: forwardRef(() => NiSelectCategoryComponent),
    multi: true
  }],
  standalone: true,
  imports: [SelectModule, FormsModule, CommonModule]
})
export class NiSelectCategoryComponent implements OnInit, ControlValueAccessor {
  // @Input() apiUrl = 'http://localhost:8080/api/v1/store/categories/';
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
    private categoryService: CategoryService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loading = true;

    this.categoryService.getCategories().subscribe(data => {
      this.items = data.results;
      this.loading = false;
    });

  }

    // const token = localStorage.getItem('authToken') ?? '';
    // const headers = new HttpHeaders({
    //   'Authorization': `Bearer ${token}`,
    //   'Content-Type': 'application/json'
    // });

    // this.http.get<any[]>(this.apiUrl, { headers })
    //   .pipe(
    //     catchError(error => {
    //       this.loading = false;
    //       this.messageService.add({
    //         severity: 'error',
    //         summary: 'Loading Error',
    //         detail: 'Failed to load categories'
    //       });
    //       console.error('Error loading categories:', error);
    //       return throwError(() => error);
    //     })
    //   )
    //   .subscribe(data => {
    //     this.items = data;
    //     this.loading = false;
    //   });
    // }

  writeValue(obj: any): void { this.value = obj; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
