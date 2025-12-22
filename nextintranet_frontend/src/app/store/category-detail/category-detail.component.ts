import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { CategoryService } from '../services/category.service';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ColorPickerModule } from 'primeng/colorpicker';
import { MessageService } from 'primeng/api';
import { CategoryIconComponent } from '../../shared/components/category-icon/category-icon.component';

@Component({
  selector: 'app-category-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ButtonModule,
    CardModule,
    InputTextModule,
    ToastModule,
    ProgressSpinnerModule,
    ColorPickerModule,
    CategoryIconComponent
  ],
  providers: [MessageService],
  templateUrl: './category-detail.component.html',
  styleUrl: './category-detail.component.css'
})
export class CategoryDetailComponent implements OnInit {
  category: any = null;
  loading = true;
  editMode = false;
  editedCategory: any = {};

  constructor(
    private route: ActivatedRoute,
    private categoryService: CategoryService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    // Subscribe to route param changes to reload when navigating between categories
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadCategory(id);
      }
    });
  }

  loadCategory(id: string) {
    this.loading = true;
    this.categoryService.getCategoryById(id).subscribe({
      next: (data) => {
        console.log('Category data:', data);
        this.category = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Category load error:', err);
        this.loading = false;
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to load category: ${err.message || err.statusText}`
        });
      }
    });
  }

  toggleEditMode() {
    this.editMode = true;
    this.editedCategory = { ...this.category };
  }

  cancelEdit() {
    this.editMode = false;
    this.editedCategory = {};
  }

  slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')                   // Normalize to decomposed form
      .replace(/[\u0300-\u036f]/g, '')    // Remove diacritics
      .replace(/[^a-z0-9]+/g, '-')        // Replace non-alphanumeric with hyphens
      .replace(/^-+|-+$/g, '')            // Remove leading/trailing hyphens
      .replace(/-+/g, '-');               // Replace multiple hyphens with single
  }

  saveChanges() {
    console.log('Saving category:', this.category.id, this.editedCategory);
    
    if (!this.category || !this.category.id) {
      console.error('No category or category ID');
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Invalid category data'
      });
      return;
    }
    
    // Clean up the data - remove fields that shouldn't be sent or are invalid
    const dataToSend = { ...this.editedCategory };
    
    // Convert abbreviation to valid slug (required field)
    if (!dataToSend.abbreviation || dataToSend.abbreviation === '' || dataToSend.abbreviation === null || dataToSend.abbreviation === undefined) {
      // Generate from name if empty
      dataToSend.abbreviation = this.slugify(dataToSend.name || 'category');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(dataToSend.abbreviation)) {
      // Convert invalid characters to valid slug
      dataToSend.abbreviation = this.slugify(dataToSend.abbreviation);
    }
    
    // Remove all read-only fields that backend returns but shouldn't be updated
    delete dataToSend.id;
    delete dataToSend.children;
    delete dataToSend.full_path;
    delete dataToSend.level;
    delete dataToSend.lft;
    delete dataToSend.rght;
    delete dataToSend.tree_id;
    delete dataToSend.created_at;
    delete dataToSend.updated_at;
    
    console.log('Data to send:', dataToSend);
    
    this.categoryService.updateCategory(this.category.id, dataToSend).subscribe({
      next: (data) => {
        console.log('Category updated:', data);
        this.category = data;
        this.editMode = false;
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Category updated successfully'
        });
      },
      error: (err) => {
        console.error('Failed to update category:', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to update category: ${err.message || err.statusText}`
        });
      }
    });
  }
}
