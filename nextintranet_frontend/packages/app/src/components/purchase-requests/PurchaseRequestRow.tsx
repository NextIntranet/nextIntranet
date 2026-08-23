import { useDraggable } from "@dnd-kit/core"
import { GripVertical, Trash2 } from "lucide-react"

import { ComponentRef } from "@/components/ComponentRef"
import { TableCell, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { PurchaseRequest, REQUEST_DRAG_PREFIX, SupplierSummary, suppliersTooltip } from "./types"

function renderSuppliers(suppliers?: SupplierSummary[]) {
  const text = suppliersTooltip(suppliers)
  return text.length > 42 ? `${text.slice(0, 42)}…` : text
}

interface Props {
  request: PurchaseRequest
  canEdit: boolean
  deletePending: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

export function PurchaseRequestRow({ request, canEdit, deletePending, onOpen, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${REQUEST_DRAG_PREFIX}${request.id}`,
  })

  return (
    <TableRow
      ref={setNodeRef}
      className={cn("border-border/40", isDragging && "opacity-40")}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, position: "relative", zIndex: 10 }
          : undefined
      }
    >
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
      <TableCell className="h-9 px-3">
        <div className="flex min-w-0 flex-col gap-0.5">
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
          <button
            onClick={() => onOpen(request.id)}
            className="px-0 text-left text-xs text-muted-foreground hover:underline underline-offset-2"
          >
            Details →
          </button>
        </div>
      </TableCell>
      <TableCell className="h-9 px-3 text-sm text-foreground">{request.quantity}</TableCell>
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
            <TooltipContent>{suppliersTooltip(request.suppliers)}</TooltipContent>
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
      <TableCell className="px-3 py-2 align-top">
        {canEdit && (
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
        )}
      </TableCell>
    </TableRow>
  )
}
