import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@nextintranet/core';
import { CheckCircle, ChevronRight, Copy, Home, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { LocationParentSelect } from '@/components/LocationParentSelect';
import { ShowComponentsButton } from '@/components/ShowComponentsButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExtensionPoint } from '@/plugins/ExtensionPoint';
import { PrintActions } from '@/components/PrintActions';

interface LocationNode {
  id: string;
  uuid: string;
  name: string;
  location?: string | null;
  description?: string | null;
  full_path: string;
  can_store_items: boolean;
  parent?: string | null;
  map?: string | null;
  children?: LocationNode[];
}

interface LocationDetail {
  id: string;
  uuid: string;
  name: string;
  location?: string | null;
  description?: string | null;
  full_path: string;
  can_store_items: boolean;
  parent?: string | null;
  map?: string | null;
}

interface User {
  is_superuser: boolean;
  access_permissions: Array<{
    area: string;
    level: string;
  }>;
  settings?: {
    home_location?: string | null;
  };
}

type FlatLocation = LocationNode & {
  depth: number;
  hasChildren: boolean;
};

type EditMode = 'detail' | 'edit';
type ViewMode = 'tree' | 'level';
type LocationUpdatePayload = Partial<LocationDetail> | FormData;

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

const collectExpandableIdsAtDepth = (
  nodes: LocationNode[],
  maxDepth: number,
  depth = 0,
  ids: string[] = []
): string[] => {
  nodes.forEach((node) => {
    if (node.children && node.children.length > 0 && depth < maxDepth) {
      ids.push(node.id);
      if (depth + 1 < maxDepth) {
        collectExpandableIdsAtDepth(node.children, maxDepth, depth + 1, ids);
      }
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

const findPathById = (nodes: LocationNode[], targetId: string): LocationNode[] => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [node];
    }
    if (node.children?.length) {
      const path = findPathById(node.children, targetId);
      if (path.length) {
        return [node, ...path];
      }
    }
  }
  return [];
};

const buildUuidIndex = (nodes: LocationNode[]) => {
  const index = new Map<string, LocationNode>();
  const walk = (items: LocationNode[]) => {
    items.forEach((node) => {
      index.set(node.uuid, node);
      if (node.children?.length) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return index;
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
  const view: ViewMode = searchParams.get('view') === 'level' ? 'level' : 'tree';
  const levelId = searchParams.get('level');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const treeContainerRef = useRef<HTMLDivElement | null>(null);
  const [mapSvg, setMapSvg] = useState('');
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [mapFile, setMapFile] = useState<File | null>(null);
  const [removeMap, setRemoveMap] = useState(false);

  const { data: user } = useQuery<User>({
    queryKey: ['me'],
    queryFn: () => apiFetch<User>('/api/v1/me/'),
  });
  const homeLocationId = user?.settings?.home_location ?? null;
  const highlightLocationId = searchParams.get('id') || id || null;

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
      setExpandedIds(collectExpandableIdsAtDepth(locationsTree, 2));
    }
  }, [locationsTree, expandedIds.length]);

  useEffect(() => {
    if (view !== 'level' || levelId || !homeLocationId) {
      return;
    }
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('level', homeLocationId);
      return next;
    });
  }, [homeLocationId, levelId, setSearchParams, view]);

  const parentLocation = useMemo(() => {
    if (!locationDetail?.parent || !locationsTree) {
      return null;
    }
    return findNodeById(locationsTree, locationDetail.parent);
  }, [locationDetail?.parent, locationsTree]);

  const currentLevel = useMemo(() => {
    if (!levelId || !locationsTree) {
      return null;
    }
    return findNodeById(locationsTree, levelId);
  }, [levelId, locationsTree]);

  const levelParent = useMemo(() => {
    if (!currentLevel?.parent || !locationsTree) {
      return null;
    }
    return findNodeById(locationsTree, currentLevel.parent);
  }, [currentLevel?.parent, locationsTree]);

  const currentChildren = useMemo(() => {
    if (currentLevel) {
      return currentLevel.children || [];
    }
    return locationsTree || [];
  }, [currentLevel, locationsTree]);

  const currentMapUrl = currentLevel?.map || null;
  const breadcrumbs = useMemo(() => {
    if (!levelId || !locationsTree) {
      return [];
    }
    return findPathById(locationsTree, levelId);
  }, [levelId, locationsTree]);

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

  useEffect(() => {
    if (!highlightLocationId || view !== 'tree') {
      return;
    }
    const container = treeContainerRef.current;
    if (!container) {
      return;
    }
    const target = container.querySelector(
      `[data-location-id="${highlightLocationId}"]`
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [flatLocations.length, highlightLocationId, view]);

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
    setMapFile(null);
    setRemoveMap(false);
  }, [locationDetail?.id]);

  const updateMutation = useMutation({
    mutationFn: (payload: LocationUpdatePayload) =>
      apiFetch(`/api/v1/store/location/${id}/`, {
        method: 'PATCH',
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
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

  const locationsByUuid = useMemo(
    () => buildUuidIndex(locationsTree || []),
    [locationsTree]
  );

  const clickableIds = useMemo(
    () => new Set(locationsByUuid.keys()),
    [locationsByUuid]
  );

  const mapMarkup = useMemo(() => {
    if (!mapSvg) {
      return '';
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(mapSvg, 'image/svg+xml');
      doc.querySelectorAll('[id]').forEach((el) => {
        const id = el.getAttribute('id');
        if (!id) {
          return;
        }
        if (el.tagName.toLowerCase() === 'svg') {
          return;
        }
        if (clickableIds.has(id)) {
          el.setAttribute('data-location-target', 'true');
        }
      });
      return new XMLSerializer().serializeToString(doc.documentElement);
    } catch {
      return mapSvg;
    }
  }, [mapSvg, clickableIds]);

  const mapIds = useMemo(() => {
    if (!mapSvg) {
      return new Set<string>();
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(mapSvg, 'image/svg+xml');
      return new Set(Array.from(doc.querySelectorAll('[id]')).map((el) => el.id));
    } catch {
      return new Set<string>();
    }
  }, [mapSvg]);

  const missingMapChildren = useMemo(
    () => currentChildren.filter((child) => child.uuid && !mapIds.has(child.uuid)),
    [currentChildren, mapIds]
  );

  useEffect(() => {
    if (!currentMapUrl) {
      setMapSvg('');
      setMapLoadError(null);
      setIsMapLoading(false);
      return;
    }

    let isActive = true;
    setIsMapLoading(true);
    setMapLoadError(null);
    fetch(currentMapUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Map request failed');
        }
        return response.text();
      })
      .then((text) => {
        if (!isActive) {
          return;
        }
        setMapSvg(text);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setMapLoadError('Unable to load the map file.');
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsMapLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [currentMapUrl]);

  const handleToggle = (locationId: string) => {
    setExpandedIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  };

  const handleOpen = (locationId: string) => {
    navigate(`/store/location/${locationId}`);
  };

  const handleCloseSheet = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('mode');
    setSearchParams(next);
    navigate(
      {
        pathname: '/store/location',
        search: next.toString(),
      },
      { replace: true }
    );
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

  const handleViewChange = (nextView: ViewMode) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('view', nextView);
      return next;
    });
  };

  const setLevel = (nextLevelId: string | null) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('view', 'level');
      if (nextLevelId) {
        next.set('level', nextLevelId);
      } else {
        next.delete('level');
      }
      return next;
    });
  };

  const handleSave = () => {
    if (!id) {
      return;
    }
    const payload = {
      name: formState.name.trim(),
      location: formState.location.trim() || null,
      description: formState.description.trim() || null,
      parent: formState.parent || null,
      can_store_items: formState.can_store_items,
    };
    if (mapFile || removeMap) {
      const data = new FormData();
      data.append('name', payload.name);
      data.append('location', payload.location ?? '');
      data.append('description', payload.description ?? '');
      data.append('parent', payload.parent ?? '');
      data.append('can_store_items', payload.can_store_items ? 'true' : 'false');
      if (removeMap) {
        data.append('map', '');
      }
      if (mapFile) {
        data.append('map', mapFile);
      }
      updateMutation.mutate(data);
      return;
    }
    updateMutation.mutate(payload);
  };

  const handleCopyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Link copied.');
    } catch {
      toast.error('Unable to copy link.');
    }
  };

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = (event.target as Element | null)?.closest('[data-location-target]');
    if (!target) {
      return;
    }
    const uuid = target.getAttribute('id');
    if (!uuid) {
      return;
    }
    const node = locationsByUuid.get(uuid);
    if (!node) {
      return;
    }
    setLevel(node.id);
  };

  return (
    <TooltipProvider>
      <div
        className={`mx-auto px-4 py-6 lg:px-6 ${
          view === 'level' ? 'max-w-none' : 'max-w-6xl'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Locations</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage warehouse storage hierarchy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExtensionPoint name="locations.actions" context={{ locationId: id ?? null }} />
            <PrintActions targetType="location" targetId={id ?? null} label={locationDetail?.full_path || locationDetail?.name} compact />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border/60 bg-background p-1">
            <Button
              variant={view === 'tree' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewChange('tree')}
            >
              Tree view
            </Button>
            <Button
              variant={view === 'level' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewChange('level')}
            >
              Level view
            </Button>
          </div>
          {view === 'level' && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLevel(null)}
                className="px-2"
              >
                Root
              </Button>
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.id} className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLevel(crumb.id)}
                    className="px-2"
                  >
                    {crumb.name}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 w-full">
          {view === 'tree' ? (
            <div
              className="overflow-hidden rounded-lg border border-border/70"
              ref={treeContainerRef}
            >
              <Table className="w-full table-fixed">
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-border/50">
                    <TableHead className="h-9 w-[26%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Name
                    </TableHead>
                    <TableHead className="h-9 w-[26%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Full path
                    </TableHead>
                    <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Description
                    </TableHead>
                    <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isTreeLoading ? (
                    <TableRow className="border-border/40">
                      <TableCell colSpan={4} className="py-8">
                        <div className="space-y-2">
                          <Skeleton className="h-5 w-1/2" />
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-5 w-2/3" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : flatLocations.length ? (
                    flatLocations.map((row) => (
                      <TableRow
                        key={row.id}
                        data-location-id={row.id}
                        className={`border-border/40 ${
                          highlightLocationId === row.id ? 'bg-primary/10' : ''
                        }`}
                      >
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleCopyLink(row.id)}
                                  aria-label="Copy location ID"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy location ID</TooltipContent>
                            </Tooltip>
                            {homeLocationId === row.id && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                    <Home className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Home location</TooltipContent>
                              </Tooltip>
                            )}
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
                        <TableCell className="px-3 py-2 text-sm align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <ShowComponentsButton to={`/store?locations=${row.id}`} />
                            <PrintActions
                              targetType="location"
                              targetId={row.id}
                              label={row.full_path || row.name}
                              compact
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="border-border/40">
                      <TableCell
                        colSpan={4}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No locations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div className="rounded-lg border border-border/70 bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Level</p>
                    <p className="text-lg font-semibold text-foreground">
                      {currentLevel ? currentLevel.name : 'Root'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{currentLevel?.full_path || 'Top-level locations'}</span>
                    {currentLevel?.id && (
                      <ShowComponentsButton to={`/store?locations=${currentLevel.id}`} />
                    )}
                  </div>
                </div>
              </div>
              {currentMapUrl && !mapLoadError ? (
                <div className="rounded-lg border border-border/70 bg-background p-4">
                  {isMapLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-1/3" />
                      <Skeleton className="h-48 w-full" />
                    </div>
                  ) : mapSvg ? (
                    <div className="space-y-4">
                      <div
                        className="max-w-full overflow-auto [&_[data-location-target]]:cursor-pointer [&_svg]:h-auto [&_svg]:max-w-full [&_svg]:pointer-events-none [&_[data-location-target]]:pointer-events-auto"
                        onClick={handleMapClick}
                        aria-label="Location map"
                        role="presentation"
                        dangerouslySetInnerHTML={{ __html: mapMarkup }}
                      />
                      {missingMapChildren.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Locations not on the map
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {missingMapChildren.map((child) => (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => setLevel(child.id)}
                                className="flex min-h-[96px] flex-col items-start justify-between rounded-lg border border-border/60 bg-background p-4 text-left shadow-sm transition hover:border-primary/60 hover:bg-muted/30"
                              >
                                <div className="text-base font-semibold text-foreground">
                                  {child.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {child.full_path}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Map is not available.</p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-border/70 bg-card p-4">
                  {mapLoadError && (
                    <p className="mb-3 text-sm text-destructive">{mapLoadError}</p>
                  )}
                  {isTreeLoading ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-24 w-full" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                  ) : currentChildren.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {currentChildren.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => setLevel(child.id)}
                          className="flex min-h-[96px] flex-col items-start justify-between rounded-lg border border-border/60 bg-background p-4 text-left shadow-sm transition hover:border-primary/60 hover:bg-muted/30"
                        >
                          <div className="text-base font-semibold text-foreground">
                            {child.name}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {child.can_store_items ? (
                              <span className="inline-flex items-center gap-1 text-primary">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Can store items
                              </span>
                            ) : (
                              <span>Browse level</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No locations found.</p>
                  )}
                </div>
              )}
            </div>
          )}
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
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Map</p>
                      {locationDetail.map ? (
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={locationDetail.map} target="_blank" rel="noreferrer">
                              Open map
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyLink(locationDetail.map || '')}
                            aria-label="Copy map link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No map uploaded.</p>
                      )}
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
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Map (SVG)</label>
                      {locationDetail.map && !removeMap && (
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={locationDetail.map} target="_blank" rel="noreferrer">
                              Open current map
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyLink(locationDetail.map || '')}
                            aria-label="Copy map link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Input
                        type="file"
                        accept="image/svg+xml"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setMapFile(file);
                          if (file) {
                            setRemoveMap(false);
                          }
                        }}
                        disabled={removeMap}
                      />
                      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={removeMap}
                          onChange={(event) => setRemoveMap(event.target.checked)}
                          className="h-4 w-4 rounded border border-input"
                          disabled={!locationDetail.map}
                        />
                        Remove existing map
                      </label>
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
                <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Print label</p>
                  <div className="mt-2">
                    <PrintActions
                      targetType="location"
                      targetId={locationDetail.id}
                      label={locationDetail.full_path || locationDetail.name}
                    />
                  </div>
                </div>
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
