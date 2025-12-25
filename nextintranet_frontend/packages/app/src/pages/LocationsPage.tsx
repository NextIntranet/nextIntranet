import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@nextintranet/core';
import { CheckCircle, ChevronRight, Copy, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { LocationParentSelect } from '@/components/LocationParentSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface LocationNode {
  id: string;
  name: string;
  location?: string | null;
  description?: string | null;
  full_path: string;
  can_store_items: boolean;
  parent?: string | null;
  children?: LocationNode[];
}

interface LocationDetail {
  id: string;
  name: string;
  location?: string | null;
  description?: string | null;
  full_path: string;
  can_store_items: boolean;
  parent?: string | null;
}

interface User {
  is_superuser: boolean;
  access_permissions: Array<{
    area: string;
    level: string;
  }>;
}

type FlatLocation = LocationNode & {
  depth: number;
  hasChildren: boolean;
};

type EditMode = 'detail' | 'edit';

const flattenTree = (
  nodes: LocationNode[],
  expanded: Set<string>,
  depth = 0
): FlatLocation[] => {
  const rows: FlatLocation[] = [];
  nodes.forEach((node) => {
    const hasChildren = !!node.children && node.children.length > 0;
    rows.push({ ...node, depth, hasChildren });
    if (hasChildren && expanded.has(node.id)) {
      rows.push(...flattenTree(node.children || [], expanded, depth + 1));
    }
  });
  return rows;
};

const collectExpandableIds = (nodes: LocationNode[]): string[] => {
  const ids: string[] = [];
  nodes.forEach((node) => {
    if (node.children && node.children.length > 0) {
      ids.push(node.id, ...collectExpandableIds(node.children));
    }
  });
  return ids;
};

const findNodeById = (nodes: LocationNode[], targetId: string): LocationNode | null => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }
    if (node.children?.length) {
      const match = findNodeById(node.children, targetId);
      if (match) {
        return match;
      }
    }
  }
  return null;
};

const renderTruncatedText = (text: string) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="block w-full truncate">{text}</span>
    </TooltipTrigger>
    <TooltipContent>{text}</TooltipContent>
  </Tooltip>
);

export function LocationsPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mode: EditMode = searchParams.get('mode') === 'edit' ? 'edit' : 'detail';
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/v1/me/'),
  });

  const { data: locationsTree, isLoading: isTreeLoading } = useQuery<LocationNode[]>({
    queryKey: ['locations-tree'],
    queryFn: () => apiFetch<LocationNode[]>('/api/v1/store/location/tree/'),
  });

  const { data: locationDetail, isLoading: isDetailLoading } = useQuery<LocationDetail>({
    queryKey: ['location', id],
    queryFn: () => apiFetch<LocationDetail>(`/api/v1/store/location/${id}/`),
    enabled: !!id,
  });

  useEffect(() => {
    if (locationsTree && expandedIds.length === 0) {
      setExpandedIds(collectExpandableIds(locationsTree));
    }
  }, [locationsTree, expandedIds.length]);

  const parentLocation = useMemo(() => {
    if (!locationDetail?.parent || !locationsTree) {
      return null;
    }
    return findNodeById(locationsTree, locationDetail.parent);
  }, [locationDetail?.parent, locationsTree]);

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (p) => p.area === 'warehouse' && ['write', 'admin'].includes(p.level)
    );

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);
  const flatLocations = useMemo(
    () => flattenTree(locationsTree || [], expandedSet),
    [locationsTree, expandedSet]
  );

  const [formState, setFormState] = useState({
    name: '',
    location: '',
    description: '',
    parent: '',
    can_store_items: false,
  });

  useEffect(() => {
    if (!locationDetail) {
      return;
    }
    setFormState({
      name: locationDetail.name || '',
      location: locationDetail.location || '',
      description: locationDetail.description || '',
      parent: locationDetail.parent || '',
      can_store_items: locationDetail.can_store_items,
    });
  }, [locationDetail?.id]);

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<LocationDetail>) =>
      apiFetch(`/api/v1/store/location/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations-tree'] });
      queryClient.invalidateQueries({ queryKey: ['location', id] });
      setSearchParams((params) => {
        const next = new URLSearchParams(params);
        next.delete('mode');
        return next;
      });
      toast.success('Location updated.');
    },
    onError: () => {
      toast.error('Failed to update location.');
    },
  });

  const handleToggle = (locationId: string) => {
    setExpandedIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  };

  const handleOpen = (locationId: string) => {
    navigate(`/store/location/${locationId}`);
  };

  const handleCloseSheet = () => {
    setSearchParams(new URLSearchParams());
    navigate('/store/location', { replace: true });
  };

  const handleEditMode = (nextMode: EditMode) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      if (nextMode === 'edit') {
        next.set('mode', 'edit');
      } else {
        next.delete('mode');
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!id) {
      return;
    }
    updateMutation.mutate({
      name: formState.name.trim(),
      location: formState.location.trim() || null,
      description: formState.description.trim() || null,
      parent: formState.parent || null,
      can_store_items: formState.can_store_items,
    });
  };

  const handleCopyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Link copied.');
    } catch {
      toast.error('Unable to copy link.');
    }
  };

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Locations</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage warehouse storage hierarchy.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="overflow-hidden rounded-lg border border-border/70">
            <Table className="w-full table-fixed">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 w-[34%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Full path
                  </TableHead>
                  <TableHead className="h-9 w-[38%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isTreeLoading ? (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={3} className="py-8">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-2/3" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : flatLocations.length ? (
                  flatLocations.map((row) => (
                    <TableRow key={row.id} className="border-border/40">
                      <TableCell className="h-9 px-3">
                        <div
                          className="flex min-w-0 items-center gap-1"
                          style={{ paddingLeft: `${row.depth * 16}px` }}
                        >
                          {row.hasChildren ? (
                            <button
                              type="button"
                              onClick={() => handleToggle(row.id)}
                              className="grid h-5 w-5 place-items-center rounded-sm text-muted-foreground hover:text-foreground"
                              aria-label={expandedSet.has(row.id) ? 'Collapse' : 'Expand'}
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform ${
                                  expandedSet.has(row.id) ? 'rotate-90' : ''
                                }`}
                              />
                            </button>
                          ) : (
                            <span className="inline-block h-5 w-5" />
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpen(row.id)}
                            className="h-7 min-w-0 justify-start px-2 font-normal text-primary hover:underline"
                          >
                            <span className="truncate">{row.name}</span>
                          </Button>
                          {row.can_store_items && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Can store components</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                        {row.full_path ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0 flex-1">{renderTruncatedText(row.full_path)}</div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopyLink(row.full_path)}
                              aria-label="Copy full path"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                        {row.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block whitespace-normal break-words leading-relaxed">
                                {row.description}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{row.description}</TooltipContent>
                          </Tooltip>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow className="border-border/40">
                    <TableCell
                      colSpan={3}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No locations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <Sheet open={!!id} onOpenChange={(open) => (!open ? handleCloseSheet() : null)}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetHeader>
              <SheetTitle>
                {mode === 'edit' ? 'Edit location' : 'Location details'}
              </SheetTitle>
            </SheetHeader>

            {isDetailLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : locationDetail ? (
              <div className="mt-6 space-y-4">
                {mode === 'detail' ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
                      <p className="text-sm text-foreground">{locationDetail.name}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Full path
                        </p>
                        <p className="text-sm text-foreground">{locationDetail.full_path}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Parent
                        </p>
                        {parentLocation ? (
                          <button
                            type="button"
                            onClick={() => handleOpen(parentLocation.id)}
                            className="text-left text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {parentLocation.name}
                          </button>
                        ) : (
                          <p className="text-sm text-muted-foreground">-</p>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Location
                        </p>
                        <p className="text-sm text-foreground">
                          {locationDetail.location || '-'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Can store items
                        </p>
                        <p className="text-sm text-foreground">
                          {locationDetail.can_store_items ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Description
                      </p>
                      <p className="text-sm text-foreground">
                        {locationDetail.description || 'No description.'}
                      </p>
                    </div>
                    {canEdit && (
                      <Button
                        className="mt-2 w-full gap-2"
                        onClick={() => handleEditMode('edit')}
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Name</label>
                      <Input
                        value={formState.name}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        placeholder="Location name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Parent</label>
                      <LocationParentSelect
                        locations={locationsTree || []}
                        value={formState.parent || null}
                        onChange={(nextValue) =>
                          setFormState({ ...formState, parent: nextValue || '' })
                        }
                        excludeId={locationDetail.id}
                        isDisabled={!canEdit}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Location</label>
                      <Input
                        value={formState.location}
                        onChange={(e) =>
                          setFormState({ ...formState, location: e.target.value })
                        }
                        placeholder="Address or label"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Description</label>
                      <textarea
                        value={formState.description}
                        onChange={(e) =>
                          setFormState({ ...formState, description: e.target.value })
                        }
                        className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Optional notes"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={formState.can_store_items}
                        onChange={(e) =>
                          setFormState({ ...formState, can_store_items: e.target.checked })
                        }
                        className="h-4 w-4 rounded border border-input"
                      />
                      Can store items
                    </label>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <Button variant="outline" onClick={() => handleEditMode('detail')}>
                        Cancel
                      </Button>
                      <Button onClick={handleSave} disabled={!canEdit || updateMutation.isPending}>
                        {updateMutation.isPending ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-6 text-sm text-muted-foreground">
                Location details are not available.
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
