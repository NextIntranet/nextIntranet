import { useDraggable } from "@dnd-kit/core"
import { Link } from "react-router-dom"
import { GripVertical, Trash2 } from "lucide-react"

import { ComponentRef } from "@/components/ComponentRef"
import { TableCell, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { DuplicateInfo, PurchaseRequest, REQUEST_DRAG_PREFIX, suppliersTooltip } from "./types"

interface Props {
  request: PurchaseRequest
  depth: number
  canEdit: boolean
  deletePending: boolean
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  selected: boolean
  /** Part of the current drag (the dragged row, or any selected row while a selection is dragged). */
  dragging: boolean
  onSelect: (id: string, event: React.MouseEvent) => void
  duplicate?: DuplicateInfo
}

export function PurchaseRequestRow({
  request,
  depth,
  canEdit,
  deletePending,
  onOpen,
  onDelete,
  selected,
  dragging,
  onSelect,
  duplicate,
}: Props) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `${REQUEST_DRAG_PREFIX}${request.id}`,
  })

  const suppliersText = suppliersTooltip(request.suppliers)
  const isFirstDuplicate = duplicate?.index === 0
  const isLastDuplicate = duplicate ? duplicate.index === duplicate.size - 1 : false

  return (
    <TableRow
      ref={setNodeRef}
      onClick={(event) => {
        // Links, buttons and inputs keep their own behaviour; the rest of the row selects.
        if ((event.target as HTMLElement).closest("a, button, input, textarea, select")) return
        onSelect(request.id, event)
      }}
      className={cn(
        "cursor-default select-none border-border/40",
        selected && "bg-sky-100 hover:bg-sky-100 dark:bg-sky-950/60 dark:hover:bg-sky-950/60",
        dragging && "opacity-30",
        duplicate && !isLastDuplicate && "border-b-0",
        duplicate && isFirstDuplicate && "border-t-2 border-t-amber-300/70",
      )}
      aria-selected={selected}
    >
      <TableCell
        className={cn("h-9 w-8 px-1", duplicate && "border-l-4 border-l-amber-400")}
        title={duplicate ? `Same item requested ${duplicate.size}× in this folder` : undefined}
      >
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onOpen(request.id)}
              className="px-0 text-left text-xs text-muted-foreground hover:underline underline-offset-2"
            >
              Details →
            </button>
            {duplicate && isFirstDuplicate ? (
              <span
                className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                title="Several requests for the same item in this folder — consider merging them"
              >
                {duplicate.size}× same item · {duplicate.totalQuantity} pcs total
              </span>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="h-9 px-3 text-sm text-foreground">{request.quantity}</TableCell>
      <TableCell className="px-3 py-2 text-sm text-muted-foreground align-top">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate" title={request.target_location_name || undefined}>
            {request.target_location_name || "-"}
          </span>
          {request.source?.type === "production" && request.source.bom_id ? (
            <Link
              to={`/production/bom/${request.source.bom_id}`}
              className="truncate text-xs text-primary hover:underline underline-offset-2"
            >
              From BOM →
            </Link>
          ) : null}
        </div>
      </TableCell>
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
