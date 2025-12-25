import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { apiFetch } from '@nextintranet/core';
import { Link, useSearchParams } from 'react-router-dom';
import { LocationParentSelect } from '@/components/LocationParentSelect';
import { TreeFilter } from '@/components/TreeFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Filter, LayoutGrid, List, Table as TableIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PriceLabel } from '@/components/PriceLabel';

interface Component {
  id: number;
  name: string;
  description: string;
  primary_image_url?: string;
  category?: {
    id: number;
    name: string;
  };
  inventory_summary: {
    total_quantity: number;
    reserved_quantity: number;
    purchase_quantity: number;
  };
  internal_price?: number;
  selling_price?: number;
  currency?: string;
}

interface PaginatedResponse {
  total_count: number;
  total_pages: number;
  current_page: number;
  results: Component[];
}

interface Category {
  id: string;
  name: string;
  parent?: string | null;
  children?: Category[];
}

interface Location {
  id: string;
  name: string;
  parent?: string | null;
  full_path: string;
  children?: Location[];
}

interface PaginatedCategories {
  results: Category[];
}

interface PaginatedLocations {
  results: Location[];
}

interface User {
  is_superuser: boolean;
  access_permissions: Array<{
    area: string;
    level: string;
  }>;
}

const STORAGE_KEYS = {
  VIEW_MODE: 'store_view_mode',
  PAGE_SIZE: 'store_page_size',
};

const SectionDivider = ({ className }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={cn(
      "h-px w-full bg-border opacity-0 transition-opacity duration-300",
      "group-hover:opacity-60 group-focus-within:opacity-60",
      className
    )}
  />
);

const findCategoryNode = (nodes: Category[], targetId: string): Category | null => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    if (node.children?.length) {
      const match = findCategoryNode(node.children, targetId);
      if (match) {
        return match;
      }
    }
  }
  return null;
};

const collectCategoryIds = (node: Category): string[] => {
  const ids = [node.id];
  node.children?.forEach((child) => {
    ids.push(...collectCategoryIds(child));
  });
  return ids;
};

export function StorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [pageSize, setPageSize] = useState(() => {
    const urlPageSize = searchParams.get('page_size');
    if (urlPageSize) return Number(urlPageSize);
    const saved = localStorage.getItem(STORAGE_KEYS.PAGE_SIZE);
    return saved ? Number(saved) : 12;
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
    return saved === 'grid' || saved === 'list' || saved === 'table' ? saved : 'grid';
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    const cats = searchParams.get('categories');
    return cats ? cats.split(',') : [];
  });
  const [selectedLocation, setSelectedLocation] = useState<string | null>(
    searchParams.get('locations') || searchParams.get('location') || null
  );

  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    category: '',
    unit_type: 'int',
  });

  // Update URL when filters change
  useEffect(() => {
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (page !== 1) params.page = page.toString();
    if (pageSize !== 12) params.page_size = pageSize.toString();
    if (selectedCategories.length > 0) params.categories = selectedCategories.join(',');
    if (selectedLocation) params.locations = selectedLocation;
    
    setSearchParams(params, { replace: true });
  }, [search, page, pageSize, selectedCategories, selectedLocation]);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PAGE_SIZE, pageSize.toString());
  }, [pageSize]);

  // Fetch categories
  const { data: categoriesData } = useQuery<Category[] | PaginatedCategories>({
    queryKey: ['categories'],
    queryFn: () =>
      apiFetch<Category[] | PaginatedCategories>('/api/v1/store/category/?page_size=1000'),
  });
  const categories = Array.isArray(categoriesData) ? categoriesData : categoriesData?.results || [];

  // Fetch locations
  const { data: locationsData } = useQuery<Location[] | PaginatedLocations>({
    queryKey: ['locations'],
    queryFn: () =>
      apiFetch<Location[] | PaginatedLocations>('/api/v1/store/locations/?page_size=1000'),
  });
  const locations = Array.isArray(locationsData) ? locationsData : locationsData?.results || [];

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/v1/me/'),
  });

  const { data, isLoading, error } = useQuery<PaginatedResponse>({
    queryKey: ['components', search, page, pageSize, selectedCategories, selectedLocation],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        ...(search && { search }),
        ...(selectedCategories.length > 0 && { categories: selectedCategories.join(',') }),
        ...(selectedLocation && { locations: selectedLocation }),
      });
      return apiFetch<PaginatedResponse>(`/api/v1/store/components/?${params}`);
    },
  });

  const canCreate =
    user?.is_superuser ||
    user?.access_permissions?.some(
      (permission) => permission.area === 'warehouse' && ['write', 'admin'].includes(permission.level)
    );

  const createMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      description?: string | null;
      category: string;
      tags: string[];
      unit_type: string;
    }) =>
      apiFetch('/api/v1/store/components/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] });
      setCreateOpen(false);
      setCreateForm({ name: '', description: '', category: '', unit_type: 'int' });
      toast.success('Component created.');
    },
    onError: () => {
      toast.error('Failed to create component.');
    },
  });

  const handleCreate = () => {
    if (!createForm.name.trim() || !createForm.category) {
      return;
    }
    createMutation.mutate({
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
      category: createForm.category,
      tags: [],
      unit_type: createForm.unit_type,
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const buildCategoryTree = (cats: Category[], parentId?: string | null): Category[] => {
    return cats
      .filter(cat => (parentId === undefined || parentId === null) ? (cat.parent === null || cat.parent === undefined) : cat.parent === parentId)
      .map(cat => ({
        ...cat,
        children: buildCategoryTree(cats, cat.id),
      }));
  };

  const buildLocationTree = (locs: Location[], parentId?: string | null): Location[] => {
    return locs
      .filter(loc => (parentId === undefined || parentId === null) ? (loc.parent === null || loc.parent === undefined) : loc.parent === parentId)
      .map(loc => ({
        ...loc,
        children: buildLocationTree(locs, loc.id),
      }));
  };

  const categoryTree = useMemo(
    () => (categories ? buildCategoryTree(categories) : []),
    [categories]
  );
  const locationTree = useMemo(
    () => (locations ? buildLocationTree(locations) : []),
    [locations]
  );

  const toggleCategory = (categoryId: string) => {
    const targetNode = findCategoryNode(categoryTree, categoryId);
    const affectedIds = targetNode ? collectCategoryIds(targetNode) : [categoryId];

    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const shouldClear = affectedIds.every((id) => next.has(id));
      if (shouldClear) {
        affectedIds.forEach((id) => next.delete(id));
      } else {
        affectedIds.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
    setPage(1);
  };

  const handleLocationSelect = (locationId: string | null) => {
    setSelectedLocation(locationId);
    setPage(1);
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setPage(1);
  };

  const handlePageInput = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const pageNum = Number(formData.get('page'));
    if (pageNum >= 1 && pageNum <= totalPages) {
      setPage(pageNum);
    }
  };

  const totalPages = data?.total_pages || 1;
  const pageNumbers = [];
  const maxVisible = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  const pageButtonClass = (active?: boolean, disabled?: boolean) =>
    cn(
      "flex h-9 min-w-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition",
      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active && "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
      disabled && "cursor-not-allowed opacity-60 hover:bg-background hover:text-foreground"
    );

  const filtersContent = (
    <div className="group flex flex-col gap-4 rounded-lg bg-background/60 p-3 text-sm">
      <div className="flex flex-col gap-2">
        <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Search
        </p>
        <Input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={handleSearchChange}
          className="h-9"
        />
      </div>

      <SectionDivider />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Categories
          </p>
          {selectedCategories.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setSelectedCategories([])
                setPage(1)
              }}
            >
              Clear ({selectedCategories.length})
            </Button>
          )}
        </div>
        <div className="rounded-md">
          {categories && categories.length > 0 ? (
            <TreeFilter
              data={categoryTree}
              multiSelect
              selectedIds={selectedCategories}
              onToggle={toggleCategory}
              showCheckbox
            />
          ) : (
            <div className="text-sm text-muted-foreground">No categories</div>
          )}
        </div>
      </div>

      <SectionDivider />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="mb-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Locations
          </p>
          {selectedLocation && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => {
                setSelectedLocation(null)
                setPage(1)
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="rounded-md">
          {locations && locations.length > 0 ? (
            <LocationParentSelect
              locations={locationTree}
              value={selectedLocation}
              onChange={handleLocationSelect}
              emptyLabel="All locations"
              placeholder="All locations"
            />
          ) : (
            <div className="text-sm text-muted-foreground">No locations</div>
          )}
        </div>
      </div>
    </div>
  );

  const [sorting, setSorting] = useState<SortingState>([]);

  const tableColumns = useMemo<ColumnDef<Component>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 text-left text-[13px] font-semibold text-muted-foreground"
            onClick={column.getToggleSortingHandler()}
          >
            Name
            <span className="text-xs">{column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}</span>
          </button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <Link
              to={`/store/component/${row.original.id}`}
              className="font-semibold text-foreground hover:underline"
            >
              {row.original.name}
            </Link>
            <span className="text-xs text-muted-foreground line-clamp-1">
              {row.original.description}
            </span>
          </div>
        ),
      },
      {
        id: 'category',
        accessorFn: (row) => row.category?.name || '',
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 text-left text-[13px] font-semibold text-muted-foreground"
            onClick={column.getToggleSortingHandler()}
          >
            Category
            <span className="text-xs">{column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}</span>
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.category?.name || '—'}
          </span>
        ),
      },
      {
        id: 'inventory',
        accessorFn: (row) => row.inventory_summary?.total_quantity ?? 0,
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 text-left text-[13px] font-semibold text-muted-foreground"
            onClick={column.getToggleSortingHandler()}
          >
            Inventory
            <span className="text-xs">{column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}</span>
          </button>
        ),
        cell: ({ row }) => {
          const inv = row.original.inventory_summary;
          return (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                📦 {inv.total_quantity}
              </span>
              <span className="flex items-center gap-1">
                🔒 {inv.reserved_quantity}
              </span>
              <span className="flex items-center gap-1">
                🛒 {inv.purchase_quantity}
              </span>
            </div>
          );
        },
      },
      {
        id: 'price',
        accessorFn: (row) => row.selling_price ?? 0,
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 text-left text-[13px] font-semibold text-muted-foreground"
            onClick={column.getToggleSortingHandler()}
          >
            Price
            <span className="text-xs">{column.getIsSorted() === 'asc' ? '↑' : column.getIsSorted() === 'desc' ? '↓' : ''}</span>
          </button>
        ),
        cell: ({ row }) =>
          row.original.selling_price ? (
            <PriceLabel
              value={row.original.selling_price}
              currency={row.original.currency || 'CZK'}
              className="font-semibold text-primary"
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: data?.results || [],
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
        Error loading components
      </div>
    );
  }

  return (
    <>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="left"
          className="w-full max-w-full p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="p-4">{filtersContent}</div>
        </SheetContent>
      </Sheet>

      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-10 pt-4 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="hidden w-full max-w-xs shrink-0 lg:sticky lg:top-20 lg:block lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="group flex flex-col gap-1 pb-3">
              <h1 className="text-2xl font-semibold text-foreground">Store</h1>
              <div className="text-sm text-muted-foreground">
                {data?.total_count || 0} components
              </div>
              <SectionDivider className="mt-1" />
            </div>
            {filtersContent}
          </div>

          <div className="flex-1 space-y-3">
            <div className="group flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between lg:hidden">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Store</h1>
                <div className="text-sm text-muted-foreground">
                  {data?.total_count || 0} components
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setFiltersOpen(true)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
              </div>
              <SectionDivider />
            </div>

            <div className="group flex flex-col gap-2 px-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  View
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setViewMode('grid')}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setViewMode('table')}
                    aria-label="Table view"
                  >
                    <TableIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {canCreate && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                >
                  New component
                </Button>
              )}
              <div className="flex items-center gap-2 sm:justify-end">
                <label
                  className="text-sm text-muted-foreground"
                  htmlFor="page-size"
                >
                  Page size
                </label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={handlePageSizeChange}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={6}>6 per page</option>
                  <option value={12}>12 per page</option>
                  <option value={24}>24 per page</option>
                  <option value={48}>48 per page</option>
                </select>
              </div>
              <SectionDivider className="mt-1" />
            </div>

            {isLoading ? (
              <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : (
              <>
                {viewMode === 'grid' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data?.results.map((component) => (
                      <Link
                        key={component.id}
                        to={`/store/component/${component.id}`}
                        className="group block h-full no-underline"
                      >
                        <Card className="flex h-full min-h-[360px] flex-col overflow-hidden border-border/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                          {component.primary_image_url ? (
                            <img
                              src={component.primary_image_url}
                              alt={component.name}
                              className="h-44 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-44 w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                              No Image
                            </div>
                          )}
                          <CardContent className="flex flex-1 flex-col gap-3 p-3">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="line-clamp-2 text-base font-semibold text-foreground group-hover:line-clamp-none">
                                  {component.name}
                                </h3>
                                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {component.category?.name ?? 'Uncategorized'}
                                </span>
                              </div>
                              <p className="line-clamp-3 text-sm text-muted-foreground group-hover:line-clamp-none">
                                {component.description}
                              </p>
                            </div>
                            <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  📦 {component.inventory_summary.total_quantity}
                                </span>
                                <span className="text-muted-foreground/70">/</span>
                                <span className="flex items-center gap-1">
                                  🔒 {component.inventory_summary.reserved_quantity}
                                </span>
                                <span className="text-muted-foreground/70">/</span>
                                <span className="flex items-center gap-1">
                                  🛒 {component.inventory_summary.purchase_quantity}
                                </span>
                              </div>
                              {component.selling_price && (
                                <PriceLabel
                                  value={component.selling_price}
                                  currency={component.currency || 'CZK'}
                                  className="text-sm font-semibold text-primary"
                                />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}

                {viewMode === 'list' && (
                  <div className="space-y-3">
                    {data?.results.map((component) => (
                      <Link
                        key={component.id}
                        to={`/store/component/${component.id}`}
                        className="no-underline"
                      >
                        <Card className="overflow-hidden border-border/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                          <CardContent className="flex flex-col gap-4 p-3 sm:flex-row sm:items-start">
                            {component.primary_image_url ? (
                              <img
                                src={component.primary_image_url}
                                alt={component.name}
                                className="h-28 w-28 rounded-md object-cover sm:h-32 sm:w-32"
                              />
                            ) : (
                              <div className="flex h-28 w-28 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground sm:h-32 sm:w-32">
                                No Image
                              </div>
                            )}
                            <div className="flex flex-1 flex-col gap-2">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <h3 className="text-base font-semibold text-foreground">
                                  {component.name}
                                </h3>
                                {component.selling_price && (
                                  <PriceLabel
                                    value={component.selling_price}
                                    currency={component.currency || 'CZK'}
                                    className="text-sm font-semibold text-primary"
                                  />
                                )}
                              </div>
                              <p className="line-clamp-2 text-sm text-muted-foreground">
                                {component.description}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  📦 {component.inventory_summary.total_quantity}
                                </span>
                                <span className="text-muted-foreground/70">/</span>
                                <span className="flex items-center gap-1">
                                  🔒 {component.inventory_summary.reserved_quantity}
                                </span>
                                <span className="text-muted-foreground/70">/</span>
                                <span className="flex items-center gap-1">
                                  🛒 {component.inventory_summary.purchase_quantity}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}

                {viewMode === 'table' && (
                  <div className="rounded-lg border border-border/70 bg-card shadow-sm">
                    <Table>
                      <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <TableHead key={header.id}>
                                {header.isPlaceholder
                                  ? null
                                  : flexRender(
                                      header.column.columnDef.header,
                                      header.getContext()
                                    )}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {table.getRowModel().rows.length ? (
                          table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id}>
                              {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={table.getAllColumns().length}
                              className="h-24 text-center text-sm text-muted-foreground"
                            >
                              No results
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      onClick={() => setPage(1)}
                      disabled={page === 1}
                      className={pageButtonClass(false, page === 1)}
                      title="First page"
                    >
                      «
                    </button>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className={pageButtonClass(false, page === 1)}
                      title="Previous page"
                    >
                      ‹
                    </button>
                    
                    {startPage > 1 && (
                      <>
                        <button
                          onClick={() => setPage(1)}
                          className={pageButtonClass()}
                        >
                          1
                        </button>
                        {startPage > 2 && <span className="px-1 text-muted-foreground">...</span>}
                      </>
                    )}
                    
                    {pageNumbers.map(num => (
                      <button
                        key={num}
                        onClick={() => setPage(num)}
                        className={pageButtonClass(page === num)}
                        aria-current={page === num}
                      >
                        {num}
                      </button>
                    ))}
                    
                    {endPage < totalPages && (
                      <>
                        {endPage < totalPages - 1 && <span className="px-1 text-muted-foreground">...</span>}
                        <button
                          onClick={() => setPage(totalPages)}
                          className={pageButtonClass()}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className={pageButtonClass(false, page === totalPages)}
                      title="Next page"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                      className={pageButtonClass(false, page === totalPages)}
                      title="Last page"
                    >
                      »
                    </button>
                    
                    <form
                      onSubmit={handlePageInput}
                      className="flex items-center gap-2 rounded-md border border-border/80 bg-card px-3 py-1.5 text-sm shadow-sm"
                    >
                      <span className="text-muted-foreground">Go to:</span>
                      <input
                        type="number"
                        name="page"
                        min="1"
                        max={totalPages}
                        placeholder={page.toString()}
                        className="h-8 w-16 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>New component</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Component name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Category</label>
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Unit type</label>
              <select
                value={createForm.unit_type}
                onChange={(e) => setCreateForm({ ...createForm, unit_type: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="int">Integer</option>
                <option value="float">Float</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleCreate}
              disabled={!createForm.name.trim() || !createForm.category || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create component'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
