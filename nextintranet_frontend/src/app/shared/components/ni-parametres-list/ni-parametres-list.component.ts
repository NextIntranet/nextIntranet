import { Component, Input, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { catchError, throwError } from 'rxjs';
import { NiSelectParameterTypesComponent } from '../ni-select-parameterTypes/ni-select-parameterTypes.component';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { NiParametersRelationService } from '../../../store/services/ni-parameters-relation.service';

interface Parameter {
  id: string;
  name: string;
  value: string;
  parameter_type?: { id: string; name: string };
}

@Component({
  selector: 'ni-parameters-list',
  template: `
    <p-table [value]="parameters" dataKey="name" editMode="row" [loading]="loading" styleClass="p-datatable-sm">
      <ng-template pTemplate="header">
        <tr>
          <th>Name</th>
          <th>Value</th>
          <th></th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-parameter let-editing="editing" let-ri="id">
        <tr [pEditableRow]="parameter">
          <td>
            <p-cellEditor>
              <ng-template pTemplate="input">
                <ni-select-parameterTypes [(ngModel)]="parameter.parameter_type.id" (ngModelChange)="onParameterChange(ri, parameter)" class="w-full"></ni-select-parameterTypes>
              </ng-template>
              <ng-template pTemplate="output">
                {{ parameter.parameter_type.name }}
              </ng-template>
            </p-cellEditor>
          </td>
          <td>
            <p-cellEditor>
              <ng-template pTemplate="input">
                <input type="text" pInputText [(ngModel)]="parameter.value" (ngModelChange)="onParameterChange(ri, parameter)">
              </ng-template>
              <ng-template pTemplate="output">
                {{ parameter.value }}
              </ng-template>
            </p-cellEditor>
          </td>
          <td>
            <div class="flex align-items-center justify-content-center gap-2">
              <button pButton pRipple type="button" pInitEditableRow icon="pi pi-pencil" (click)="onRowEditInit(parameter)" class="p-button-rounded p-button-text" *ngIf="!editingParameterKeys[parameter.id]"></button>
              <button pButton pRipple type="button" pSaveEditableRow icon="pi pi-check" (click)="onRowEditSave(parameter)" class="p-button-rounded p-button-text" *ngIf="editingParameterKeys[parameter.id]"></button>
              <button pButton pRipple type="button" pCancelEditableRow icon="pi pi-times" (click)="onRowEditCancel(parameter, ri)" class="p-button-rounded p-button-text" *ngIf="editingParameterKeys[parameter.id]"></button>
              <button pButton pRipple type="button" pDeleteEditableRow icon="pi pi-trash" (click)="onRowDelete(parameter)" class="p-button-rounded p-button-text" *ngIf="editingParameterKeys[parameter.id]"></button>
            </div>
          </td>
        </tr>
      </ng-template>
    </p-table>
    <hr>

    <button pButton type="button" icon="pi pi-plus" class="p-button-rounded p-button-text" (click)="addParameter()"></button>
  `,
  styles: [`

    :host ::ng-deep .p-datatable-table-container {
      overflow: visible !important;
    }

  `],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => NiParametersListComponent),
    multi: true
  },
  MessageService,
  ConfirmationService
],
  standalone: true,
  imports: [FormsModule, CommonModule, InputTextModule, ButtonModule, TableModule, ToastModule, ConfirmDialogModule, NiSelectParameterTypesComponent]
})
export class NiParametersListComponent implements ControlValueAccessor, OnInit {
  @Input() componentId: string = '';
  parameters: Parameter[] = [];
  loading: boolean = false;
  editingParameterKeys: { [key: string]: boolean } = {};

  onChange: any = () => {};
  onTouched: any = () => {};

  constructor(
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private niParametersRelationService: NiParametersRelationService
  ) {}

  ngOnInit(): void {
    this.loadParameters();
  }

  loadParameters(): void {
    this.loading = true;
    this.niParametersRelationService.getParametersByComponentId(this.componentId)
      .pipe(
        catchError(error => {
          console.error('Error loading parameters:', error);
          this.loading = false;
          return throwError(() => error);
        })
      )
      .subscribe(data => {
        console.log('Parameters loaded:', data);
        this.parameters = data;
        this.parameters.forEach(parameter => {
          if (!parameter.parameter_type) {
            parameter.parameter_type = { id: '', name: '' };
          }
        });
        this.loading = false;
        this.onChange(this.parameters);
      });
  }

  writeValue(value: Parameter[]): void {
    if (value) {
      this.parameters = value;
    } else {
      this.parameters = [];
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onParameterChange(index: number, parameter: Parameter): void {
    this.onTouched();
    this.updateParameter(parameter);
    this.onChange(this.parameters);
  }

  updateParameter(parameter: Parameter): void {
  }

  addParameter(): void {
    const newParameter: Parameter = { id: '', name: 'New Parameter', value: '', parameter_type: { id: '', name: '' } };
    this.parameters.push(newParameter);
    this.editingParameterKeys[newParameter.id] = true;
    this.createParameter(newParameter);
    this.onChange(this.parameters);
  }

  createParameter(parameter: Parameter): void {
    const payload = {
      component: this.componentId,
      parameter_type: null,
      value: null
    };

    this.niParametersRelationService.createParameter(this.componentId, payload)
      .pipe(
        catchError(error => {
          console.error('Error creating parameter:', error);
          return throwError(() => error);
        })
      )
      .subscribe(() => {
        console.log('Parameter created successfully');
        this.loadParameters();
      });
  }

  onRowDelete(parameter: any): void {
    this.niParametersRelationService.deleteParameter(parameter.id)
      .pipe(
        catchError(error => {
          console.error('Error deleting parameter:', error);
          return throwError(() => error);
        })
      )
      .subscribe(() => {
        console.log('Parameter deleted successfully');
        this.loadParameters();
      });
  }

  onRowEditInit(parameter: Parameter) {
        console.log('Editing parameter:', parameter);
        console.log("id", parameter.id);
        this.editingParameterKeys[parameter.id] = true;
  }

  onRowEditSave(parameter: any): void {
    const payload = {
      id: parameter.id,
      parameter_type: parameter.parameter_type.id,
      value: parameter.value
    };

    this.niParametersRelationService.updateParameter(parameter.id, payload)
      .pipe(
        catchError(error => {
          console.error('Error updating parameter:', error);
          return throwError(() => error);
        })
      )
      .subscribe(() => {
        console.log('Parameter updated successfully');
        this.loadParameters();
      });

    if (parameter.value) {
        this.editingParameterKeys[parameter.id] = false;
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Parameter is updated' });
    }
    else {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Invalid Data' });
    }
  }

  onRowEditCancel(parameter: Parameter, index: number) {
      this.editingParameterKeys[parameter.id] = false;
  }


}
