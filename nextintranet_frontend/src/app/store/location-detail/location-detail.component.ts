import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { LocationService } from '../services/location.service';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TreeModule } from 'primeng/tree';
import { TreeNode } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { CopyButtonComponent } from '../../shared/components/copy-button/copy-button.component';

@Component({
  selector: 'app-location-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CardModule,
    TagModule,
    TreeModule,
    TableModule,
    ButtonModule,
    ProgressSpinnerModule,
    InputTextModule,
    CheckboxModule,
    FormsModule,
    ToastModule,
    CopyButtonComponent
  ],
  providers: [MessageService],
  templateUrl: './location-detail.component.html',
  styleUrl: './location-detail.component.css'
})
export class LocationDetailComponent implements OnInit {
  locationId: string = '';
  location: any = null;
  loading = true;
  childrenTree: TreeNode[] = [];
  packets: any[] = [];
  editMode = false;
  editedLocation: any = {};

  constructor(
    private route: ActivatedRoute,
    private locationService: LocationService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.locationId = params['id'];
      this.loadLocationDetail();
      this.loadChildren();
      this.loadPackets();
    });
  }

  loadLocationDetail() {
    this.loading = true;
    this.locationService.getLocations().subscribe({
      next: (response: any) => {
        // Find location by ID in the results
        const allLocations = this.flattenLocations(response.results || []);
        this.location = allLocations.find((loc: any) => loc.id === this.locationId);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  flattenLocations(locations: any[]): any[] {
    let result: any[] = [];
    for (const loc of locations) {
      result.push(loc);
      if (loc.children && loc.children.length > 0) {
        result = result.concat(this.flattenLocations(loc.children));
      }
    }
    return result;
  }

  loadChildren() {
    this.locationService.getLocationsTree(this.locationId).subscribe({
      next: (data: any) => {
        this.childrenTree = this.transformToTreeNodes(data);
      }
    });
  }

  transformToTreeNodes(data: any[]): TreeNode[] {
    return data.map(item => ({
      label: item.name,
      data: item,
      children: item.children ? this.transformToTreeNodes(item.children) : [],
      expanded: true
    }));
  }

  loadPackets() {
    // TODO: Load packets for this location from API
    // For now, we'll leave it empty until the API endpoint is available
    this.packets = [];
  }

  toggleEditMode() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.editedLocation = { ...this.location };
    }
  }

  cancelEdit() {
    this.editMode = false;
    this.editedLocation = {};
  }

  saveChanges() {
    this.locationService.updateLocation(this.locationId, this.editedLocation).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Location updated successfully'
        });
        this.location = { ...this.editedLocation };
        this.editMode = false;
        this.loadLocationDetail();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to update location'
        });
      }
    });
  }
}
