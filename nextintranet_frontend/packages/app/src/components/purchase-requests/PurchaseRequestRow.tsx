import { useDraggable } from "@dnd-kit/core"
import { GripVertical, PackagePlus, Trash2 } from "lucide-react"

import { ComponentRef } from "@/components/ComponentRef"
import { TableCell, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { PurchaseRequest, REQUEST_DRAG_PREFIX, suppliersTooltip } from "./types"

interface Props {
  request: PurchaseRequest
  depth: number
  canEdit: boolean
  deletePending: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onAddToOrder: (request: PurchaseRequest) => void
}

export function PurchaseRequestRow({
  request,
  depth,
  canEdit,
  deletePending,
  onOpen,
  onDelete,
  onAddToOrder,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${REQUEST_DRAG_PREFIX}${request.id}`,
  })

  const suppliersText = suppliersTooltip(request.suppliers)

  return (
    <TableRow ref={setNodeRef} className={cn("border-border/40", isDragging && "opacity-30")}>
      <TableCell className="h-9 w-8 px-1">
        <button
          {...attributes}
          {...listeners}
          className="grid h-6 w-6 cursor-grab place-items-center rounded text-muted-foreground/40 hover:bg-accent/40 hover:text-muted-foreground active:cursor-grabbing"
          aria-label="Drag request"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </TableCell>
      <TableCell className="h-9 px-3" style={{ paddingLeft: depth * 20 + 12 }}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {request.component_id ? (
              <ComponentRef
                componentId={request.component_id}
                fallbackName={request.component_name || request.item_name || "Unknown item"}
              />
            ) : (
              <button
                onClick={() => onOpen(request.id)}
                className="truncate text-left text-sm text-primary hover:underline underline-offset-2"
              >
                {request.item_name || "Unknown item"}
              </button>
            )}
            {request.status === "ordered" && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                Ordered
              </span>
            )}
          </div>
          <button
            onClick={() => onOpen(request.id)}
            className="px-0 text-left text-xs text-muted-foreground hover:underline underline-offset-2"
          >
            Details →
          </button>
        </div>
      </TableCell>
      <TableCell className="h-9 px-3 text-sm text-foreground">{request.quantity}</TableCell>
      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
        <div className="flex flex-col gap-0.5">
          <span className="truncate">{request.requested_by_name || "-"}</span>
          {request.suppliers && request.suppliers.length > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-xs text-muted-foreground/80">{suppliersText}</span>
              </TooltipTrigger>
              <TooltipContent>{suppliersText}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
        {request.description ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block line-clamp-3 whitespace-normal break-words leading-relaxed">
                {request.description}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm whitespace-pre-wrap">{request.description}</TooltipContent>
          </Tooltip>
        ) : (
          "-"
        )}
      </TableCell>
      <TableCell className="px-3 py-2 align-top">
        {canEdit && (
          <div className="flex items-center gap-1">
            {request.status !== "ordered" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onAddToOrder(request)}
                    className="rounded p-1 text-muted-foreground/50 hover:bg-accent/40 hover:text-foreground transition-colors"
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Add to purchase order</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onDelete(request.id)}
                  disabled={deletePending}
                  className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Delete request</TooltipContent>
            </Tooltip>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
