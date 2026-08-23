import { useState } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { Check, ChevronRight, FolderPlus, GripVertical, Pencil, Trash2, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { PurchaseRequestTable } from "./PurchaseRequestTable"
import { FOLDER_DRAG_PREFIX, FolderNode } from "./types"

function countRequests(node: FolderNode): number {
  return node.requests.length + node.children.reduce((sum, child) => sum + countRequests(child), 0)
}

interface Props {
  node: FolderNode
  level: number
  canEdit: boolean
  deletePending: boolean
  onOpenRequest: (id: string) => void
  onDeleteRequest: (id: string) => void
  onCreateSubfolder: (parentId: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  blockedDropFolderIds: Set<string>
}

export function PurchaseRequestFolderRow({
  node,
  level,
  canEdit,
  deletePending,
  onOpenRequest,
  onDeleteRequest,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  blockedDropFolderIds,
}: Props) {
  const [open, setOpen] = useState(level === 0)
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)

  const dragDropId = `${FOLDER_DRAG_PREFIX}${node.id}`
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: dragDropId,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dragDropId,
    disabled: blockedDropFolderIds.has(node.id),
  })

  const totalCount = countRequests(node)

  const submitRename = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== node.name) {
      onRenameFolder(node.id, trimmed)
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setNameDraft(node.name)
    setIsRenaming(false)
  }

  return (
    <div ref={setDropRef} className={cn("rounded-md", isOver && "bg-primary/5 ring-1 ring-primary/40")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          ref={setDragRef}
          style={
            transform
              ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, position: "relative", zIndex: 10 }
              : undefined
          }
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 hover:border-border/60 hover:bg-muted/30",
            isDragging && "opacity-40",
          )}
        >
          <CollapsibleTrigger className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent/40">
            <ChevronRight
              className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")}
            />
          </CollapsibleTrigger>
          {canEdit && (
            <button
              {...attributes}
              {...listeners}
              className="grid h-5 w-5 shrink-0 cursor-grab place-items-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
              aria-label="Drag folder"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}

          {isRenaming ? (
            <div className="flex flex-1 items-center gap-1">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename()
                  if (e.key === "Escape") cancelRename()
                }}
                className="h-7 text-sm"
              />
              <button onClick={submitRename} className="grid h-6 w-6 place-items-center rounded hover:bg-accent/40">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancelRename} className="grid h-6 w-6 place-items-center rounded hover:bg-accent/40">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span
              className="flex-1 truncate text-sm font-medium text-foreground"
              onDoubleClick={() => canEdit && setIsRenaming(true)}
              title={node.full_path}
            >
              {node.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {totalCount} {totalCount === 1 ? "item" : "items"}
              </span>
            </span>
          )}

          {canEdit && !isRenaming && (
            <div className="flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onCreateSubfolder(node.id)}
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground/60 hover:bg-accent/40 hover:text-foreground"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>New subfolder</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIsRenaming(true)}
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground/60 hover:bg-accent/40 hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Rename folder</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onDeleteFolder(node.id)}
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete folder</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        <CollapsibleContent>
          <div className="ml-6 mt-1.5 space-y-2 border-l border-border/50 pl-3">
            {node.children.map((child) => (
              <PurchaseRequestFolderRow
                key={child.id}
                node={child}
                level={level + 1}
                canEdit={canEdit}
                deletePending={deletePending}
                onOpenRequest={onOpenRequest}
                onDeleteRequest={onDeleteRequest}
                onCreateSubfolder={onCreateSubfolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                blockedDropFolderIds={blockedDropFolderIds}
              />
            ))}
            {node.requests.length > 0 && (
              <PurchaseRequestTable
                requests={node.requests}
                canEdit={canEdit}
                deletePending={deletePending}
                onOpen={onOpenRequest}
                onDelete={onDeleteRequest}
                emptyLabel="No requests in this folder."
              />
            )}
            {node.children.length === 0 && node.requests.length === 0 && (
              <p className="py-2 text-xs text-muted-foreground">
                Empty folder. Drag a request here to file it.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
