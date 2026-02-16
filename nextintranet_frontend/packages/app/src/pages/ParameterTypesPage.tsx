import { useEffect, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Pencil, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type ParameterValueType = "text" | "number" | "bool"

interface ParameterType {
  id: string
  name: string
  description?: string | null
  special_meaning?: boolean
  unit?: string | null
  value_type?: ParameterValueType
  format_with_si_prefix?: boolean
  validation_min?: number | null
  validation_max?: number | null
  validation_regex?: string | null
  validation_values?: string | null
}

interface PaginatedParameterTypes {
  results: ParameterType[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type EditMode = "detail" | "edit"

export function ParameterTypesPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const mode: EditMode = searchParams.get("mode") === "edit" ? "edit" : "detail"

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: parameterTypesData, isLoading: isParameterTypesLoading } = useQuery<
    ParameterType[] | PaginatedParameterTypes
  >({
    queryKey: ["parameter-types"],
    queryFn: () =>
      apiFetch<ParameterType[] | PaginatedParameterTypes>(
        "/api/v1/store/parameterTypes/?page_size=1000",
      ),
  })

  const parameterTypes = Array.isArray(parameterTypesData)
    ? parameterTypesData
    : parameterTypesData?.results || []

  const { data: parameterTypeDetail, isLoading: isDetailLoading } = useQuery<ParameterType>({
    queryKey: ["parameter-type", id],
    queryFn: () => apiFetch<ParameterType>(`/api/v1/store/parameterTypes/${id}/`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    name: "",
    description: "",
    special_meaning: false,
    unit: "",
    value_type: "text" as ParameterValueType,
    format_with_si_prefix: false,
    validation_min: "",
    validation_max: "",
    validation_regex: "",
    validation_values: "",
  })

  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    special_meaning: false,
    unit: "",
    value_type: "text" as ParameterValueType,
    format_with_si_prefix: false,
    validation_min: "",
    validation_max: "",
    validation_regex: "",
    validation_values: "",
  })

  useEffect(() => {
    if (!parameterTypeDetail) {
      return
    }
    setFormState({
      name: parameterTypeDetail.name || "",
      description: parameterTypeDetail.description || "",
      special_meaning: Boolean(parameterTypeDetail.special_meaning),
      unit: parameterTypeDetail.unit || "",
      value_type: parameterTypeDetail.value_type || "text",
      format_with_si_prefix: Boolean(parameterTypeDetail.format_with_si_prefix),
      validation_min:
        parameterTypeDetail.validation_min !== null &&
        parameterTypeDetail.validation_min !== undefined
          ? String(parameterTypeDetail.validation_min)
          : "",
      validation_max:
        parameterTypeDetail.validation_max !== null &&
        parameterTypeDetail.validation_max !== undefined
          ? String(parameterTypeDetail.validation_max)
          : "",
      validation_regex: parameterTypeDetail.validation_regex || "",
      validation_values: parameterTypeDetail.validation_values || "",
    })
  }, [parameterTypeDetail?.id])

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<ParameterType>) =>
      apiFetch(`/api/v1/store/parameterTypes/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parameter-types"] })
      queryClient.invalidateQueries({ queryKey: ["parameter-type", id] })
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete("mode")
        return next
      })
      toast.success("Parameter type updated.")
    },
    onError: () => {
      toast.error("Failed to update parameter type.")
    },
  })

  const createMutation = useMutation({
    mutationFn: (payload: Partial<ParameterType>) =>
      apiFetch("/api/v1/store/parameterTypes/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parameter-types"] })
      setCreateOpen(false)
      setCreateForm({
        name: "",
        description: "",
        special_meaning: false,
        unit: "",
        value_type: "text",
        format_with_si_prefix: false,
        validation_min: "",
        validation_max: "",
        validation_regex: "",
        validation_values: "",
      })
      toast.success("Parameter type created.")
    },
    onError: () => {
      toast.error("Failed to create parameter type.")
    },
  })

  const handleOpen = (parameterTypeId: string) => {
    navigate(`/store/parameter-type/${parameterTypeId}`)
  }

  const handleCloseSheet = () => {
    setSearchParams(new URLSearchParams())
    navigate("/store/parameter-type", { replace: true })
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
      description: formState.description.trim() || null,
      special_meaning: formState.special_meaning,
      unit: formState.unit.trim() || null,
      value_type: formState.value_type,
      format_with_si_prefix:
        formState.value_type === "number" ? formState.format_with_si_prefix : false,
      validation_min: formState.validation_min.trim()
        ? Number(formState.validation_min)
        : null,
      validation_max: formState.validation_max.trim()
        ? Number(formState.validation_max)
        : null,
      validation_regex: formState.validation_regex.trim() || null,
      validation_values: formState.validation_values.trim() || null,
    })
  }

  const handleCreate = () => {
    createMutation.mutate({
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
      special_meaning: createForm.special_meaning,
      unit: createForm.unit.trim() || null,
      value_type: createForm.value_type,
      format_with_si_prefix:
        createForm.value_type === "number" ? createForm.format_with_si_prefix : false,
      validation_min: createForm.validation_min.trim()
        ? Number(createForm.validation_min)
        : null,
      validation_max: createForm.validation_max.trim()
        ? Number(createForm.validation_max)
        : null,
      validation_regex: createForm.validation_regex.trim() || null,
      validation_values: createForm.validation_values.trim() || null,
    })
  }

  const formValid = formState.name.trim() !== ""
  const createFormValid = createForm.name.trim() !== ""
  const getValueTypeLabel = (valueType?: ParameterValueType) => {
    if (valueType === "number") {
      return "Number"
    }
    if (valueType === "bool") {
      return "Boolean"
    }
    return "Text"
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Parameter types</h1>
          <p className="text-sm text-muted-foreground">
            Manage shared parameter definitions.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add parameter type
          </Button>
        )}
      </div>

      <div className="mt-4">
        <div className="overflow-hidden rounded-lg border border-border/70">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/50">
                <TableHead className="h-9 w-[24%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="h-9 w-[40%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Description
                </TableHead>
                <TableHead className="h-9 w-[16%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Unit
                </TableHead>
                <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  SI format
                </TableHead>
                <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Special meaning
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isParameterTypesLoading ? (
                <TableRow className="border-border/40">
                  <TableCell colSpan={6} className="py-8">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-5 w-2/3" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : parameterTypes.length ? (
                parameterTypes.map((parameterType) => (
                  <TableRow key={parameterType.id} className="border-border/40">
                    <TableCell className="h-9 px-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpen(parameterType.id)}
                        className="h-7 min-w-0 justify-start px-2 font-normal text-primary hover:underline"
                      >
                        <span className="truncate">{parameterType.name}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {parameterType.description || "-"}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {parameterType.unit || "-"}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {getValueTypeLabel(parameterType.value_type)}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {parameterType.value_type === "number"
                        ? parameterType.format_with_si_prefix
                          ? "Yes"
                          : "No"
                        : "-"}
                    </TableCell>
                    <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                      {parameterType.special_meaning ? "Yes" : "No"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border/40">
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No parameter types found.
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
              {mode === "edit" ? "Edit parameter type" : "Parameter type details"}
            </SheetTitle>
          </SheetHeader>

          {isDetailLoading ? (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : parameterTypeDetail ? (
            <div className="mt-6 space-y-4">
              {mode === "detail" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Name</p>
                    <p className="text-sm text-foreground">{parameterTypeDetail.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Description
                    </p>
                    <p className="text-sm text-foreground">
                      {parameterTypeDetail.description || "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Unit</p>
                    <p className="text-sm text-foreground">
                      {parameterTypeDetail.unit || "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Value type
                    </p>
                    <p className="text-sm text-foreground">
                      {getValueTypeLabel(parameterTypeDetail.value_type)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      SI format
                    </p>
                    <p className="text-sm text-foreground">
                      {parameterTypeDetail.value_type === "number"
                        ? parameterTypeDetail.format_with_si_prefix
                          ? "Enabled"
                          : "Disabled"
                        : "-"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Special meaning
                    </p>
                    <p className="text-sm text-foreground">
                      {parameterTypeDetail.special_meaning ? "Yes" : "No"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Validation rules
                    </p>
                    <p className="text-sm text-foreground">
                      {[
                        parameterTypeDetail.validation_min !== null &&
                        parameterTypeDetail.validation_min !== undefined
                          ? `min ${parameterTypeDetail.validation_min}`
                          : null,
                        parameterTypeDetail.validation_max !== null &&
                        parameterTypeDetail.validation_max !== undefined
                          ? `max ${parameterTypeDetail.validation_max}`
                          : null,
                        parameterTypeDetail.validation_regex
                          ? `regex ${parameterTypeDetail.validation_regex}`
                          : null,
                        parameterTypeDetail.validation_values
                          ? `values ${parameterTypeDetail.validation_values}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => handleEditMode("edit")}
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
                      placeholder="Parameter type name"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Unit</label>
                      <Input
                        value={formState.unit}
                        onChange={(e) => setFormState({ ...formState, unit: e.target.value })}
                        placeholder="e.g. Ohm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Value type</label>
                      <select
                        value={formState.value_type}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            value_type: e.target.value as ParameterValueType,
                            format_with_si_prefix:
                              e.target.value === "number"
                                ? formState.format_with_si_prefix
                                : false,
                          })
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="bool">Boolean</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <textarea
                      value={formState.description}
                      onChange={(e) =>
                        setFormState({ ...formState, description: e.target.value })
                      }
                      className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Parameter type description"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Min</label>
                      <Input
                        type="number"
                        value={formState.validation_min}
                        onChange={(e) =>
                          setFormState({ ...formState, validation_min: e.target.value })
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Max</label>
                      <Input
                        type="number"
                        value={formState.validation_max}
                        onChange={(e) =>
                          setFormState({ ...formState, validation_max: e.target.value })
                        }
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Regex</label>
                    <Input
                      value={formState.validation_regex}
                      onChange={(e) =>
                        setFormState({ ...formState, validation_regex: e.target.value })
                      }
                      placeholder="Optional regex pattern"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Allowed values
                    </label>
                    <Input
                      value={formState.validation_values}
                      onChange={(e) =>
                        setFormState({ ...formState, validation_values: e.target.value })
                      }
                      placeholder="Comma-separated values"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm text-foreground">
                    <span>Use SI prefix formatting</span>
                    <Switch
                      checked={formState.format_with_si_prefix}
                      onCheckedChange={(checked) =>
                        setFormState({ ...formState, format_with_si_prefix: checked })
                      }
                      disabled={formState.value_type !== "number"}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm text-foreground">
                    <span>Special meaning</span>
                    <Switch
                      checked={formState.special_meaning}
                      onCheckedChange={(checked) =>
                        setFormState({ ...formState, special_meaning: checked })
                      }
                    />
                  </label>
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
                      disabled={updateMutation.isPending || !formValid}
                    >
                      {updateMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">
              Parameter type details are not available.
            </p>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>Add parameter type</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Parameter type name"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Unit</label>
                <Input
                  value={createForm.unit}
                  onChange={(e) => setCreateForm({ ...createForm, unit: e.target.value })}
                  placeholder="e.g. Ohm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Value type</label>
                <select
                  value={createForm.value_type}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      value_type: e.target.value as ParameterValueType,
                      format_with_si_prefix:
                        e.target.value === "number" ? createForm.format_with_si_prefix : false,
                    })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="bool">Boolean</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Parameter type description"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Min</label>
                <Input
                  type="number"
                  value={createForm.validation_min}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, validation_min: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Max</label>
                <Input
                  type="number"
                  value={createForm.validation_max}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, validation_max: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Regex</label>
              <Input
                value={createForm.validation_regex}
                onChange={(e) =>
                  setCreateForm({ ...createForm, validation_regex: e.target.value })
                }
                placeholder="Optional regex pattern"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Allowed values
              </label>
              <Input
                value={createForm.validation_values}
                onChange={(e) =>
                  setCreateForm({ ...createForm, validation_values: e.target.value })
                }
                placeholder="Comma-separated values"
              />
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm text-foreground">
              <span>Use SI prefix formatting</span>
              <Switch
                checked={createForm.format_with_si_prefix}
                onCheckedChange={(checked) =>
                  setCreateForm({ ...createForm, format_with_si_prefix: checked })
                }
                disabled={createForm.value_type !== "number"}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 text-sm text-foreground">
              <span>Special meaning</span>
              <Switch
                checked={createForm.special_meaning}
                onCheckedChange={(checked) =>
                  setCreateForm({ ...createForm, special_meaning: checked })
                }
              />
            </label>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCreateOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreate}
                disabled={createMutation.isPending || !createFormValid}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
