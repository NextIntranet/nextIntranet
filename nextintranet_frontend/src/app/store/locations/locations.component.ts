import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LocationService } from '../services/location.service';
import { TreeModule } from 'primeng/tree';
import { TreeTableModule } from 'primeng/treetable';
import { TreeNode, TreeDragDropService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-locations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TreeModule,
    TreeTableModule,
    ButtonModule,
    DialogModule,
    TagModule,
    InputTextModule,
    CheckboxModule,
    ToastModule,
    TooltipModule
  ],
  providers: [MessageService, TreeDragDropService],
  templateUrl: './locations.component.html',
  styleUrl: './locations.component.css'
})
export class LocationsComponent implements OnInit {
  locations: TreeNode[] = [];
  filteredLocations: TreeNode[] = [];
  selectedLocation: TreeNode | null = null;
  displayDialog = false;
  filterText: string = '';
  locationData: any = {
    name: '',
    description: '',
    parent: null,
    can_store_items: false
  };
  isEditMode = false;

  constructor(
    private locationService: LocationService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadLocations();
  }

  loadLocations() {
    this.locationService.getLocationsTree().subscribe({
      next: (data: any) => {
        this.locations = this.transformToTreeNodes(data);
        this.filteredLocations = [...this.locations];
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load locations'
        });
      }
    });
  }

  transformToTreeNodes(data: any[], level: number = 0): TreeNode[] {
    return data.map(item => ({
      label: item.name,
      data: item,
      children: item.children ? this.transformToTreeNodes(item.children, level + 1) : [],
      expanded: level === 0, // Auto-expand only first level
      droppable: true,
      draggable: true
    }));
  }

  openNewDialog() {
    this.isEditMode = false;
    this.locationData = {
      name: '',
      description: '',
      parent: this.selectedLocation?.data?.id || null,
      can_store_items: false
    };
    this.displayDialog = true;
  }

  openEditDialog() {
    if (!this.selectedLocation) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a location first'
      });
      return;
    }
    this.isEditMode = true;
    this.locationData = {
      ...this.selectedLocation.data
    };
    this.displayDialog = true;
  }

  saveLocation() {
    if (this.isEditMode) {
      this.locationService.updateLocation(this.locationData.id, this.locationData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Location updated'
          });
          this.displayDialog = false;
          this.loadLocations();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update location'
          });
        }
      });
    } else {
      this.locationService.createLocation(this.locationData).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Location created'
          });
          this.displayDialog = false;
          this.loadLocations();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to create location'
          });
        }
      });
    }
  }

  deleteLocation() {
    if (!this.selectedLocation) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a location first'
      });
      return;
    }

    if (confirm('Are you sure you want to delete this location?')) {
      this.locationService.deleteLocation(this.selectedLocation.data.id).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Location deleted'
          });
          this.selectedLocation = null;
          this.loadLocations();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete location'
          });
        }
      });
    }
  }

  onNodeSelect(event: any) {
    this.selectedLocation = event.node;
  }

  filterTree() {
    if (!this.filterText) {
      this.filteredLocations = [...this.locations];
      return;
    }

    const filterLower = this.filterText.toLowerCase();
    this.filteredLocations = this.filterNodes(this.locations, filterLower);
  }

  filterNodes(nodes: TreeNode[], filterText: string): TreeNode[] {
    return nodes.reduce((filtered: TreeNode[], node) => {
      const nodeMatches = node.label?.toLowerCase().includes(filterText) || 
                         node.data?.description?.toLowerCase().includes(filterText);
      const filteredChildren = node.children ? this.filterNodes(node.children, filterText) : [];

      if (nodeMatches || filteredChildren.length > 0) {
        filtered.push({
          ...node,
          children: filteredChildren,
          expanded: filteredChildren.length > 0 // Auto-expand if has matching children
        });
      }
      return filtered;
    }, []);
  }

  expandAll() {
    this.filteredLocations = this.expandNodes(this.filteredLocations, true);
  }

  collapseAll() {
    this.filteredLocations = this.expandNodes(this.filteredLocations, false);
  }

  expandNodes(nodes: TreeNode[], expanded: boolean): TreeNode[] {
    return nodes.map(node => ({
      ...node,
      expanded: expanded,
      children: node.children ? this.expandNodes(node.children, expanded) : []
    }));
  }

  onNodeDrop(event: any) {
    const draggedNode = event.dragNode;
    const dropNode = event.dropNode;
    
    // Update parent relationship
    const locationData = {
      ...draggedNode.data,
      parent: dropNode?.data?.id || null
    };

    this.locationService.updateLocation(draggedNode.data.id, locationData).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Location moved'
        });
        this.loadLocations();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to move location'
        });
        this.loadLocations(); // Reload to revert visual change
      }
    });
  }
}
