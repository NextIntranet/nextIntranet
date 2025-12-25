import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Pencil } from "lucide-react"
import { toast } from "sonner"

import { LocationParentSelect } from "@/components/LocationParentSelect"
import { PriceLabel } from "@/components/PriceLabel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PacketComponent {
  id: string
  name: string
}

interface PacketLocation {
  id: string
  full_path: string
  description?: string | null
}

interface PacketDetail {
  id: string
  description?: string | null
  count?: number | null
  itemValue?: number | null
  totalValue?: number | null
  created_at: string
  date_added?: string
  component: PacketComponent
  location?: PacketLocation | null
}

interface StockOperation {
  id: string
  operation_type: string
  quantity: number
  timestamp: string
  description?: string | null
}

interface LocationNode {
  id: string
  name: string
  full_path: string
  children?: LocationNode[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

export function PacketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.some(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const { data: packet, isLoading, error } = useQuery<PacketDetail>({
    queryKey: ["packet", id],
    queryFn: () => apiFetch<PacketDetail>(`/api/v1/store/packet/${id}/`),
    enabled: !!id,
  })

  const { data: locationsTree } = useQuery<LocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
    enabled: canEdit,
  })

  const { data: operations, isLoading: operationsLoading } = useQuery<StockOperation[]>({
    queryKey: ["packet-operations", id],
    queryFn: () =>
      apiFetch<StockOperation[]>(`/api/v1/store/packet/operation/?packet=${id}`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    description: "",
    location: "",
  })

  useEffect(() => {
    if (!packet) {
      return
    }
    setFormState({
      description: packet.description || "",
      location: packet.location?.id || "",
    })
  }, [packet?.id])

  const updateMutation = useMutation({
    mutationFn: (payload: { description?: string | null; location?: string | null }) =>
      apiFetch(`/api/v1/store/packet/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packet", id] })
      setEditMode(false)
      toast.success("Packet updated.")
    },
    onError: () => {
      toast.error("Failed to update packet.")
    },
  })

  const handleSave = () => {
    if (!id) {
      return
    }
    updateMutation.mutate({
      description: formState.description.trim() || null,
      location: formState.location || null,
    })
  }

  const formattedCount = packet?.count ?? 0
  const operationsList = useMemo(() => operations ?? [], [operations])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (error || !packet) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
        <Card className="border-destructive/60 bg-destructive/10 text-destructive">
          <CardHeader>
            <CardTitle>Packet not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive/80">
            Please refresh the page or try again later.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">Packet</h1>
            <p className="text-sm text-muted-foreground">ID: {packet.id}</p>
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode((prev) => !prev)}
            >
              <Pencil className="h-4 w-4" />
              {editMode ? "Cancel" : "Edit"}
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Quantity</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formattedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Unit value</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                <PriceLabel value={packet?.itemValue ?? null} />
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Total value</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                <PriceLabel value={packet?.totalValue ?? null} />
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
                <span className="text-muted-foreground">Component</span>
                <Link
                  to={`/store/component/${packet.component.id}`}
                  className="text-primary hover:underline"
                >
                  {packet.component.name}
                </Link>
              </div>
              <div className="rounded-lg border border-border/70 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Location</span>
                  <div className="text-right">
                    {!editMode ? (
                      packet.location ? (
                        <div className="space-y-1">
                          <Link
                            to={`/store/location/${packet.location.id}`}
                            className="text-primary hover:underline"
                          >
                            {packet.location.full_path}
                          </Link>
                          {packet.location.description && (
                            <div className="text-xs text-muted-foreground">
                              {packet.location.description}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )
                    ) : (
                      <div className="min-w-[220px]">
                        <LocationParentSelect
                          locations={locationsTree || []}
                          value={formState.location || null}
                          onChange={(value) =>
                            setFormState({ ...formState, location: value || "" })
                          }
                          emptyLabel="No location"
                          placeholder="Select location"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">
                  {new Date(packet.created_at || packet.date_added || "").toLocaleString()}
                </span>
              </div>
              {editMode && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {editMode ? (
                <textarea
                  value={formState.description}
                  onChange={(e) =>
                    setFormState({ ...formState, description: e.target.value })
                  }
                  className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Packet description"
                />
              ) : (
                <p className="text-sm text-foreground">
                  {packet.description || "No description."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Operations</CardTitle>
          </CardHeader>
          <CardContent>
            {operationsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : operationsList.length ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table className="w-full table-fixed">
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border/50">
                      <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Type
                      </TableHead>
                      <TableHead className="h-9 w-[15%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Quantity
                      </TableHead>
                      <TableHead className="h-9 w-[25%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </TableHead>
                      <TableHead className="h-9 w-[40%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Description
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operationsList.map((operation) => (
                      <TableRow key={operation.id} className="border-border/40">
                        <TableCell className="h-9 px-3 text-sm text-foreground">
                          {operation.operation_type}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-foreground">
                          {operation.quantity}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {new Date(operation.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                          {operation.description ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block whitespace-normal break-words leading-relaxed">
                                  {operation.description}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{operation.description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No operations available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
