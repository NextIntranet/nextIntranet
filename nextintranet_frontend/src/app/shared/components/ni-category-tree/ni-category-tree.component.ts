import { Component, EventEmitter, Input, OnInit, Output, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { ChipModule } from 'primeng/chip';
import { TreeNode } from 'primeng/api';
import { TreeModule } from 'primeng/tree';
import { CategoryService } from 'src/app/store/services/category.service';

export interface FilterTreeNode extends TreeNode {
  id: string;
  label: string;
  children?: FilterTreeNode[];
  selectable?: boolean;
}

@Component({
  selector: 'ni-categoryTree',
  templateUrl:'./ni-category-tree.component.html',
  styleUrls: ['./ni-category-tree.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TreeModule,
    CheckboxModule,
    ChipModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})

export class NiCategoryTreeComponent implements OnInit {
  @Input() treeData: any[] = [];
  @Input() placeholder: string = 'Vyberte položky...';
  @Output() selectedIdsChanged = new EventEmitter<string[]>();

  selectedNodes: any[] = [];
  expanded: { [key: string]: boolean } = {};

  constructor(private categoryService: CategoryService) { }

  ngOnInit(): void {
    if (!this.treeData || this.treeData.length === 0) {
      this.categoryService.getCategoryTree().subscribe(data => {
        this.treeData = data;
        this.initializeTree();
      });
    } else {
      this.initializeTree();
    }
  }

  private initializeTree(): void {
    if (this.treeData && this.treeData.length > 0) {
      this.treeData.forEach(node => {
        if (node.key) {
          this.expanded[node.key] = true;
        }
      });
    }
  }

  onSelectionChange(): void {
    const selectedIds = this.extractSelectedIds(this.selectedNodes);
    this.selectedIdsChanged.emit(selectedIds);
  }

  private extractSelectedIds(nodes: FilterTreeNode[]): string[] {
    return nodes.map(node => node.id);
  }

  isNodeSelected(node: FilterTreeNode): boolean {
    return this.selectedNodes.some(selectedNode => selectedNode.id === node.id);
  }

  setSelectedIds(ids: string[]): void {
    if (!ids || !this.treeData) return;

    this.selectedNodes = [];

    // Function to find nodes by IDs recursively
    const findNodesById = (nodes: FilterTreeNode[], targetIds: string[]): FilterTreeNode[] => {
      if (!nodes) return [];

      let result: FilterTreeNode[] = [];

      for (const node of nodes) {
        if (targetIds.includes(node.id)) {
          result.push(node);
        }

        if (node.children && node.children.length > 0) {
          result = [...result, ...findNodesById(node.children, targetIds)];
        }
      }

      return result;
    };

    // Find and set the nodes that match the provided IDs
    this.selectedNodes = findNodesById(this.treeData, ids);

    console.log('Tree nodes set as selected:', this.selectedNodes.map(n => n.label || n.name));
  }
}
