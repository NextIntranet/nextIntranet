import { Component, Input, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { TreeSelectModule } from 'primeng/treeselect';
import { LocationService } from '../../../store/services/location.service';

@Component({
  selector: 'ni-select-location',
  template: `
    <p-select
      [options]="items"
      [filter]="true" filterBy="name"
      [(ngModel)]="value"
      (ngModelChange)="onChange($event)"
      (blur)="onTouched()"
      [placeholder]="placeholder"
      optionLabel="full_path"
      optionValue="id"
      [loading]="loading"
      class="w-full"
      size="small"
      >

      <ng-template let-location #item>
        <div class="flex items-center gap-2">
            <div><b>{{location.name}} </b>({{ location.description }})</div>
        </div>
      </ng-template>
      <ng-template let-location #selectedItem>
        <div class="flex items-center gap-2">
            {{ location.name}}
        </div>
      </ng-template>
    </p-select>
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
  @Input() placeholder = 'Select...';
  @Input() styleClass = '';

  items: any[] = [];
  value: any;
  loading = false;

  onChange = (_: any) => {};
  onTouched = () => {};

  constructor(
    private locationService: LocationService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loading = true;

    this.locationService.getLocations().pipe(
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
    ).subscribe(data => {
      this.items = data.results;
      this.loading = false;
    });
  }

  writeValue(obj: any): void { this.value = obj; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
