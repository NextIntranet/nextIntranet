import { useState } from "react"
import { Link } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { ArrowRight, Check, X } from "lucide-react"
import { toast } from "sonner"

import { ComponentRef } from "@/components/ComponentRef"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type TransferStatus = "open" | "done" | "cancelled"

interface TransferRequest {
  id: string
  created_at: string
  component_id: string
  component_name: string
  quantity: number
  source_warehouse: string
  source_warehouse_name: string
  target_location: string
  target_location_name: string
  status: TransferStatus
  note: string
  source?: { type?: string; bom_id?: string } | null
  requested_by_name?: string | null
  completed_at?: string | null
  completed_by_name?: string | null
}

interface Paginated<T> {
  results: T[]
  count: number
}

const STATUS_FILTERS: Array<{ value: TransferStatus | "all"; label: string }> = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
]

const headClass = "h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"

/** Requests to move stock between warehouses. Open ones hold stock in the source warehouse. */
export function TransfersPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<TransferStatus | "all">("open")

  const { data, isLoading } = useQuery<Paginated<TransferRequest>>({
    queryKey: ["transfers", status],
    queryFn: () => apiFetch<Paginated<TransferRequest>>(`/api/v1/store/transfers/?page_size=200&status=${status}`),
  })
  const transfers = data?.results || []

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: TransferStatus }) =>
      apiFetch(`/api/v1/store/transfer/${id}/`, { method: "PATCH", body: JSON.stringify({ status: next }) }),
    onSuccess: (_, { next }) => {
      queryClient.invalidateQueries({ queryKey: ["transfers"] })
      queryClient.invalidateQueries({ queryKey: ["production-availability"] })
      toast.success(next === "done" ? "Transfer marked done." : next === "cancelled" ? "Transfer cancelled." : "Transfer reopened.")
    },
    onError: () => toast.error("Failed to update the transfer."),
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Transfers</h1>
          <p className="text-sm text-muted-foreground">
            Stock to move between warehouses. An open transfer holds the parts in the source warehouse. Move the
            packets, then mark the transfer done.
          </p>
        </div>
        <div className="inline-flex rounded-md border border-input">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={cn(
                "h-8 px-3 text-sm first:rounded-l-md last:rounded-r-md",
                status === filter.value ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-border/50">
              <TableHead className={headClass}>Component</TableHead>
              <TableHead className={headClass}>Qty</TableHead>
              <TableHead className={headClass}>From → To</TableHead>
              <TableHead className={headClass}>Requested</TableHead>
              <TableHead className={headClass}>Note</TableHead>
              <TableHead className={headClass} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6">
                  <Skeleton className="h-5 w-2/3" />
                </TableCell>
              </TableRow>
            ) : transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No transfers.
                </TableCell>
              </TableRow>
            ) : (
              transfers.map((transfer) => (
                <TableRow key={transfer.id} className={cn("border-border/40", transfer.status !== "open" && "opacity-70")}>
                  <TableCell className="px-3 py-2">
                    <ComponentRef componentId={transfer.component_id} fallbackName={transfer.component_name} />
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm font-semibold">{transfer.quantity}</TableCell>
                  <TableCell className="px-3 py-2 text-sm">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {transfer.source_warehouse_name}
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {transfer.target_location_name}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                    <span className="block">{transfer.requested_by_name || "-"}</span>
                    <span className="block">{new Date(transfer.created_at).toLocaleDateString()}</span>
                    {transfer.source?.type === "production" && transfer.source.bom_id ? (
                      <Link to={`/production/bom/${transfer.source.bom_id}`} className="text-primary hover:underline">
                        From BOM →
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="px-3 py-2 text-sm text-muted-foreground">{transfer.note || "-"}</TableCell>
                  <TableCell className="px-3 py-2 text-right">
                    {transfer.status === "open" ? (
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: transfer.id, next: "done" })}
                          title="The packets were moved"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Done
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: transfer.id, next: "cancelled" })}
                          title="Release the hold in the source warehouse"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {transfer.status === "done" ? "Done" : "Cancelled"}
                        {transfer.completed_at ? ` ${new Date(transfer.completed_at).toLocaleDateString()}` : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
