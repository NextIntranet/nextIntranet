import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ProductionService } from '../services/production.service';
import { Realization, RealizationComponent, RealizationStatus } from '../models/production.models';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { TreeTableModule } from 'primeng/treetable';
import { InputTextModule } from 'primeng/inputtext';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MessageService, TreeNode } from 'primeng/api';
import { StoreComponentService } from '../../store/services/store.service';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';

@Component({
  selector: 'app-manufacturing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    CardModule,
    TableModule,
    TreeTableModule,
    InputTextModule,
    AutoCompleteModule,
    ToastModule,
    TagModule,
    ProgressBarModule,
    TooltipModule
  ],
  providers: [MessageService],
  templateUrl: './manufacturing.html',
  styleUrl: './manufacturing.css',
})
export class Manufacturing implements OnInit {
  realization?: Realization;
  components: RealizationComponent[] = [];
  treeNodes: TreeNode[] = [];
  loading = false;
  realizationId?: string;
  
  barcodeInput = '';
  usedComponents: Set<string> = new Set();
  alternativeComponents: Map<string, string> = new Map(); // component_id -> selected alternative
  pendingAlternatives: Map<string, any> = new Map(); // component_id -> pending selection (not yet confirmed)
  originalComponents: Map<string, string> = new Map(); // component_id -> original component from template
  availableComponents: Array<{label: string, value: string}> = [];
  
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private productionService: ProductionService,
    private storeService: StoreComponentService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.realizationId = id;
        this.loadRealization(id);
      }
    });
    this.loadComponents('');
  }

  loadRealization(id: string): void {
    this.loading = true;
    this.productionService.getRealization(id).subscribe({
      next: (realization) => {
        this.realization = realization;
        this.components = realization.components || [];
        
        // Restore alternativeComponents and usedComponents from server data
        this.alternativeComponents.clear();
        this.usedComponents.clear();
        this.originalComponents.clear();
        
        this.components.forEach(comp => {
          // Store original component value (from when realization was created)
          if (comp.component) {
            this.originalComponents.set(comp.id, comp.component);
          }
          
          // If is_modified is true, it means user selected an alternative
          if (comp.is_modified && comp.component) {
            this.alternativeComponents.set(comp.id, comp.component);
            this.usedComponents.add(comp.id);
          }
        });
        
        this.buildTreeNodes();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading realization:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se načíst realizaci'
        });
        this.loading = false;
      }
    });
  }

  buildTreeNodes(): void {
    const groups = new Map<string, {
      component_id: string;
      component_name?: string;
      value?: string;
      ref?: string;
      footprint?: string;
      position: number;
      children: RealizationComponent[];
    }>();
    
    // Group components by component_id and value
    this.components.forEach(comp => {
      const value = comp.attributes?.value || '';
      const key = `${comp.component || 'unassigned'}_${value}`;
      
      if (groups.has(key)) {
        groups.get(key)!.children.push(comp);
      } else {
        groups.set(key, {
          component_id: comp.component,
          component_name: comp.component_name,
          value: value,
          ref: comp.attributes?.ref || '',
          footprint: comp.attributes?.footprint || '',
          position: comp.position,
          children: [comp]
        });
      }
    });
    
    // Convert to TreeNode structure
    this.treeNodes = Array.from(groups.values())
      .sort((a, b) => a.position - b.position)
      .map(group => {
        const usedCount = group.children.filter(c => this.usedComponents.has(c.id)).length;
        const allUsed = usedCount === group.children.length;
        const partiallyUsed = usedCount > 0 && usedCount < group.children.length;
        
        // Aggregate all refs from children
        const allRefs = group.children
          .map(c => c.attributes?.ref)
          .filter(r => r)
          .join(', ');
        
        return {
          data: {
            component_id: group.component_id,
            component_name: group.component_name,
            ref: allRefs || group.ref,
            value: group.value,
            footprint: group.footprint,
            count: group.children.length,
            usedCount: usedCount,
            position: group.position,
            isGroup: true,
            allUsed: allUsed,
            partiallyUsed: partiallyUsed
          },
          expanded: true, // Expand by default
          children: group.children.map(comp => ({
            data: {
              id: comp.id,
              component_id: comp.component,
              component_name: comp.component_name,
              ref: comp.attributes?.ref || '',
              value: comp.attributes?.value || '',
              footprint: comp.attributes?.footprint || '',
              position: comp.position,
              notes: comp.notes,
              isGroup: false,
              used: this.usedComponents.has(comp.id)
            }
          }))
        };
      });
  }

  get progress(): number {
    if (this.components.length === 0) return 0;
    return (this.usedComponents.size / this.components.length) * 100;
  }

  onBarcodeScanned(): void {
    if (!this.barcodeInput.trim()) return;

    const barcode = this.barcodeInput.trim();
    
    // Find component by barcode (component ID)
    const component = this.components.find(c => c.component === barcode && !this.usedComponents.has(c.id));
    
    if (component) {
      this.usedComponents.add(component.id);
      this.buildTreeNodes();
      this.messageService.add({
        severity: 'success',
        summary: 'Součástka nalezena',
        detail: `${component.component_name || component.component} - označeno jako použito`
      });
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Nenalezeno',
        detail: `Součástka s kódem ${barcode} není v tomto BOM nebo je již použita`
      });
    }
    
    this.barcodeInput = '';
  }

  toggleComponent(componentId: string): void {
    if (this.usedComponents.has(componentId)) {
      this.usedComponents.delete(componentId);
    } else {
      this.usedComponents.add(componentId);
    }
    this.buildTreeNodes();
  }

  toggleGroup(node: TreeNode): void {
    if (!node.children) return;
    
    const allUsed = node.data.allUsed;
    
    // Toggle all child components
    node.children.forEach(child => {
      if (allUsed) {
        this.usedComponents.delete(child.data.id);
      } else {
        this.usedComponents.add(child.data.id);
      }
    });
    
    this.buildTreeNodes();
  }

  isUsed(componentId: string): boolean {
    return this.usedComponents.has(componentId);
  }

  loadComponents(searchTerm: string): void {
    this.storeService.loadComponents(1, 50, searchTerm).subscribe({
      next: (response) => {
        this.availableComponents = response.results.map((comp: any) => ({
          label: `${comp.name} (${comp.id})`,
          value: comp.id
        }));
      },
      error: (error) => {
        console.error('Error loading components:', error);
      }
    });
  }

  onComponentSearch(event: any): void {
    const query = event.query || '';
    this.loadComponents(query);
  }

  onAlternativeSelected(rowData: any, alternative: any): void {
    const componentIdsToUpdate: string[] = [];
    
    console.log('onAlternativeSelected called with:', alternative);
    
    // Extract the value - ensure we get just the string ID
    let componentValue: string;
    if (typeof alternative === 'string') {
      componentValue = alternative;
    } else if (alternative && typeof alternative === 'object') {
      // Handle nested structure: alternative.value might be an object or string
      if (typeof alternative.value === 'string') {
        componentValue = alternative.value;
      } else if (alternative.value && typeof alternative.value === 'object' && 'value' in alternative.value) {
        // Nested: {label: ..., value: {label: ..., value: "uuid"}}
        componentValue = alternative.value.value;
      } else {
        console.error('Invalid alternative format:', alternative);
        return;
      }
      console.log('Extracted value:', componentValue);
    } else {
      console.error('Invalid alternative format:', alternative);
      return;
    }
    
    if (componentValue) {
      if (rowData.isGroup) {
        const groupKey = `${rowData.component_id}_${rowData.value}`;
        this.components.forEach(comp => {
          const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
          const compKey = `${comp.component || 'unassigned'}_${compValue}`;
          if (compKey === groupKey) {
            this.alternativeComponents.set(comp.id, componentValue);
            this.usedComponents.add(comp.id);
            componentIdsToUpdate.push(comp.id);
          }
        });
      } else {
        this.alternativeComponents.set(rowData.id, componentValue);
        this.usedComponents.add(rowData.id);
        componentIdsToUpdate.push(rowData.id);
      }
      
      // Commit changes to API
      console.log('Updating components with value:', componentValue);
      componentIdsToUpdate.forEach(compId => {
        this.updateRealizationComponent(compId, componentValue);
      });
      
      this.buildTreeNodes();
    }
  }
  
  confirmAlternative(rowData: any): void {
    const componentIdsToUpdate: string[] = [];
    
    if (rowData.isGroup) {
      const groupKey = `${rowData.component_id}_${rowData.value}`;
      this.components.forEach(comp => {
        const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
        const compKey = `${comp.component || 'unassigned'}_${compValue}`;
        if (compKey === groupKey) {
          const pending = this.pendingAlternatives.get(comp.id);
          if (pending && pending.value) {
            this.alternativeComponents.set(comp.id, pending.value);
            this.usedComponents.add(comp.id);
            this.pendingAlternatives.delete(comp.id);
            componentIdsToUpdate.push(comp.id);
          }
        }
      });
    } else {
      const pending = this.pendingAlternatives.get(rowData.id);
      if (pending && pending.value) {
        this.alternativeComponents.set(rowData.id, pending.value);
        this.usedComponents.add(rowData.id);
        this.pendingAlternatives.delete(rowData.id);
        componentIdsToUpdate.push(rowData.id);
      }
    }
    
    // Clear temp selection
    delete rowData.tempSelection;
    
    // Commit changes to API
    componentIdsToUpdate.forEach(compId => {
      const altValue = this.alternativeComponents.get(compId);
      if (altValue) {
        this.updateRealizationComponent(compId, altValue);
      }
    });
    
    this.buildTreeNodes();
    
    this.messageService.add({
      severity: 'success',
      summary: 'Úspěch',
      detail: 'Součástka potvrzena'
    });
  }
  
  cancelAlternative(rowData: any): void {
    if (rowData.isGroup) {
      const groupKey = `${rowData.component_id}_${rowData.value}`;
      this.components.forEach(comp => {
        const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
        const compKey = `${comp.component || 'unassigned'}_${compValue}`;
        if (compKey === groupKey) {
          this.pendingAlternatives.delete(comp.id);
        }
      });
    } else {
      this.pendingAlternatives.delete(rowData.id);
    }
    this.buildTreeNodes();
  }
  
  getPendingAlternative(rowData: any): any {
    if (rowData.isGroup) {
      const groupKey = `${rowData.component_id}_${rowData.value}`;
      const childComponents = this.components.filter(comp => {
        const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
        const compKey = `${comp.component || 'unassigned'}_${compValue}`;
        return compKey === groupKey;
      });
      
      if (childComponents.length === 0) return null;
      
      const firstPending = this.pendingAlternatives.get(childComponents[0].id);
      const allSame = childComponents.every(c => {
        const p = this.pendingAlternatives.get(c.id);
        return p?.value === firstPending?.value;
      });
      
      return allSame ? firstPending : null;
    } else {
      return this.pendingAlternatives.get(rowData.id);
    }
  }

  copyOriginalToUsed(rowData: any): void {
    if (rowData.isGroup) {
      // Copy original to all children in the group
      const groupKey = `${rowData.component_id}_${rowData.value}`;
      this.components.forEach(comp => {
        const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
        const compKey = `${comp.component || 'unassigned'}_${compValue}`;
        if (compKey === groupKey && comp.component) {
          this.alternativeComponents.set(comp.id, comp.component);
          this.usedComponents.add(comp.id);
          // Commit to API
          this.updateRealizationComponent(comp.id, comp.component);
        }
      });
    } else {
      // Copy original to single component
      if (rowData.component_id) {
        this.alternativeComponents.set(rowData.id, rowData.component_id);
        this.usedComponents.add(rowData.id);
        // Commit to API
        this.updateRealizationComponent(rowData.id, rowData.component_id);
      }
    }
    
    // Rebuild tree to show changes
    this.buildTreeNodes();
    
    this.messageService.add({
      severity: 'success',
      summary: 'Úspěch',
      detail: 'Originál použit jako vybraná součástka'
    });
  }

  updateRealizationComponent(componentId: string, usedComponentId: string): void {
    this.productionService.updateRealizationComponent(componentId, {
      component: usedComponentId,
      is_modified: true
    }).subscribe({
      next: () => {
        // Success - silently update
      },
      error: (error) => {
        console.error('Error updating component:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se uložit změnu'
        });
      }
    });
  }

  getAlternativeId(rowData: any): string | null {
    const alt = this.getAlternative(rowData);
    return alt?.value || null;
  }

  getAlternativeName(rowData: any): string {
    const alt = this.getAlternative(rowData);
    return alt?.label || alt?.value || '';
  }

  clearAlternative(rowData: any): void {
    const componentIdsToUpdate: string[] = [];
    
    if (rowData.isGroup) {
      const groupKey = `${rowData.component_id}_${rowData.value}`;
      this.components.forEach(comp => {
        const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
        const compKey = `${comp.component || 'unassigned'}_${compValue}`;
        if (compKey === groupKey) {
          this.alternativeComponents.delete(comp.id);
          this.usedComponents.delete(comp.id);
          componentIdsToUpdate.push(comp.id);
        }
      });
    } else {
      this.alternativeComponents.delete(rowData.id);
      this.usedComponents.delete(rowData.id);
      componentIdsToUpdate.push(rowData.id);
    }
    
    // Clear on server - restore to original component
    componentIdsToUpdate.forEach(compId => {
      const originalComponent = this.originalComponents.get(compId);
      this.productionService.updateRealizationComponent(compId, {
        component: originalComponent || null as any,
        is_modified: false
      }).subscribe({
        next: () => {
          // Success
        },
        error: (error) => {
          console.error('Error clearing component:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Chyba',
            detail: 'Nepodařilo se odebrat součástku'
          });
        }
      });
    });
    
    this.buildTreeNodes();
  }

  getAlternative(rowData: any): any {
    if (rowData.isGroup) {
      // For group, check if all children have the same alternative
      const groupKey = `${rowData.component_id}_${rowData.value}`;
      const childComponents = this.components.filter(comp => {
        const compValue = comp.attributes?.value?._text || comp.attributes?.Value || '';
        const compKey = `${comp.component || 'unassigned'}_${compValue}`;
        return compKey === groupKey;
      });
      
      if (childComponents.length === 0) return null;
      
      const firstAlt = this.alternativeComponents.get(childComponents[0].id);
      const allSame = childComponents.every(c => this.alternativeComponents.get(c.id) === firstAlt);
      
      if (allSame && firstAlt) {
        const found = this.availableComponents.find(ac => ac.value === firstAlt);
        // If not found in availableComponents, show just the ID
        return found || { label: firstAlt, value: firstAlt };
      }
      return null;
    } else {
      const altId = this.alternativeComponents.get(rowData.id);
      console.log('getAlternative for rowData.id:', rowData.id, 'found:', altId, 'all alternatives:', Array.from(this.alternativeComponents.entries()));
      if (altId) {
        const found = this.availableComponents.find(ac => ac.value === altId);
        // If not found in availableComponents, show just the ID
        return found || { label: altId, value: altId };
      }
      return null;
    }
  }

  onBack(): void {
    if (this.realization?.template) {
      this.router.navigate(['/production/template', this.realization.template]);
    } else {
      this.router.navigate(['/production']);
    }
  }

  onComplete(): void {
    if (!this.realizationId) return;

    this.productionService.updateRealization(this.realizationId, {
      status: RealizationStatus.COMPLETED,
      completed_at: new Date()
    }).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Úspěch',
          detail: 'Výroba dokončena'
        });
        this.onBack();
      },
      error: (error) => {
        console.error('Error completing realization:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Chyba',
          detail: 'Nepodařilo se dokončit výrobu'
        });
      }
    });
  }
}
