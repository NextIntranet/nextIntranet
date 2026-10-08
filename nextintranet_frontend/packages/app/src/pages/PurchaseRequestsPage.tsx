import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { Folder, FolderPlus, Package, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ComponentAsyncSelect } from "@/components/ComponentAsyncSelect"
import { LocationParentSelect } from "@/components/LocationParentSelect"
import { type TargetLocationNode, targetLocationTree } from "@/components/RequestComponentSheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PurchaseRequestTable } from "@/components/purchase-requests/PurchaseRequestTable"
import {
  FOLDER_DRAG_PREFIX,
  FolderNode,
  PurchaseRequest,
  PurchaseRequestFolder,
  REQUEST_DRAG_PREFIX,
  ROOT_DROP_ID,
  UNGROUPED_ID,
  buildVisibleRows,
  isDescendantFolder,
  suppliersTooltip,
} from "@/components/purchase-requests/types"

interface PaginatedRequests {
  results: PurchaseRequest[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type EditMode = "detail" | "edit"

export function PurchaseRequestsPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false)

  const mode: EditMode = searchParams.get("mode") === "edit" ? "edit" : "detail"
  const createFromQuery = searchParams.get("create") === "1"
  const createComponentId = searchParams.get("component") || ""

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: requestsData, isLoading: isRequestsLoading } = useQuery<
    PurchaseRequest[] | PaginatedRequests
  >({
    queryKey: ["purchase-requests"],
    queryFn: () =>
      apiFetch<PurchaseRequest[] | PaginatedRequests>(
        "/api/v1/store/purchase-requests/?page_size=1000",
      ),
  })

  const requests = Array.isArray(requestsData) ? requestsData : requestsData?.results || []

  const { data: foldersData, isLoading: isFoldersLoading } = useQuery<
    PurchaseRequestFolder[] | { results: PurchaseRequestFolder[] }
  >({
    queryKey: ["purchase-request-folders"],
    queryFn: () => apiFetch("/api/v1/store/purchase-request-folder/"),
  })

  const folders = Array.isArray(foldersData) ? foldersData : foldersData?.results || []

  const folderTree = useMemo<FolderNode[]>(() => {
    const buildTree = (parentId: string | null): FolderNode[] =>
      folders
        .filter((folder) => folder.parent === parentId)
        .map((folder) => ({
          ...folder,
          children: buildTree(folder.id),
          requests: requests.filter((request) => request.folder_id === folder.id),
        }))
    return buildTree(null)
  }, [folders, requests])

  const ungroupedRequests = useMemo(
    () => requests.filter((request) => !request.folder_id),
    [requests],
  )

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set([UNGROUPED_ID]))
  const hasSeededExpand = useRef(false)

  useEffect(() => {
    if (hasSeededExpand.current || folders.length === 0) {
      return
    }
    hasSeededExpand.current = true
    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (const folder of folders) {
        if (!folder.parent) {
          next.add(folder.id)
        }
      }
      return next
    })
  }, [folders])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const visibleRows = useMemo(
    () => buildVisibleRows(folderTree, ungroupedRequests, expandedIds),
    [folderTree, ungroupedRequests, expandedIds],
  )

  // Multi-select: click selects one, Ctrl/Cmd+click toggles, Shift+click selects a range.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectionAnchorRef = useRef<string | null>(null)
  const visibleRequestIds = useMemo(
    () => visibleRows.flatMap((row) => (row.kind === "request" ? [row.request.id] : [])),
    [visibleRows],
  )

  useEffect(() => {
    // Drop ids that are gone (deleted, assigned to a purchase).
    setSelectedIds((prev) => {
      const existing = new Set(requests.map((request) => request.id))
      const next = new Set([...prev].filter((requestId) => existing.has(requestId)))
      return next.size === prev.size ? prev : next
    })
  }, [requests])

  const handleSelectRequest = (requestId: string, event: React.MouseEvent) => {
    const anchor = selectionAnchorRef.current
    if (event.shiftKey && anchor) {
      const from = visibleRequestIds.indexOf(anchor)
      const to = visibleRequestIds.indexOf(requestId)
      if (from !== -1 && to !== -1) {
        const range = visibleRequestIds.slice(Math.min(from, to), Math.max(from, to) + 1)
        setSelectedIds((prev) => new Set([...(event.ctrlKey || event.metaKey ? prev : []), ...range]))
        return
      }
    }
    selectionAnchorRef.current = requestId
    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(requestId)) next.delete(requestId)
        else next.add(requestId)
        return next
      })
      return
    }
    setSelectedIds((prev) => (prev.size === 1 && prev.has(requestId) ? new Set() : new Set([requestId])))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    selectionAnchorRef.current = null
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const { data: requestDetail, isLoading: isDetailLoading } = useQuery<PurchaseRequest>({
    queryKey: ["purchase-request", id],
    queryFn: () => apiFetch<PurchaseRequest>(`/api/v1/store/purchase-request/${id}/`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    quantity: "",
    description: "",
    target_location: "",
  })

  const { data: locationsTree } = useQuery<TargetLocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<TargetLocationNode[]>("/api/v1/store/location/tree/"),
    staleTime: 5 * 60 * 1000,
  })
  const targetTree = useMemo(() => targetLocationTree(locationsTree || []), [locationsTree])

  const [createFormState, setCreateFormState] = useState({
    component_id: "",
    item_name: "",
    quantity: "1",
    description: "",
    use_custom: false,
  })

  useEffect(() => {
    if (!requestDetail) {
      return
    }
    setFormState({
      quantity: requestDetail.quantity ? String(requestDetail.quantity) : "",
      description: requestDetail.description || "",
      target_location: requestDetail.target_location || "",
    })
  }, [requestDetail?.id])

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<PurchaseRequest>) =>
      apiFetch(`/api/v1/store/purchase-request/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      queryClient.invalidateQueries({ queryKey: ["purchase-request", id] })
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete("mode")
        return next
      })
      toast.success("Request updated.")
    },
    onError: () => {
      toast.error("Failed to update request.")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiFetch(`/api/v1/store/purchase-request/${requestId}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      toast.success("Request deleted.")
    },
    onError: () => {
      toast.error("Failed to delete request.")
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: { component_id?: string; item_name?: string; quantity: number; description: string }) =>
      apiFetch("/api/v1/store/purchase-requests/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      setIsCreateSheetOpen(false)
      setCreateFormState({ component_id: "", item_name: "", quantity: "1", description: "", use_custom: false })
      toast.success("Purchase request created.")
    },
    onError: () => {
      toast.error("Failed to create request.")
    },
  })

  const moveRequestMutation = useMutation({
    mutationFn: ({ requestId, folderId }: { requestId: string; folderId: string | null }) =>
      apiFetch(`/api/v1/store/purchase-request/${requestId}/`, {
        method: "PATCH",
        body: JSON.stringify({ folder_id: folderId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
    },
    onError: () => {
      toast.error("Failed to move request.")
    },
  })

  const moveManyMutation = useMutation({
    mutationFn: ({ requestIds, folderId }: { requestIds: string[]; folderId: string | null }) =>
      Promise.all(
        requestIds.map((requestId) =>
          apiFetch(`/api/v1/store/purchase-request/${requestId}/`, {
            method: "PATCH",
            body: JSON.stringify({ folder_id: folderId }),
          }),
        ),
      ),
    onSuccess: (_, { requestIds, folderId }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      const folderName = folderId ? folders.find((folder) => folder.id === folderId)?.name : "Ungrouped"
      toast.success(`Moved ${requestIds.length} request${requestIds.length === 1 ? "" : "s"} to ${folderName}.`)
      clearSelection()
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      toast.error("Failed to move requests.")
    },
  })

  const createFolderMutation = useMutation({
    mutationFn: (payload: { name: string; parent: string | null }) =>
      apiFetch("/api/v1/store/purchase-request-folder/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-request-folders"] })
      toast.success("Folder created.")
    },
    onError: () => {
      toast.error("Failed to create folder.")
    },
  })

  const updateFolderMutation = useMutation({
    mutationFn: ({ folderId, payload }: { folderId: string; payload: Partial<PurchaseRequestFolder> }) =>
      apiFetch(`/api/v1/store/purchase-request-folder/${folderId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-request-folders"] })
    },
    onError: () => {
      toast.error("Failed to update folder.")
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) =>
      apiFetch(`/api/v1/store/purchase-request-folder/${folderId}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-request-folders"] })
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      toast.success("Folder deleted.")
    },
    onError: () => {
      toast.error("Failed to delete folder.")
    },
  })

  const handleCreateFolder = (parentId: string | null) => {
    const name = window.prompt(parentId ? "Subfolder name" : "Folder name")
    const trimmed = name?.trim()
    if (!trimmed) {
      return
    }
    createFolderMutation.mutate({ name: trimmed, parent: parentId })
  }

  const handleRenameFolder = (folderId: string, name: string) => {
    updateFolderMutation.mutate({ folderId, payload: { name } })
  }

  const handleDeleteFolder = (folderId: string) => {
    if (!window.confirm("Delete this folder? Requests inside become ungrouped; subfolders are deleted too.")) {
      return
    }
    deleteFolderMutation.mutate(folderId)
  }

  const [blockedDropFolderIds, setBlockedDropFolderIds] = useState<Set<string>>(new Set())
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id)
    setActiveDragId(activeId)
    if (!activeId.startsWith(FOLDER_DRAG_PREFIX)) {
      return
    }
    const draggedFolderId = activeId.slice(FOLDER_DRAG_PREFIX.length)
    const blocked = new Set<string>([draggedFolderId])
    for (const folder of folders) {
      if (isDescendantFolder(folders, folder.id, draggedFolderId)) {
        blocked.add(folder.id)
      }
    }
    setBlockedDropFolderIds(blocked)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setBlockedDropFolderIds(new Set())
    setActiveDragId(null)
    const { active, over } = event
    if (!over) {
      return
    }
    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith(REQUEST_DRAG_PREFIX)) {
      if (overId !== ROOT_DROP_ID && !overId.startsWith(FOLDER_DRAG_PREFIX)) {
        return
      }
      const requestId = activeId.slice(REQUEST_DRAG_PREFIX.length)
      const dropFolderId = overId === ROOT_DROP_ID ? null : overId.slice(FOLDER_DRAG_PREFIX.length)
      const targetFolderId = dropFolderId === UNGROUPED_ID ? null : dropFolderId
      // Dragging a selected row moves the whole selection.
      const draggedIds = selectedIds.has(requestId) ? [...selectedIds] : [requestId]
      const toMove = draggedIds.filter(
        (draggedId) => (requests.find((request) => request.id === draggedId)?.folder_id ?? null) !== targetFolderId,
      )
      if (toMove.length === 0) {
        return
      }
      if (toMove.length === 1 && draggedIds.length === 1) {
        moveRequestMutation.mutate({ requestId: toMove[0], folderId: targetFolderId })
      } else {
        moveManyMutation.mutate({ requestIds: toMove, folderId: targetFolderId })
      }
      return
    }

    if (activeId.startsWith(FOLDER_DRAG_PREFIX)) {
      const folderId = activeId.slice(FOLDER_DRAG_PREFIX.length)
      const targetParentId =
        overId === ROOT_DROP_ID ? null : overId.startsWith(FOLDER_DRAG_PREFIX) ? overId.slice(FOLDER_DRAG_PREFIX.length) : undefined
      if (targetParentId === undefined || targetParentId === folderId) {
        return
      }
      const currentFolder = folders.find((folder) => folder.id === folderId)
      if (!currentFolder || currentFolder.parent === targetParentId) {
        return
      }
      if (targetParentId && isDescendantFolder(folders, targetParentId, folderId)) {
        return
      }
      updateFolderMutation.mutate({ folderId, payload: { parent: targetParentId } })
    }
  }

  const handleDragCancel = () => {
    setBlockedDropFolderIds(new Set())
    setActiveDragId(null)
  }

  const activeDragLabel = useMemo(() => {
    if (!activeDragId) {
      return null
    }
    if (activeDragId.startsWith(REQUEST_DRAG_PREFIX)) {
      const requestId = activeDragId.slice(REQUEST_DRAG_PREFIX.length)
      if (selectedIds.has(requestId) && selectedIds.size > 1) {
        return { type: "request" as const, label: `${selectedIds.size} requests` }
      }
      const request = requests.find((r) => r.id === requestId)
      if (!request) {
        return null
      }
      return { type: "request" as const, label: request.component_name || request.item_name || "Unknown item" }
    }
    if (activeDragId.startsWith(FOLDER_DRAG_PREFIX)) {
      const folder = folders.find((f) => f.id === activeDragId.slice(FOLDER_DRAG_PREFIX.length))
      if (!folder) {
        return null
      }
      return { type: "folder" as const, label: folder.name }
    }
    return null
  }, [activeDragId, requests, folders, selectedIds])

  const draggingIds = useMemo(() => {
    if (!activeDragId?.startsWith(REQUEST_DRAG_PREFIX)) return new Set<string>()
    const requestId = activeDragId.slice(REQUEST_DRAG_PREFIX.length)
    return selectedIds.has(requestId) ? selectedIds : new Set([requestId])
  }, [activeDragId, selectedIds])

  const handleOpen = (requestId: string) => {
    navigate(`/store/purchase-requests/${requestId}`)
  }

  const handleCloseSheet = () => {
    setSearchParams(new URLSearchParams())
    navigate("/store/purchase-requests", { replace: true })
  }

  useEffect(() => {
    if (!createFromQuery) {
      return
    }
    setIsCreateSheetOpen(true)
    if (createComponentId) {
      setCreateFormState((prev) => ({
        ...prev,
        use_custom: false,
        component_id: createComponentId,
        item_name: "",
      }))
    }
  }, [createFromQuery, createComponentId])

  const handleOpenCreateSheet = () => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.set("create", "1")
      return next
    })
    setIsCreateSheetOpen(true)
  }

  const handleCreateSheetOpenChange = (open: boolean) => {
    setIsCreateSheetOpen(open)
    if (!open) {
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete("create")
        next.delete("component")
        return next
      })
    }
  }

  const handleEditMode = (nextMode: EditMode) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      if (nextMode === "edit") {
        next.set("mode", "edit")
      } else {
        next.delete("mode")
      }
      return next
    })
  }

  const handleSave = () => {
    if (!id) {
      return
    }
    const quantityValue = formState.quantity.trim()
    updateMutation.mutate({
      quantity: quantityValue ? Number(quantityValue) : 0,
      description: formState.description.trim() || null,
      target_location: formState.target_location || null,
    })
  }

  const handleCreate = () => {
    if (createFormState.use_custom) {
      const itemName = createFormState.item_name.trim()
      if (!itemName) {
        toast.error("Item name is required.")
        return
      }
      const quantityValue = createFormState.quantity.trim()
      createMutation.mutate({
        item_name: itemName,
        quantity: quantityValue ? Number(quantityValue) : 1,
        description: createFormState.description.trim(),
      })
    } else {
      if (!createFormState.component_id) {
        toast.error("Please select a component.")
        return
      }
      const quantityValue = createFormState.quantity.trim()
      createMutation.mutate({
        component_id: createFormState.component_id,
        quantity: quantityValue ? Number(quantityValue) : 1,
        description: createFormState.description.trim(),
      })
    }
  }

  return (
    <TooltipProvider>
      <div className="w-full px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Purchase requests</h1>
            <p className="text-sm text-muted-foreground">
              Review open requests for purchasing components. Drag a request onto a folder to file it; Ctrl/Shift+click
              selects several.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" className="gap-2" onClick={() => handleCreateFolder(null)}>
                <FolderPlus className="h-4 w-4" />
                New Folder
              </Button>
            )}
            {canEdit && (
              <Button className="gap-2" onClick={handleOpenCreateSheet}>
                <Plus className="h-4 w-4" />
                New Request
              </Button>
            )}
          </div>
        </div>

        <div
          className={cn(
            "sticky top-0 z-20 mt-4 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-sm",
            selectedIds.size > 0
              ? "border-sky-300 bg-sky-50 shadow-sm dark:border-sky-800 dark:bg-sky-950/60"
              : "border-dashed border-border/70 text-muted-foreground",
          )}
        >
          {selectedIds.size > 0 ? (
            <>
              <span className="font-medium text-foreground">{selectedIds.size} selected</span>
              <span className="text-muted-foreground">·</span>
              {canEdit ? (
                <label className="inline-flex items-center gap-2 text-muted-foreground">
                  Move to
                  <select
                    value=""
                    disabled={moveManyMutation.isPending}
                    onChange={(event) => {
                      const value = event.target.value
                      if (!value) return
                      moveManyMutation.mutate({
                        requestIds: [...selectedIds],
                        folderId: value === UNGROUPED_ID ? null : value,
                      })
                    }}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">Choose folder…</option>
                    <option value={UNGROUPED_ID}>Ungrouped</option>
                    {[...folders]
                      .sort((a, b) => a.full_path.localeCompare(b.full_path))
                      .map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.full_path}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <span className="hidden text-xs text-muted-foreground sm:inline">
                or drag one of the selected rows onto a folder
              </span>
              <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={clearSelection}>
                Clear selection
              </Button>
            </>
          ) : (
            <span className="text-xs">
              Click a row to select it · Ctrl/Cmd+click adds or removes · Shift+click selects a range · Esc clears
            </span>
          )}
        </div>

        <div className="mt-4">
          {isRequestsLoading || isFoldersLoading ? (
            <div className="space-y-2 rounded-lg border border-border/70 p-4">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <PurchaseRequestTable
                rows={visibleRows}
                canEdit={!!canEdit}
                deletePending={deleteMutation.isPending}
                onOpenRequest={handleOpen}
                onDeleteRequest={(requestId) => deleteMutation.mutate(requestId)}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onCreateSubfolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                blockedDropFolderIds={blockedDropFolderIds}
                selectedIds={selectedIds}
                draggingIds={draggingIds}
                onSelectRequest={handleSelectRequest}
              />

              <DragOverlay>
                {activeDragLabel ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-lg">
                    {activeDragLabel.type === "folder" ? (
                      <Folder className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="max-w-xs truncate">{activeDragLabel.label}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        <Sheet open={isCreateSheetOpen} onOpenChange={handleCreateSheetOpenChange}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetHeader>
              <SheetTitle>Create purchase request</SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="use_custom"
                  checked={createFormState.use_custom}
                  onCheckedChange={(checked) =>
                    setCreateFormState({
                      ...createFormState,
                      use_custom: checked,
                      component_id: "",
                      item_name: "",
                    })
                  }
                />
                <Label htmlFor="use_custom" className="text-sm font-medium">
                  Custom item (not in component list)
                </Label>
              </div>
              {createFormState.use_custom ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Item name *</label>
                  <Input
                    value={createFormState.item_name}
                    onChange={(e) =>
                      setCreateFormState({ ...createFormState, item_name: e.target.value })
                    }
                    placeholder="Custom item or component name"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Component *</label>
                  <ComponentAsyncSelect
                    value={createFormState.component_id}
                    onChange={(id) =>
                      setCreateFormState({ ...createFormState, component_id: id })
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Quantity</label>
                <Input
                  type="number"
                  value={createFormState.quantity}
                  onChange={(e) =>
                    setCreateFormState({ ...createFormState, quantity: e.target.value })
                  }
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  value={createFormState.description}
                  onChange={(e) =>
                    setCreateFormState({ ...createFormState, description: e.target.value })
                  }
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Additional details or specifications"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsCreateSheetOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={!!id} onOpenChange={(open) => (!open ? handleCloseSheet() : null)}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetHeader>
              <SheetTitle>{mode === "edit" ? "Edit request" : "Request details"}</SheetTitle>
            </SheetHeader>

            {isDetailLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : requestDetail ? (
              <div className="mt-6 space-y-4">
                {mode === "detail" ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        {requestDetail.component_id ? "Component" : "Item"}
                      </p>
                      {requestDetail.component_id ? (
                        <Link
                          to={`/store/component/${requestDetail.component_id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {requestDetail.component_name}
                        </Link>
                      ) : (
                        <p className="text-sm text-foreground">
                          {requestDetail.item_name || "Unknown item"}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Quantity
                        </p>
                        <p className="text-sm text-foreground">{requestDetail.quantity}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Requested by
                        </p>
                        <p className="text-sm text-foreground">
                          {requestDetail.requested_by_name || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Target location
                      </p>
                      <p className="text-sm text-foreground">
                        {requestDetail.target_location_name || "Not specified"}
                      </p>
                      {requestDetail.source?.type === "production" && requestDetail.source.bom_id ? (
                        <Link
                          to={`/production/bom/${requestDetail.source.bom_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Requested from a production BOM →
                        </Link>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">MPN</p>
                      <p className="text-sm text-foreground">{requestDetail.mfpn || "-"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Suppliers
                      </p>
                      <p className="text-sm text-foreground">
                        {suppliersTooltip(requestDetail.suppliers)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Description
                      </p>
                      <p className="text-sm text-foreground">
                        {requestDetail.description || "No description."}
                      </p>
                    </div>
                    {canEdit && (
                      <Button className="mt-2 w-full gap-2" onClick={() => handleEditMode("edit")}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Quantity</label>
                      <Input
                        type="number"
                        value={formState.quantity}
                        onChange={(e) =>
                          setFormState({ ...formState, quantity: e.target.value })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Target warehouse or position
                      </label>
                      <LocationParentSelect
                        locations={targetTree}
                        value={formState.target_location || null}
                        onChange={(value) => setFormState({ ...formState, target_location: value ?? "" })}
                        placeholder="Select target location"
                        emptyLabel="Not specified"
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
                        placeholder="Request description"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleEditMode("detail")}
                        disabled={updateMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">
                Request details are not available.
              </p>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}
