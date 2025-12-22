import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CategoryService } from '../services/category.service';
import { CategoryIconComponent } from '../../shared/components/category-icon/category-icon.component';
import { TreeModule } from 'primeng/tree';
import { TreeTableModule } from 'primeng/treetable';
import { TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ColorPickerModule } from 'primeng/colorpicker';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-categories-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TreeModule,
    TreeTableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    ToastModule,
    TooltipModule,
    ColorPickerModule,
    CategoryIconComponent
  ],
  providers: [MessageService],
  templateUrl: './categoriesList.component.html',
  styleUrls: ['./categoriesList.component.css']
})
export class CategoriesListComponent implements OnInit {
  categories: TreeNode[] = [];
  filteredCategories: TreeNode[] = [];
  selectedCategory: TreeNode | null = null;
  displayDialog = false;
  filterText: string = '';
  categoryData: any = {
    name: '',
    description: '',
    parent: null,
    icon: '',
    color: ''
  };
  isEditMode = false;

  constructor(
    private categoryService: CategoryService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getCategoryTree().subscribe({
      next: (data: any) => {
        this.categories = this.transformToTreeNodes(data);
        this.filteredCategories = [...this.categories];
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load categories'
        });
      }
    });
  }

  transformToTreeNodes(data: any[], level: number = 0): TreeNode[] {
    return data.map(item => ({
      label: item.name,
      data: item,
      children: item.children ? this.transformToTreeNodes(item.children, level + 1) : [],
      expanded: level === 0
    }));
  }

  openNewDialog() {
    this.isEditMode = false;
    this.categoryData = {
      name: '',
      description: '',
      parent: this.selectedCategory?.data?.id || null,
      icon: '',
      color: ''
    };
    this.displayDialog = true;
  }

  openEditDialog() {
    if (!this.selectedCategory) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a category first'
      });
      return;
    }
    this.isEditMode = true;
    this.categoryData = {
      ...this.selectedCategory.data
    };
    this.displayDialog = true;
  }

  slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');
  }

  saveCategory() {
    // Prepare data and clean up
    const dataToSend = { ...this.categoryData };
    
    // Ensure abbreviation is valid slug
    if (!dataToSend.abbreviation || dataToSend.abbreviation === '' || !/^[a-zA-Z0-9_-]+$/.test(dataToSend.abbreviation)) {
      dataToSend.abbreviation = this.slugify(dataToSend.name || 'category');
    }
    
    // Remove read-only fields
    delete dataToSend.id;
    delete dataToSend.children;
    delete dataToSend.full_path;
    delete dataToSend.level;
    delete dataToSend.lft;
    delete dataToSend.rght;
    delete dataToSend.tree_id;
    delete dataToSend.created_at;
    delete dataToSend.updated_at;
    
    if (this.isEditMode) {
      this.categoryService.updateCategory(this.categoryData.id, dataToSend).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Category updated'
          });
          this.displayDialog = false;
          this.loadCategories();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update category'
          });
        }
      });
    } else {
      this.categoryService.createCategory(dataToSend).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Category created'
          });
          this.displayDialog = false;
          this.loadCategories();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to create category'
          });
        }
      });
    }
  }

  deleteCategory() {
    if (!this.selectedCategory) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please select a category first'
      });
      return;
    }

    if (confirm('Are you sure you want to delete this category?')) {
      this.categoryService.deleteCategory(this.selectedCategory.data.id).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Category deleted'
          });
          this.selectedCategory = null;
          this.loadCategories();
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete category'
          });
        }
      });
    }
  }

  onNodeSelect(event: any) {
    this.selectedCategory = event.node;
  }

  filterTree() {
    if (!this.filterText) {
      this.filteredCategories = [...this.categories];
      return;
    }

    const filterLower = this.filterText.toLowerCase();
    this.filteredCategories = this.filterNodes(this.categories, filterLower);
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
          expanded: filteredChildren.length > 0
        });
      }
      return filtered;
    }, []);
  }

  expandAll() {
    this.filteredCategories = this.expandNodes(this.filteredCategories, true);
  }

  collapseAll() {
    this.filteredCategories = this.expandNodes(this.filteredCategories, false);
  }

  expandNodes(nodes: TreeNode[], expanded: boolean): TreeNode[] {
    return nodes.map(node => ({
      ...node,
      expanded: expanded,
      children: node.children ? this.expandNodes(node.children, expanded) : []
    }));
  }
}
