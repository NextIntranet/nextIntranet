import { Component, OnInit, signal, OnDestroy, inject, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { StoreComponentService } from "./services/store.service";
import { RouterModule, ActivatedRoute, Router, Params } from "@angular/router";
import { ImageModule } from "primeng/image";
import { DataViewModule } from "primeng/dataview";
import { TagModule } from "primeng/tag";
import { ButtonModule } from "primeng/button";
import { PaginatorState } from "primeng/paginator";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { FormsModule } from "@angular/forms";
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from "rxjs";
import { InputTextModule } from "primeng/inputtext";
import { HttpParams } from '@angular/common/http';
import { TreeNode } from 'primeng/api';
import { ScreenService } from 'src/app/shared/services/screen.service';

import { NiCategoryTreeComponent, FilterTreeNode } from "../shared/components/ni-category-tree/ni-category-tree.component";
import { NiLocationTreeSelectComponent } from "../shared/components/ni-location-treeselect/ni-location-treeselect.component";
import { CategoryService } from './services/category.service';
import { AnonymousSubject } from "rxjs/internal/Subject";
import { Subscription } from "rxjs/internal/Subscription";

@Component({
  selector: "app-store",
  templateUrl: "./store.component.html",
  styleUrls: ["./store.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ImageModule,
    DataViewModule,
    TagModule,
    ButtonModule,
    ReactiveFormsModule,
    FormsModule,
    InputTextModule,
    NiCategoryTreeComponent,
    NiLocationTreeSelectComponent,
  ],
})
export class StoreComponent implements OnInit, OnDestroy {
  data: any[] = [];
  components = signal<any[]>([]);
  totalRecords: number = 0;
  firstItem: number = 1;
  Math = Math;

  // Private services for dependency injection
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  public storeComponentService = inject(StoreComponentService);
  private categoryService = inject(CategoryService);
  searchControl = new FormControl("");
  searchTerm = signal<string>("");
  private destroy$ = new Subject<void>();
  categoryTreeData: FilterTreeNode[] = [];
  selectedCategoryIds: string[] = [];
  selectedLocationIds: string[] = [];
  selectedLocationKeys: any[] = [];
  selectedLocationId: string = '';
  selectedLocationKey: any = null;

  @ViewChild(NiCategoryTreeComponent) categoryTreeComponent?: NiCategoryTreeComponent;
  @ViewChild(NiLocationTreeSelectComponent) locationTreeComponent?: NiLocationTreeSelectComponent;

  private urlParamsProcessed = false;
  private categoriesLoaded = false;
  first: number = 0;


  // Mobile state
  isMobile: boolean = false;
  private subscription: Subscription | undefined;

  constructor(
    private screenService: ScreenService
  ) { }

  ngOnInit(): void {
    this.setupSearch();

    // Subscribe to isMobile state
    this.subscription = this.screenService.isMobile$.subscribe(
      (isMobile) => (this.isMobile = isMobile)
    );

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      console.log('Processing URL Parameters:', params);
      this.parseUrlParams(params);

      if (!this.urlParamsProcessed) {
        this.processUrlParameters(params);
      } else {
        this.updateComponentStateFromParams(params);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((value) => {

        console.log("[setupSearch] Search term changed:", value);

        this.searchTerm.set(value || "");
        this.storeComponentService.page = 1;

        this.updateUrl();
        this.loadComponents(1);

      });
  }

  updateComponentStateFromParams(params: any): void {
    if (params['page']) {
      this.storeComponentService.page = Number(params['page']) || 1;
    }

    if (params['page_size']) {
      this.storeComponentService.pageSize = Number(params['page_size']) || 10;
    }

    if (params['search']) {
      this.searchTerm.set(params['search'] || '');
    }

    if (params['categories']) {
      const categoryIds = params['categories'].split(',').filter((id: string) => id);
      this.selectedCategoryIds = categoryIds;
      this.storeComponentService.selectedCategoryIds = categoryIds;

      if (this.categoryTreeComponent && this.categoriesLoaded) {
        console.log('Applying selected categories from URL:', categoryIds);
        setTimeout(() => {
          this.categoryTreeComponent?.setSelectedIds(categoryIds);
        }, 0);
      }
    }

    if (params['locations']) {
      const locationId = params['locations'];
      this.selectedLocationId = locationId;
      this.storeComponentService.selectedLocationIds = [locationId];

      if (this.locationTreeComponent) {
        console.log('Applying selected location from URL:', locationId);
        setTimeout(() => {
          this.locationTreeComponent?.setSelectedLocations(locationId);
        }, 0);
      }
    }

    // Load categories only if they haven't been loaded yet
    if (!this.categoriesLoaded) {
      this.loadCategories().then(() => {
        this.categoriesLoaded = true;
        this.loadComponents(
          this.storeComponentService.page,
          this.storeComponentService.pageSize
        );
      });
    } else {
      // If categories already loaded, just load components with current filters
      this.loadComponents(
        this.storeComponentService.page,
        this.storeComponentService.pageSize
      );
    }
  }

  // Modify the processUrlParameters method
  processUrlParameters(params: any): void {
    // Parse all parameters from URL
    if (params) {
      // Handle page and page_size
      const page = params['page'] ? parseInt(params['page'], 10) : 1;
      const pageSize = params['page_size'] ? parseInt(params['page_size'], 10) : 10;

      // Update service with these values
      this.storeComponentService.page = page;
      this.storeComponentService.pageSize = pageSize;

      // Calculate first item index for pagination
      this.first = (page - 1) * pageSize;

      // Handle search term
      if (params['search']) {
        this.searchControl.setValue(params['search'], { emitEvent: false });
        this.searchTerm.set(params['search']);
      }

      // Handle categories
      if (params['categories']) {
        const categoryIds = params['categories'].split(',').filter((id: string) => id);
        this.selectedCategoryIds = categoryIds;
        this.storeComponentService.selectedCategoryIds = categoryIds;
      }

      if (params['locations']) {
        const locationId = params['locations'];
        this.selectedLocationId = locationId;
        // Fix: Use selectedLocationIds (plural) instead of selectedLocationId
        this.storeComponentService.selectedLocationIds = [locationId];

        if (this.locationTreeComponent) {
          this.selectedLocationKey = this.getLocationNodesByIds(locationId);
          this.locationTreeComponent.setSelectedLocations(locationId);
        }
      }
    }

    this.urlParamsProcessed = true;

    // Load categories only once during initialization
    this.loadCategories().then(() => {
      this.categoriesLoaded = true; // Mark categories as loaded
      console.log("LOAD CATEGORIES...");
      this.loadComponents(
        this.storeComponentService.page,
        this.storeComponentService.pageSize
      );
    });
  }

  loadComponents = (
    page: number = 1,
    pageSize: number = 10,
  ): void => {

    if (this.urlParamsProcessed) {
      page = this.storeComponentService.page;
      pageSize = this.storeComponentService.pageSize;
    }

    // Calculate first item for pagination display
    this.first = (page - 1) * pageSize;

    console.log(
      "Loading components - Page:",
      page,
      "Size:",
      pageSize,
      "Search:",
      this.searchTerm(),
      "Categories:",
      this.selectedCategoryIds
    );

    // Update the service values for consistency
    this.storeComponentService.page = page;
    this.storeComponentService.pageSize = pageSize;

    this.storeComponentService
      .loadComponents(
        page,
        pageSize,
        this.searchTerm(),
        this.selectedCategoryIds,
        [this.selectedLocationId]
      )
      .subscribe({
        next: (response) => {
          this.data = response.results;
          this.components.set(response.results);
          this.totalRecords = response.total_count;

          console.log("Loaging components: page", page, "size", pageSize);
          console.log("Components loaded:", this.components().length, "Total:", this.totalRecords);
        },
        error: (error) => {
          console.error("Error loading components:", error);
        },
      });
  }

  // Modify the loadCategories method to ensure selected categories are applied correctly
  loadCategories = (): Promise<void> => {
    // Only load categories if they haven't been loaded yet or if we explicitly need a refresh
    if (this.categoriesLoaded && this.categoryTreeData.length > 0) {
      console.log('Categories already loaded, skipping request');

      // Even when skipping reload, make sure selected categories are applied
      if (this.selectedCategoryIds && this.selectedCategoryIds.length > 0 && this.categoryTreeComponent) {
        console.log('Re-applying selected categories:', this.selectedCategoryIds);
        setTimeout(() => {
          this.categoryTreeComponent?.setSelectedIds(this.selectedCategoryIds);
        }, 0);
      }

      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.categoryService.getCategoryTree().subscribe({
        next: (data : any) => {
          this.categoryTreeData = data;
          this.categoriesLoaded = true; // Mark as loaded

          // If we have selected categories, ensure they're set on the tree after it's loaded
          if (this.selectedCategoryIds && this.selectedCategoryIds.length > 0) {
            console.log('Setting selected categories:', this.selectedCategoryIds);

            // Need to use setTimeout to ensure the tree component has rendered
            setTimeout(() => {
              // Try to update the tree component if available
              if (this.categoryTreeComponent) {
                this.categoryTreeComponent.setSelectedIds(this.selectedCategoryIds);
              }

              // if (this.locationTreeComponent) {
              //   this.locationTreeComponent.setSelectedIds(this.selectedLocationIds);
              // }

            }, 100);
          }

          resolve();
        },
        error: (error: any) => {
          console.error('Error loading categories', error);
          resolve(); // Resolve anyway to continue loading
        }
      });
    });
  }

  onCategoryFilterChanged = (selectedIds: string[]): void => {
    this.selectedCategoryIds = selectedIds;
    this.storeComponentService.selectedCategoryIds = selectedIds;
    this.storeComponentService.page = 1;
    this.updateUrl();
    console.log("Selected category IDs:", selectedIds);
    this.loadComponents(1);
  }

  onLocationFilterChanged = (selectedNode: any): void => {
    console.log("[onLocationFilterChanged] Selected location node:", selectedNode);
    this.selectedLocationKey = selectedNode;
    this.selectedLocationId = selectedNode ? selectedNode.id : '';
    this.updateUrl();
    console.log("Selected location ID:", this.selectedLocationId);
    this.loadComponents(1);
  }

  onPageChange = (event: PaginatorState): void => {
    console.log("Page change event:", event);
    // Calculate page number based on first and rows
    const rows = event.rows || 10;
    const first = event.first || 0;

    // Calculate the page (1-based) from the first record index
    const page = Math.floor(first / rows) + 1;

    console.log(`Changing to page ${page} (first: ${first}, rows: ${rows})`);
    this.storeComponentService.page = page;
    this.storeComponentService.pageSize = rows;
    this.updateUrl();
    console.log("Loading components... onPageChange");
    this.loadComponents(page, rows);
  }
  updateUrl = (): void => {
    if (!this.router || !this.route) {
      console.error("Router or ActivatedRoute is undefined");
      return;
    }

    // Get current query parameters
    const currentParams = this.route.snapshot.queryParams;

    // Only include non-empty parameters
    const queryParams: any = {};

    console.log("Current URL parameters:", currentParams);
    console.log("ServicePage:", this.storeComponentService.page, "ServicePageSize:", this.storeComponentService.pageSize);
    console.log("CurrentPage:", currentParams['page'], "CurrentPageSize:", currentParams['page_size']);

    if (this.storeComponentService.page !== 1 || currentParams['page']) {
      queryParams.page = this.storeComponentService.page;
    }

    if (this.storeComponentService.pageSize !== 10 || currentParams['page_size']) {
      queryParams.page_size = this.storeComponentService.pageSize;
    }

    if (this.searchTerm() || currentParams['search']) {
      queryParams.search = this.searchTerm();
    }

    if (this.selectedCategoryIds.length > 0 || currentParams['categories']) {
      queryParams.categories = this.selectedCategoryIds.join(',');
    }

    if (this.selectedLocationId) {
      queryParams.locations = this.selectedLocationId;
    } else if (currentParams['locations']) {
      queryParams.locations = null; // Remove from URL if cleared
    }

    try {
      // Use replaceUrl to avoid adding to history
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: false
      });
      console.log("Navigation updated with URL parameters:", queryParams);
    } catch (error) {
      console.error("Navigation error:", error);
    }
  }

  parseUrlParams = (params: Params): void => {
    console.log('Parsing URL parameters:', params);

    if (params['page']) {
      this.storeComponentService.page = Number(params['page']) || 1;
    }

    if (params['page_size']) {
      this.storeComponentService.pageSize = Number(params['page_size']) || 10;
    }

    if (params['categories']) {
      const categoriesStr = params['categories'] || '';
      if (categoriesStr) {
        this.selectedCategoryIds = categoriesStr.split(',').filter((id: string) => id);
      }
    }

    if (params['search']) {
      this.searchTerm.set(params['search'] || '');
    }
  }

  getSeverity = (item: any): string => {
    switch (item.inventoryStatus) {
      case "INSTOCK":
        return "success";
      case "LOWSTOCK":
        return "warning";
      case "OUTOFSTOCK":
        return "danger";
      default:
        return "";
    }
  }

  deleteComponent = (id: number): void => {
    console.log(`Delete component with id ${id}`);
    // Implement the delete logic here
  }

  getLocationNodesByIds(id: string): any {
    return this.locationTreeComponent?.locations.find(node => node.id === id);
  }
}
