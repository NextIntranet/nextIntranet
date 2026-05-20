import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { apiFetch } from "@nextintranet/core"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import Select, { type SingleValue, type MultiValue } from "react-select"
import type { StylesConfig } from "react-select"

import { LocationParentSelect } from "@/components/LocationParentSelect"
import { PacketOperationSheet } from "@/components/PacketOperationSheet"
import { PriceLabel } from "@/components/PriceLabel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExtensionPoint } from "@/plugins/ExtensionPoint"
import { PrintActions } from "@/components/PrintActions"
import { getOperationLabel } from "@/lib/stockOperations"
import { setScannerCapture } from "@/lib/scannerCapture"
import { IDENTIFIER_SCHEME_OPTIONS } from "@/lib/identifierSchemes"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface PacketComponent {
  id: string
  name: string
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
  is_active?: boolean
  created_at: string
  date_added?: string
  component: PacketComponent
  location?: PacketLocation | null
  external_identifiers?: ExternalIdentifier[]
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
                          {getOperationLabel(operation.operation_type)}
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
                onChange={(option: SingleValue<{ value: string; label: string }> | MultiValue<{ value: string; label: string }>) => {
                  const single = Array.isArray(option) ? option[0] : option
                  setIdentifierForm({ ...identifierForm, scheme: single?.value ?? "" })
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
