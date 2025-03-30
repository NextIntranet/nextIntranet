import { Component, OnInit } from '@angular/core';
import { CategoryService } from '../services/category.service';
import { inject } from '@angular/core';

import { NiCategoryTreeComponent } from 'src/app/shared/components/ni-category-tree/ni-category-tree.component';

// PrimeNG imports
import { DataViewModule } from 'primeng/dataview';
import { ButtonModule } from 'primeng/button';




@Component({
  selector: 'app-categories-list',
  templateUrl: './categoriesList.component.html',
  styleUrls: ['./categoriesList.component.css'],
  imports: [
    DataViewModule,
    ButtonModule,
    NiCategoryTreeComponent
  ]
})
export class CategoriesListComponent implements OnInit {
  categories: any[] = [];
  selectedCategory: any | null = null;

  categoryService = inject(CategoryService);

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.categoryService.getCategories().subscribe((data: any[]) => {
      console.log(data);
      this.categories = data;
    });
  }

  onSelectCategory(category: any): void {
    this.selectedCategory = category;
  }
}
