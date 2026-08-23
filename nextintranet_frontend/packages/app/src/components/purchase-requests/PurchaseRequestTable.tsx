import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { PurchaseRequestRow } from "./PurchaseRequestRow"
import { PurchaseRequest } from "./types"

interface Props {
  requests: PurchaseRequest[]
  canEdit: boolean
  deletePending: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  isLoading?: boolean
  emptyLabel?: string
}

export function PurchaseRequestTable({
  requests,
  canEdit,
  deletePending,
  onOpen,
  onDelete,
  isLoading,
  emptyLabel = "No purchase requests found.",
}: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table className="w-full table-fixed">
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border/50">
            <TableHead className="h-9 w-8 px-1" />
            <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Component
            </TableHead>
            <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Qty
            </TableHead>
            <TableHead className="h-9 w-[15%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Requested by
            </TableHead>
            <TableHead className="h-9 w-[17%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Suppliers
            </TableHead>
            <TableHead className="h-9 w-[17%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </TableHead>
            <TableHead className="h-9 w-[8%] px-3" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="border-border/40">
              <TableCell colSpan={7} className="py-8">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              </TableCell>
            </TableRow>
          ) : requests.length ? (
            requests.map((request) => (
              <PurchaseRequestRow
                key={request.id}
                request={request}
                canEdit={canEdit}
                deletePending={deletePending}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))
          ) : (
            <TableRow className="border-border/40">
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
