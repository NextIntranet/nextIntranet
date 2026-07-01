import React, { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { apiFetch } from "@nextintranet/core"
import { ArrowDownCircle, ArrowUpCircle, Copy, ExternalLink, Pencil, Plus, RefreshCw, Share2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import Select, { type SingleValue } from "react-select"
import type { StylesConfig } from "react-select"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { LocationDisplay } from "@/components/LocationDisplay"
import { LocationParentSelect } from "@/components/LocationParentSelect"
import { PacketOperationSheet } from "@/components/PacketOperationSheet"
import { PriceLabel } from "@/components/PriceLabel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExtensionPoint } from "@/plugins/ExtensionPoint"
import { PrintActions } from "@/components/PrintActions"
import { getOperationFlow, getOperationLabel } from "@/lib/stockOperations"
import { setScannerCapture } from "@/lib/scannerCapture"
import { IDENTIFIER_SCHEME_OPTIONS } from "@/lib/identifierSchemes"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface PacketComponent {
  id: string
  name: string
  internal_price?: number | null
}

interface PacketLocation {
  id: string
  full_path: string
  description?: string | null
}

interface ExternalIdentifier {
  id: string
  scheme: string
  identifier: string
}

interface PacketDetail {
  id: string
  description?: string | null
  count?: number | null
  itemValue?: number | null
  totalValue?: number | null
  price_source?: "fifo" | "internal" | "internal_missing" | "unknown" | null
  is_active?: boolean
  created_at: string
  date_added?: string
  component: PacketComponent
  location?: PacketLocation | null
  external_identifiers?: ExternalIdentifier[]
}

interface StockOperationMetadata {
  production_id?: string | null
  supplier_relation_id?: string | null
  counted_quantity?: number | null
  recorded_quantity?: number | null
  counted_price?: number | null
}

interface StockOperation {
  id: string
  operation_type: string
  quantity: number
  relative_quantity?: boolean
  unit_price?: number | null
  timestamp: string
  description?: string | null
  author_name?: string | null
  metadata?: StockOperationMetadata | null
}

interface PacketHistoryEntry {
  timestamp: string
  quantity: number
}

interface PacketHistoryResponse {
  history: PacketHistoryEntry[]
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

function OperationTypeIcon({ operationType }: { operationType: string }) {
  const flow = getOperationFlow(operationType)
  if (flow === "in") return <ArrowDownCircle className="h-4 w-4 shrink-0 text-emerald-600" />
  if (flow === "out") return <ArrowUpCircle className="h-4 w-4 shrink-0 text-red-600" />
  return <RefreshCw className="h-4 w-4 shrink-0 text-muted-foreground" />
}

function OperationMetaCell({ op }: { op: StockOperation }) {
  const m = op.metadata
  if (!m) return <>-</>
  const parts: React.ReactNode[] = []

  if (m.production_id) {
    parts.push(
      <Tooltip key="prod">
        <TooltipTrigger asChild>
          <Link to={`/production/${m.production_id}`} className="text-primary text-xs hover:underline underline-offset-2">
            Production run →
          </Link>
        </TooltipTrigger>
        <TooltipContent>Open production run {m.production_id}</TooltipContent>
      </Tooltip>
    )
  }
  if (m.counted_quantity != null) {
    parts.push(
      <Tooltip key="cnt">
        <TooltipTrigger asChild>
          <span className="text-xs cursor-default">Counted: {m.counted_quantity}</span>
        </TooltipTrigger>
        <TooltipContent>Physical quantity counted during inventory</TooltipContent>
      </Tooltip>
    )
  }
  if (m.recorded_quantity != null) {
    parts.push(
      <Tooltip key="rec">
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-default">(was: {m.recorded_quantity})</span>
        </TooltipTrigger>
        <TooltipContent>Quantity recorded in the system before this inventory operation</TooltipContent>
      </Tooltip>
    )
  }
  if (m.counted_price != null) {
    parts.push(
      <Tooltip key="price">
        <TooltipTrigger asChild>
          <span className="text-xs cursor-default">Price: {m.counted_price}</span>
        </TooltipTrigger>
        <TooltipContent>Unit price snapshotted at the time of this inventory count</TooltipContent>
      </Tooltip>
    )
  }
  if (m.supplier_relation_id) {
    parts.push(
      <Tooltip key="sr">
        <TooltipTrigger asChild>
          <span className="text-xs text-muted-foreground cursor-default">
            Supplier rel: {m.supplier_relation_id.slice(0, 8)}…
          </span>
        </TooltipTrigger>
        <TooltipContent>Supplier relation ID: {m.supplier_relation_id}</TooltipContent>
      </Tooltip>
    )
  }
  if (parts.length === 0) return <>-</>
  return <div className="flex flex-col gap-0.5">{parts}</div>
}

export function PacketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [editMode, setEditMode] = useState(false)
  const [operationSheetOpen, setOperationSheetOpen] = useState(false)
  const [identifierSheetOpen, setIdentifierSheetOpen] = useState(false)
  const [identifierForm, setIdentifierForm] = useState({ scheme: "", identifier: "" })
  const identifierInputRef = useRef<HTMLInputElement>(null)

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.some(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const identifierSelectStyles: StylesConfig<{ value: string; label: string }, false> = {
    control: (base, state) => ({
      ...base,
      backgroundColor: "hsl(var(--background))",
      borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
      minHeight: "2.25rem",
    }),
    menu: (base) => ({ ...base, zIndex: 30 }),
  }

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

  const { data: historyData, isLoading: isHistoryLoading } = useQuery<PacketHistoryResponse>({
    queryKey: ["packet-history", id],
    queryFn: () => apiFetch<PacketHistoryResponse>(`/api/v1/store/packet/${id}/history/`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    description: "",
    location: "",
    isActive: true,
  })

  useEffect(() => {
    if (!packet) {
      return
    }
    setFormState({
      description: packet.description || "",
      location: packet.location?.id || "",
      isActive: packet.is_active ?? true,
    })
  }, [packet?.id])

  useEffect(() => {
    if (!identifierSheetOpen) return
    setScannerCapture((text) => {
      setIdentifierForm((prev) => ({ ...prev, identifier: text }))
    })
    return () => setScannerCapture(null)
  }, [identifierSheetOpen])

  useEffect(() => {
    if (!identifierSheetOpen) return
    const t = setTimeout(() => identifierInputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [identifierSheetOpen])

  const updateMutation = useMutation({
    mutationFn: (payload: { description?: string | null; location?: string | null; is_active?: boolean }) =>
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

  const createIdentifierMutation = useMutation({
    mutationFn: (payload: { scheme: string; identifier: string }) =>
      apiFetch<ExternalIdentifier>(`/api/v1/store/packet/${id}/identifiers/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packet", id] })
      setIdentifierSheetOpen(false)
      setIdentifierForm({ scheme: "", identifier: "" })
      toast.success("External identifier added.")
    },
    onError: () => {
      toast.error("Failed to add external identifier.")
    },
  })

  const deleteIdentifierMutation = useMutation({
    mutationFn: (identifierId: string) =>
      apiFetch(`/api/v1/store/packet/${id}/identifiers/${identifierId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packet", id] })
      toast.success("External identifier removed.")
    },
    onError: () => {
      toast.error("Failed to remove external identifier.")
    },
  })

  const handleSave = () => {
    if (!id) {
      return
    }
    updateMutation.mutate({
      description: formState.description.trim() || null,
      location: formState.location || null,
      is_active: formState.isActive,
    })
  }

  const identifierColumns = useMemo<ColumnDef<ExternalIdentifier>[]>(() => {
    const cols: ColumnDef<ExternalIdentifier>[] = [
      {
        id: "scheme",
        header: "Scheme",
        cell: ({ row }) => {
          const scheme = row.original.scheme || ""
          const label =
            (IDENTIFIER_SCHEME_OPTIONS.find((o) => o.value === scheme)?.label ?? scheme) || "Internal"
          return <span className="text-sm text-foreground">{label}</span>
        },
      },
      {
        accessorKey: "identifier",
        header: "Identifier",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-foreground">{row.original.identifier}</span>
        ),
      },
    ]
    if (canEdit) {
      cols.push({
        id: "delete",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteIdentifierMutation.mutate(row.original.id)}
            aria-label="Remove external identifier"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ),
      })
    }
    return cols
  }, [canEdit, deleteIdentifierMutation])

  const identifiersTable = useReactTable({
    data: packet?.external_identifiers ?? [],
    columns: identifierColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const formattedCount = packet?.count ?? 0
  const operationsList = useMemo(() => operations ?? [], [operations])

  const historyChartConfig = useMemo<ChartConfig>(
    () => ({
      quantity: { label: "Quantity", color: "var(--chart-1)" },
    }),
    [],
  )

  const historyDataPoints = useMemo(() => {
    if (!historyData?.history) {
      return []
    }
    const rows = historyData.history.map((entry) => {
      const parsedTimestamp = new Date(entry.timestamp).getTime()
      return {
        timestamp: Number.isNaN(parsedTimestamp) ? entry.timestamp : parsedTimestamp,
        quantity: entry.quantity,
      }
    })
    if (rows.length > 0) {
      rows.push({ ...rows[rows.length - 1], timestamp: Date.now() })
    }
    return rows
  }, [historyData?.history])

  const formatHistoryDate = (value: string | number) => {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString()
  }

  const formatHistoryDateTime = (value: string | number) => {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString()
  }
  const packetOptions = useMemo(
    () =>
      packet
        ? [
            {
              id: packet.id,
              label: packet.location?.full_path || packet.id,
              locationId: packet.location?.id || null,
              count: packet.count ?? null,
            },
          ]
        : [],
    [packet],
  )

  const handleCopy = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error("Unable to copy to clipboard.")
    }
  }

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
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">ID: {packet.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground [&_svg]:size-3.5"
                    onClick={() => handleCopy(packet.id, "Packet ID copied.")}
                  >
                    <Copy />
                    <span className="sr-only">Copy ID</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy ID</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground [&_svg]:size-3.5"
                    onClick={() => handleCopy(window.location.href, "Link copied.")}
                  >
                    <Share2 />
                    <span className="sr-only">Share link</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy link</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExtensionPoint name="packets.actions" context={{ packetId: packet.id }} />
            <PrintActions targetType="packet" targetId={packet.id} label={packet.id} compact />
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
              {packet?.price_source && (
                <p className="mt-1">
                  <span className={[
                    "text-xs rounded px-1.5 py-0.5",
                    packet.price_source === "fifo" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                    packet.price_source === "internal" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                    packet.price_source === "internal_missing" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                    "bg-muted text-muted-foreground"
                  ].join(" ")}>
                    {packet.price_source === "fifo" && "Purchase (FIFO)"}
                    {packet.price_source === "internal" && "Internal price"}
                    {packet.price_source === "internal_missing" && "⚠ Internal price (not applied)"}
                    {packet.price_source === "unknown" && "No price"}
                  </span>
                </p>
              )}
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
                        <LocationDisplay
                          location={packet.location}
                          showInlineDescription
                          labelClassName="text-right"
                        />
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
                <span className="text-muted-foreground">Status</span>
                {editMode ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formState.isActive}
                      onCheckedChange={(checked) =>
                        setFormState({ ...formState, isActive: checked })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      {formState.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                ) : (
                  <span className="text-foreground">
                    {packet.is_active === false ? "Inactive" : "Active"}
                  </span>
                )}
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

        <div className="mt-4 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">History levels</h2>
          {isHistoryLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : historyDataPoints.length ? (
            <ChartContainer config={historyChartConfig} className="h-[280px] w-full">
              <AreaChart data={historyDataPoints} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatHistoryDate}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => Number(value).toLocaleString()}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelKey="timestamp"
                      labelFormatter={(_, payload) =>
                        formatHistoryDateTime(payload?.[0]?.payload?.timestamp ?? "")
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="quantity"
                  stroke="var(--color-quantity)"
                  fill="var(--color-quantity)"
                  fillOpacity={0.3}
                  dot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No history data is available yet.</p>
          )}
        </div>

        <section className="mt-4 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">External identifiers</h2>
              <p className="text-sm text-muted-foreground">
                EAN, SKU, supplier codes and other barcodes for scanning and search.
              </p>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIdentifierSheetOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add identifier
              </Button>
            )}
          </div>
          {(packet?.external_identifiers?.length ?? 0) > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border/70">
              <Table>
                <TableHeader className="bg-muted/40">
                  {identifiersTable.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {identifiersTable.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              No external identifiers.
            </p>
          )}
        </section>

        <div className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-foreground">Operations</h2>
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOperationSheetOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add operation
              </Button>
            )}
          </div>
          {operationsLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : operationsList.length ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table className="w-full table-fixed">
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border/50">
                      <TableHead className="h-9 w-[12%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Type
                      </TableHead>
                      <TableHead className="h-9 w-[8%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Qty
                      </TableHead>
                      <TableHead className="h-9 w-[12%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Price
                      </TableHead>
                      <TableHead className="h-9 w-[16%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Date / Author
                      </TableHead>
                      <TableHead className="h-9 w-[22%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Description
                      </TableHead>
                      <TableHead className="h-9 w-[22%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Details
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operationsList.map((operation) => {
                      const flow = getOperationFlow(operation.operation_type)
                      return (
                      <TableRow key={operation.id} className="border-border/40">
                        <TableCell className="h-9 px-3 text-sm text-foreground">
                          <div className="flex items-center gap-1.5" title={getOperationLabel(operation.operation_type)}>
                            <OperationTypeIcon operationType={operation.operation_type} />
                            <span className="truncate">{getOperationLabel(operation.operation_type)}</span>
                          </div>
                        </TableCell>
                        <TableCell
                          className={
                            "h-9 px-3 text-sm font-bold " +
                            (flow === "in" ? "text-emerald-600" : flow === "out" ? "text-red-600" : "text-foreground")
                          }
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">
                                {flow === "in" ? "+" : flow === "out" ? "−" : ""}
                                {operation.quantity}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {operation.relative_quantity === false
                                ? `Absolute count set to ${operation.quantity}`
                                : `Relative change: ${flow === "in" ? "+" : flow === "out" ? "−" : ""}${operation.quantity}`}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-sm align-top">
                          {operation.unit_price != null && operation.unit_price > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="font-medium text-foreground cursor-default">{operation.unit_price.toFixed(2)}</span>
                                </TooltipTrigger>
                                <TooltipContent>Unit price recorded on this operation</TooltipContent>
                              </Tooltip>
                              {packet?.itemValue != null && packet.itemValue > 0 && (() => {
                                const diff = operation.unit_price - Number(packet.itemValue)
                                if (Math.abs(diff) < 0.001) return null
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className={diff > 0 ? "text-xs text-red-500 cursor-default" : "text-xs text-emerald-600 cursor-default"}>
                                        {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Difference vs. current unit value ({Number(packet.itemValue).toFixed(2)})
                                    </TooltipContent>
                                  </Tooltip>
                                )
                              })()}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                          <div className="flex flex-col gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">{new Date(operation.timestamp).toLocaleString()}</span>
                              </TooltipTrigger>
                              <TooltipContent>{operation.timestamp}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground/80 cursor-default">{operation.author_name || "-"}</span>
                              </TooltipTrigger>
                              <TooltipContent>{operation.author_name ? `Recorded by ${operation.author_name}` : "No author recorded"}</TooltipContent>
                            </Tooltip>
                          </div>
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
                        <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                          <div className="flex flex-col gap-0.5">
                            <OperationMetaCell op={operation} />
                            {user?.is_superuser && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`/admin/nextintranet_warehouse/stockoperation/${operation.id}/change/`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors w-fit"
                                  >
                                    <ExternalLink className="h-2.5 w-2.5" />
                                    admin
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent>Open in Django admin</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No operations available.</div>
            )}
        </div>
      </div>

      <Sheet open={identifierSheetOpen} onOpenChange={setIdentifierSheetOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>Add external identifier</SheetTitle>
            <SheetDescription>
              Add an EAN, SKU, supplier code or other barcode. When this sheet is open, scanner and RFID input are locked to the Code field—scan to fill it.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Scheme</label>
              <Select
                classNamePrefix="rs"
                options={IDENTIFIER_SCHEME_OPTIONS}
                value={IDENTIFIER_SCHEME_OPTIONS.find((o) => o.value === identifierForm.scheme) ?? null}
                placeholder="Select type"
                styles={identifierSelectStyles}
                onChange={(option: SingleValue<{ value: string; label: string }>) => {
                  setIdentifierForm({ ...identifierForm, scheme: option?.value ?? "" })
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Code</label>
              <Input
                ref={identifierInputRef}
                value={identifierForm.identifier}
                onChange={(e) =>
                  setIdentifierForm({ ...identifierForm, identifier: e.target.value.trim() })
                }
                placeholder="Scan or type e.g. 8591234567890 or SUP-CODE-001"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setIdentifierSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createIdentifierMutation.mutate({
                  scheme: identifierForm.scheme,
                  identifier: identifierForm.identifier,
                })
              }
              disabled={
                !identifierForm.identifier.trim() || createIdentifierMutation.isPending
              }
            >
              {createIdentifierMutation.isPending ? "Adding..." : "Add identifier"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PacketOperationSheet
        open={operationSheetOpen}
        onOpenChange={setOperationSheetOpen}
        packetOptions={packetOptions}
        initialPacketId={packet?.id}
        showPacketSelect={false}
        componentId={packet?.component.id}
        onOperationCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["packet-operations", id] })
          queryClient.invalidateQueries({ queryKey: ["packet", id] })
        }}
      />

    </TooltipProvider>
  )
}
