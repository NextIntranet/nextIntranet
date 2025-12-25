import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Pencil } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface SupplierSummary {
  id: string
  supplier_id: string
  supplier_name: string
  symbol?: string | null
}

interface PurchaseRequest {
  id: string
  component_id: string
  component_name: string
  quantity: number
  description?: string | null
  requested_by_name?: string | null
  purchase_id?: string | null
  suppliers?: SupplierSummary[]
  mfpn?: string | null
  matching_supplier_relation_id?: string | null
  created_at: string
}

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

  const mode: EditMode = searchParams.get("mode") === "edit" ? "edit" : "detail"

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

  const { data: requestDetail, isLoading: isDetailLoading } = useQuery<PurchaseRequest>({
    queryKey: ["purchase-request", id],
    queryFn: () => apiFetch<PurchaseRequest>(`/api/v1/store/purchase-request/${id}/`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    quantity: "",
    description: "",
  })

  useEffect(() => {
    if (!requestDetail) {
      return
    }
    setFormState({
      quantity: requestDetail.quantity ? String(requestDetail.quantity) : "",
      description: requestDetail.description || "",
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

  const handleOpen = (requestId: string) => {
    navigate(`/store/purchase-requests/${requestId}`)
  }

  const handleCloseSheet = () => {
    setSearchParams(new URLSearchParams())
    navigate("/store/purchase-requests", { replace: true })
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
    })
  }

  const renderSuppliers = (suppliers?: SupplierSummary[]) => {
    if (!suppliers || suppliers.length === 0) {
      return "-"
    }
    const names = suppliers.map((supplier) => supplier.supplier_name).filter(Boolean)
    const text = names.join(", ")
    return text.length > 42 ? `${text.slice(0, 42)}…` : text
  }

  const suppliersTooltip = useMemo(() => {
    return (suppliers?: SupplierSummary[]) => {
      if (!suppliers || suppliers.length === 0) {
        return "-"
      }
      return suppliers.map((supplier) => supplier.supplier_name).filter(Boolean).join(", ")
    }
  }, [])

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Purchase requests</h1>
            <p className="text-sm text-muted-foreground">
              Review open requests for purchasing components.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="overflow-hidden rounded-lg border border-border/70">
            <Table className="w-full table-fixed">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 w-[30%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Component
                  </TableHead>
                  <TableHead className="h-9 w-[12%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Qty
                  </TableHead>
                  <TableHead className="h-9 w-[18%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Requested by
                  </TableHead>
                  <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Suppliers
                  </TableHead>
                  <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isRequestsLoading ? (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={5} className="py-8">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-2/3" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : requests.length ? (
                  requests.map((request) => (
                    <TableRow key={request.id} className="border-border/40">
                      <TableCell className="h-9 px-3">
                        <div className="flex min-w-0 flex-col">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpen(request.id)}
                            className="h-7 min-w-0 justify-start px-2 font-normal text-primary hover:underline"
                          >
                            <span className="truncate">{request.component_name}</span>
                          </Button>
                          <Link
                            to={`/store/component/${request.component_id}`}
                            className="px-2 text-xs text-muted-foreground hover:underline"
                          >
                            Open component
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-foreground">
                        {request.quantity}
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                        {request.requested_by_name || "-"}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                        {request.suppliers && request.suppliers.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block whitespace-normal break-words leading-relaxed">
                                {renderSuppliers(request.suppliers)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {suppliersTooltip(request.suppliers)}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                        {request.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block whitespace-normal break-words leading-relaxed">
                                {request.description}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{request.description}</TooltipContent>
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
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No purchase requests found.
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
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Component</p>
                      <Link
                        to={`/store/component/${requestDetail.component_id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {requestDetail.component_name}
                      </Link>
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
