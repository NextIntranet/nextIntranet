import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreeSelectModule } from 'primeng/treeselect';
import { TooltipModule } from 'primeng/tooltip';
import { LocationService } from '../../../store/services/location.service';

@Component({
  selector: 'ni-location-treeSelect',
  standalone: true,
  imports: [CommonModule, FormsModule, TreeSelectModule, TooltipModule],
  template: `
    <p-treeSelect
      [options]="locations"
      [(ngModel)]="selectedLocationKey"
      [placeholder]="placeholder"
      [disabled]="disabled"
      fluid="true"
      selectionMode="single"
      class="w-full"
      [showClear]="true"
      (onNodeSelect)="onNodeSelect($event)"
      (onNodeUnselect)="onNodeUnselect($event)"
      (onClear)="onClear()"
      [filter]="false">
      <ng-template let-node pTemplate="default">
        <span pTooltip="{{node.description}} | {{node.full_path}}">{{node.name}}</span>
      </ng-template>
      <ng-template let-node pTemplate="value">
        <span>{{node?.name}} - {{node?.description}}</span>
        <ng-container *ngIf="!node">{{ placeholder }}</ng-container>
      </ng-template>
    </p-treeSelect>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class NiLocationTreeSelectComponent implements OnInit {
  @Input() locations: any[] = [];
  @Input() placeholder: string = 'Select Location';
  @Input() disabled: boolean = false;
  @Input() selectedLocationKey: any = null;

  @Output() selectionChange = new EventEmitter<any>();

  ngOnInit(): void {
    if (!this.locations || this.locations.length === 0) {
      this.loadLocations();
    }
  }

  private loadLocations(): void {
    this.locationService.getLocationsTree().subscribe({
      next: (data: any[]) => {
        this.locations = data;
      },
      error: (error) => {
        console.error('Error loading locations:', error);
      }
    });
  }

  onNodeSelect(event: any): void {
    console.log('[NiLocationTreeSelect] Node selected:', event.node);
    this.selectionChange.emit(event.node);
  }

  onNodeUnselect(event: any): void {
    console.log('[NiLocationTreeSelect] Node unselected');
    // We don't emit anything here as the selectedLocationKey will be automatically updated by ngModel
  }

  onClear(): void {
    console.log('[NiLocationTreeSelect] Selection cleared');
    this.selectionChange.emit(null);
  }

  setSelectedLocations(locationId: string): void {
    console.log('[NiLocationTreeSelect] Setting selected location:', locationId);
    if (!locationId || !this.locations || this.locations.length === 0) {
      this.selectedLocationKey = null;
      return;
    }

    this.selectedLocationKey = this.locations.find(location => location.id === locationId) || null;
    console.log('[NiLocationTreeSelect] Selected location key:', this.selectedLocationKey);
  }

  constructor(private locationService: LocationService) {}
}