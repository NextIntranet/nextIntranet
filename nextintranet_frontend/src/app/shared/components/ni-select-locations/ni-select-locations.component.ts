import { Component, Input, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { TreeSelectModule } from 'primeng/treeselect';

@Component({
  selector: 'ni-select-location',
  template: `
    <p-treeselect
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
    </p-treeselect>
  `,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NiSelectLocationComponent),
    multi: true
  }],
  standalone: true,
  imports: [SelectModule, FormsModule, CommonModule, TreeSelectModule]
})
export class NiSelectLocationComponent implements OnInit, ControlValueAccessor {
  @Input() apiUrl = 'http://localhost:8080/api/v1/store/locations/';
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
        detail: 'Failed to load locations'
        });
        console.error('Error loading locations:', error);
        return throwError(() => error);
      })
      )
      .subscribe(data => {
      const map = new Map<number, any>();
      data.forEach(item => {
        map.set(item.id, { ...item, children: [] });
      });

      const treeData: any[] = [];
      map.forEach((item, id) => {
        if (item.parentId) {
        const parent = map.get(item.parentId);
        if (parent) {
          parent.children.push(item);
        }
        } else {
        treeData.push(item);
        }
      });

      this.items = treeData;
      this.loading = false;
      });
  }

  writeValue(obj: any): void { this.value = obj; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
