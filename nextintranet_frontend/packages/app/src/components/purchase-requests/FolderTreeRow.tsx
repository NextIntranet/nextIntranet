import { useState } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { Check, ChevronRight, FolderPlus, GripVertical, Pencil, Trash2, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { TableCell, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { FOLDER_DRAG_PREFIX, FolderNode, ROOT_DROP_ID, UNGROUPED_ID } from "./types"

function countRequests(node: FolderNode): number {
  return node.requests.length + node.children.reduce((sum, child) => sum + countRequests(child), 0)
}

interface Props {
  node: FolderNode
  depth: number
  expanded: boolean
  onToggleExpand: (id: string) => void
  canEdit: boolean
  onCreateSubfolder: (parentId: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  blockedDropFolderIds: Set<string>
}

export function FolderTreeRow({
  node,
  depth,
  expanded,
  onToggleExpand,
  canEdit,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  blockedDropFolderIds,
}: Props) {
  const isUngrouped = node.id === UNGROUPED_ID
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)

  const dropId = isUngrouped ? ROOT_DROP_ID : `${FOLDER_DRAG_PREFIX}${node.id}`
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `${FOLDER_DRAG_PREFIX}${node.id}`,
    disabled: isUngrouped,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    disabled: !isUngrouped && blockedDropFolderIds.has(node.id),
  })
  const setRowRef = (el: HTMLTableRowElement | null) => {
    setDragRef(el)
    setDropRef(el)
  }

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
    <TableRow
      ref={setRowRef}
      className={cn(
        "border-border/40 bg-muted/20 hover:bg-muted/30",
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
        isDragging && "opacity-30",
      )}
    >
      <TableCell className="h-9 w-8 px-1">
        {!isUngrouped && canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="grid h-6 w-6 cursor-grab place-items-center rounded text-muted-foreground/40 hover:bg-accent/40 hover:text-muted-foreground active:cursor-grabbing"
            aria-label="Drag folder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
      </TableCell>
      <TableCell colSpan={4} className="h-9 px-3" style={{ paddingLeft: depth * 20 + 12 }}>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggleExpand(node.id)}
            className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent/40"
          >
            <ChevronRight
              className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-90")}
            />
          </button>

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
              onDoubleClick={() => canEdit && !isUngrouped && setIsRenaming(true)}
              title={node.full_path}
            >
              {node.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {totalCount} {totalCount === 1 ? "item" : "items"}
              </span>
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="px-3 py-2 align-top">
        {canEdit && !isUngrouped && !isRenaming && (
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
      </TableCell>
    </TableRow>
  )
}
