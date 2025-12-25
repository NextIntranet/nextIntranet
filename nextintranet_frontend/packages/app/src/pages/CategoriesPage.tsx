import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { ChevronRight, Pencil } from "lucide-react"
import { toast } from "sonner"

import { CategoryParentSelect } from "@/components/CategoryParentSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface CategoryNode {
  id: string
  name: string
  abbreviation?: string | null
  description?: string | null
  color?: string | null
  icon?: string | null
  parent?: string | null
  children?: CategoryNode[]
}

interface CategoryDetail {
  id: string
  name: string
  abbreviation?: string | null
  description?: string | null
  color?: string | null
  icon?: string | null
  parent?: string | null
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type FlatCategory = CategoryNode & {
  depth: number
  hasChildren: boolean
  full_path: string
}

type EditMode = "detail" | "edit"

const flattenTree = (
  nodes: CategoryNode[],
  expanded: Set<string>,
  depth = 0,
  parentPath = "",
): FlatCategory[] => {
  const rows: FlatCategory[] = []
  nodes.forEach((node) => {
    const fullPath = parentPath ? `${parentPath} / ${node.name}` : node.name
    const hasChildren = !!node.children && node.children.length > 0
    rows.push({ ...node, depth, hasChildren, full_path: fullPath })
    if (hasChildren && expanded.has(node.id)) {
      rows.push(...flattenTree(node.children || [], expanded, depth + 1, fullPath))
    }
  })
  return rows
}

const collectExpandableIds = (nodes: CategoryNode[]): string[] => {
  const ids: string[] = []
  nodes.forEach((node) => {
    if (node.children && node.children.length > 0) {
      ids.push(node.id, ...collectExpandableIds(node.children))
    }
  })
  return ids
}

const findNodeById = (nodes: CategoryNode[], targetId: string): CategoryNode | null => {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }
    if (node.children?.length) {
      const match = findNodeById(node.children, targetId)
      if (match) {
        return match
      }
    }
  }
  return null
}

const buildPathMap = (nodes: CategoryNode[], parentPath = "", map = new Map<string, string>()) => {
  nodes.forEach((node) => {
    const fullPath = parentPath ? `${parentPath} / ${node.name}` : node.name
    map.set(node.id, fullPath)
    if (node.children?.length) {
      buildPathMap(node.children, fullPath, map)
    }
  })
  return map
}

export function CategoriesPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mode: EditMode = searchParams.get("mode") === "edit" ? "edit" : "detail"
  const [expandedIds, setExpandedIds] = useState<string[]>([])

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: categoriesTree, isLoading: isTreeLoading } = useQuery<CategoryNode[]>({
    queryKey: ["categories-tree"],
    queryFn: () => apiFetch<CategoryNode[]>("/api/v1/store/category/tree/"),
  })

  const { data: categoryDetail, isLoading: isDetailLoading } = useQuery<CategoryDetail>({
    queryKey: ["category", id],
    queryFn: () => apiFetch<CategoryDetail>(`/api/v1/store/category/${id}/`),
    enabled: !!id,
  })

  useEffect(() => {
    if (categoriesTree && expandedIds.length === 0) {
      setExpandedIds(collectExpandableIds(categoriesTree))
    }
  }, [categoriesTree, expandedIds.length])

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds])
  const flatCategories = useMemo(
    () => flattenTree(categoriesTree || [], expandedSet),
    [categoriesTree, expandedSet],
  )
  const pathMap = useMemo(
    () => buildPathMap(categoriesTree || []),
    [categoriesTree],
  )

  const [formState, setFormState] = useState({
    name: "",
    abbreviation: "",
    description: "",
    parent: "",
    color: "",
    icon: "",
  })

  useEffect(() => {
    if (!categoryDetail) {
      return
    }
    setFormState({
      name: categoryDetail.name || "",
      abbreviation: categoryDetail.abbreviation || "",
      description: categoryDetail.description || "",
      parent: categoryDetail.parent || "",
      color: categoryDetail.color || "",
      icon: categoryDetail.icon || "",
    })
  }, [categoryDetail?.id])

  const parentCategory = useMemo(() => {
    if (!categoryDetail?.parent || !categoriesTree) {
      return null
    }
    return findNodeById(categoriesTree, categoryDetail.parent)
  }, [categoryDetail?.parent, categoriesTree])

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CategoryDetail>) =>
      apiFetch(`/api/v1/store/category/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories-tree"] })
      queryClient.invalidateQueries({ queryKey: ["category", id] })
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete("mode")
        return next
      })
      toast.success("Category updated.")
    },
    onError: () => {
      toast.error("Failed to update category.")
    },
  })

  const handleToggle = (categoryId: string) => {
    setExpandedIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    )
  }

  const handleOpen = (categoryId: string) => {
    navigate(`/store/category/${categoryId}`)
  }

  const handleCloseSheet = () => {
    setSearchParams(new URLSearchParams())
    navigate("/store/category", { replace: true })
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
    updateMutation.mutate({
      name: formState.name.trim(),
      abbreviation: formState.abbreviation.trim() || null,
      description: formState.description.trim() || null,
      parent: formState.parent || null,
      color: formState.color.trim() || null,
      icon: formState.icon.trim() || null,
    })
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Categories</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage the category hierarchy.
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
                ) : flatCategories.length ? (
                  flatCategories.map((row) => (
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
                              aria-label={expandedSet.has(row.id) ? "Collapse" : "Expand"}
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform ${
                                  expandedSet.has(row.id) ? "rotate-90" : ""
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
                          {row.color && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex h-3 w-3 rounded-full"
                                  style={{ backgroundColor: row.color }}
                                />
                              </TooltipTrigger>
                              <TooltipContent>{row.color}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                        {row.full_path}
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
                          "-"
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
                      No categories found.
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
              <SheetTitle>{mode === "edit" ? "Edit category" : "Category details"}</SheetTitle>
            </SheetHeader>

            {isDetailLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : categoryDetail ? (
              <div className="mt-6 space-y-4">
                {mode === "detail" ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
                      <p className="text-sm text-foreground">{categoryDetail.name}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Full path
                        </p>
                        <p className="text-sm text-foreground">
                          {pathMap.get(categoryDetail.id) || categoryDetail.name}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Parent
                        </p>
                        {parentCategory ? (
                          <button
                            type="button"
                            onClick={() => handleOpen(parentCategory.id)}
                            className="text-left text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {parentCategory.name}
                          </button>
                        ) : (
                          <p className="text-sm text-muted-foreground">-</p>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Abbreviation
                        </p>
                        <p className="text-sm text-foreground">
                          {categoryDetail.abbreviation || "-"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Color
                        </p>
                        <p className="text-sm text-foreground">{categoryDetail.color || "-"}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Icon</p>
                        <p className="text-sm text-foreground">{categoryDetail.icon || "-"}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Description
                      </p>
                      <p className="text-sm text-foreground">
                        {categoryDetail.description || "No description."}
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
                      <label className="text-sm font-medium text-foreground">Name</label>
                      <Input
                        value={formState.name}
                        onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                        placeholder="Category name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Parent</label>
                      <CategoryParentSelect
                        categories={categoriesTree || []}
                        value={formState.parent || null}
                        onChange={(nextValue) =>
                          setFormState({ ...formState, parent: nextValue || "" })
                        }
                        excludeId={categoryDetail.id}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Abbreviation</label>
                        <Input
                          value={formState.abbreviation}
                          onChange={(e) =>
                            setFormState({ ...formState, abbreviation: e.target.value })
                          }
                          placeholder="short-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Color</label>
                        <Input
                          value={formState.color}
                          onChange={(e) => setFormState({ ...formState, color: e.target.value })}
                          placeholder="#AABBCC"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Icon</label>
                      <Input
                        value={formState.icon}
                        onChange={(e) => setFormState({ ...formState, icon: e.target.value })}
                        placeholder="icon-name"
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
                        placeholder="Category description"
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
                Category details are not available.
              </p>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}
