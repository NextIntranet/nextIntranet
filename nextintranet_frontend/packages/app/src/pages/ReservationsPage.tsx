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
import { cn } from "@/lib/utils"

interface Reservation {
  id: string
  component_id: string
  component_name: string
  quantity: number
  priority?: string | null
  description?: string | null
  reserved_by?: string | null
  reservation_date: string
  created_at: string
}

interface PaginatedReservations {
  count: number
  next?: string | null
  previous?: string | null
  results: Reservation[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type EditMode = "detail" | "edit"

export function ReservationsPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mode: EditMode = searchParams.get("mode") === "edit" ? "edit" : "detail"
  const [page, setPage] = useState(Number(searchParams.get("page")) || 1)
  const [pageSize, setPageSize] = useState(() => {
    const urlPageSize = searchParams.get("page_size")
    return urlPageSize ? Number(urlPageSize) : 25
  })

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: reservationsData, isLoading: isReservationsLoading } = useQuery<
    Reservation[] | PaginatedReservations
  >({
    queryKey: ["reservations", page, pageSize],
    queryFn: () =>
      apiFetch<Reservation[] | PaginatedReservations>(
        `/api/v1/store/reservations/?page=${page}&page_size=${pageSize}`,
      ),
  })

  const reservations = Array.isArray(reservationsData)
    ? reservationsData
    : reservationsData?.results || []
  const totalCount = Array.isArray(reservationsData) ? reservations.length : reservationsData?.count || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    const params = new URLSearchParams(searchParams)
    if (page !== 1) {
      params.set("page", page.toString())
    } else {
      params.delete("page")
    }
    if (pageSize !== 25) {
      params.set("page_size", pageSize.toString())
    } else {
      params.delete("page_size")
    }
    setSearchParams(params, { replace: true })
  }, [page, pageSize, searchParams, setSearchParams])

  const { data: reservationDetail, isLoading: isDetailLoading } = useQuery<Reservation>({
    queryKey: ["reservation", id],
    queryFn: () => apiFetch<Reservation>(`/api/v1/store/reservation/${id}/`),
    enabled: !!id,
  })

  const [formState, setFormState] = useState({
    quantity: "",
    priority: "",
    description: "",
  })

  useEffect(() => {
    if (!reservationDetail) {
      return
    }
    setFormState({
      quantity: reservationDetail.quantity ? String(reservationDetail.quantity) : "",
      priority: reservationDetail.priority || "",
      description: reservationDetail.description || "",
    })
  }, [reservationDetail?.id])

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (permission) => permission.area === "warehouse" && ["write", "admin"].includes(permission.level),
    )

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<Reservation>) =>
      apiFetch(`/api/v1/store/reservation/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] })
      queryClient.invalidateQueries({ queryKey: ["reservation", id] })
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        next.delete("mode")
        return next
      })
      toast.success("Reservation updated.")
    },
    onError: () => {
      toast.error("Failed to update reservation.")
    },
  })

  const handleOpen = (reservationId: string) => {
    navigate(`/store/reservations/${reservationId}`)
  }

  const handleCloseSheet = () => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.delete("mode")
      return next
    })
    navigate("/store/reservations", { replace: true })
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
      priority: formState.priority.trim() || null,
      description: formState.description.trim() || null,
    })
  }

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value))
    setPage(1)
  }

  const maxVisible = 5
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2))
  let endPage = Math.min(totalPages, startPage + maxVisible - 1)

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1)
  }

  const pageNumbers = Array.from(
    { length: endPage - startPage + 1 },
    (_, index) => startPage + index,
  )

  const pageButtonClass = (active?: boolean, disabled?: boolean) =>
    cn(
      "flex h-9 min-w-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition",
      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active && "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
      disabled && "cursor-not-allowed opacity-60 hover:bg-background hover:text-foreground",
    )

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Reservations</h1>
            <p className="text-sm text-muted-foreground">
              Track reserved stock for warehouse components.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="overflow-hidden rounded-lg border border-border/70">
            <Table className="w-full table-fixed">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 w-[32%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Component
                  </TableHead>
                  <TableHead className="h-9 w-[16%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Quantity
                  </TableHead>
                  <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Reserved by
                  </TableHead>
                  <TableHead className="h-9 w-[32%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isReservationsLoading ? (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={4} className="py-8">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-1/2" />
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-2/3" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : reservations.length ? (
                  reservations.map((reservation) => (
                    <TableRow key={reservation.id} className="border-border/40">
                      <TableCell className="h-9 px-3">
                        <div className="flex min-w-0 flex-col">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpen(reservation.id)}
                            className="h-7 min-w-0 justify-start px-2 font-normal text-primary hover:underline"
                          >
                            <span className="truncate">{reservation.component_name}</span>
                          </Button>
                          <Link
                            to={`/store/component/${reservation.component_id}`}
                            className="px-2 text-xs text-muted-foreground hover:underline"
                          >
                            Open component
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-foreground">
                        {reservation.quantity}
                      </TableCell>
                      <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                        {reservation.reserved_by || "-"}
                      </TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
                        {reservation.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block whitespace-normal break-words leading-relaxed">
                                {reservation.description}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{reservation.description}</TooltipContent>
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
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No reservations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="page-size">
                Page size
              </label>
              <select
                id="page-size"
                value={pageSize}
                onChange={handlePageSizeChange}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className={pageButtonClass(false, page === 1)}
                title="First page"
              >
                «
              </button>
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
                className={pageButtonClass(false, page === 1)}
                title="Previous page"
              >
                ‹
              </button>
              {startPage > 1 && (
                <>
                  <button onClick={() => setPage(1)} className={pageButtonClass()}>
                    1
                  </button>
                  {startPage > 2 && <span className="px-1 text-muted-foreground">...</span>}
                </>
              )}
              {pageNumbers.map((num) => (
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
                  {endPage < totalPages - 1 && (
                    <span className="px-1 text-muted-foreground">...</span>
                  )}
                  <button onClick={() => setPage(totalPages)} className={pageButtonClass()}>
                    {totalPages}
                  </button>
                </>
              )}
              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
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
            </div>
          </div>
        )}

        <Sheet open={!!id} onOpenChange={(open) => (!open ? handleCloseSheet() : null)}>
          <SheetContent side="right" className="w-full max-w-lg">
            <SheetHeader>
              <SheetTitle>{mode === "edit" ? "Edit reservation" : "Reservation details"}</SheetTitle>
            </SheetHeader>

            {isDetailLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : reservationDetail ? (
              <div className="mt-6 space-y-4">
                {mode === "detail" ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Component</p>
                      <Link
                        to={`/store/component/${reservationDetail.component_id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {reservationDetail.component_name}
                      </Link>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Quantity
                        </p>
                        <p className="text-sm text-foreground">{reservationDetail.quantity}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Priority
                        </p>
                        <p className="text-sm text-foreground">
                          {reservationDetail.priority || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Reserved by
                      </p>
                      <p className="text-sm text-foreground">
                        {reservationDetail.reserved_by || "-"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Description
                      </p>
                      <p className="text-sm text-foreground">
                        {reservationDetail.description || "No description."}
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
                      <label className="text-sm font-medium text-foreground">Priority</label>
                      <Input
                        value={formState.priority}
                        onChange={(e) =>
                          setFormState({ ...formState, priority: e.target.value })
                        }
                        placeholder="Optional priority"
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
                        placeholder="Reservation notes"
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
                Reservation details are not available.
              </p>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}
