import { useState } from "react"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { Check, ChevronRight, Folder, Package, Pencil, Trash2, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { FOLDER_DRAG_PREFIX, PRODUCTION_DRAG_PREFIX, ProductionFolderNode, ProductionTreeItem, ProductionTreeRow, ROOT_DROP_ID } from "./types"

interface FolderRowProps {
  node: ProductionFolderNode
  depth: number
  expanded: boolean
  onToggleExpand: (id: string) => void
  canEdit: boolean
  isEmpty: boolean
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  blockedDropFolderIds: Set<string>
}

function FolderRow({
  node,
  depth,
  expanded,
  onToggleExpand,
  canEdit,
  isEmpty,
  onRenameFolder,
  onDeleteFolder,
  blockedDropFolderIds,
}: FolderRowProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(node.name)

  const dragId = `${FOLDER_DRAG_PREFIX}${node.id}`
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: dragId })
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dragId,
    disabled: blockedDropFolderIds.has(node.id),
  })
  const setRowRef = (el: HTMLDivElement | null) => {
    setDragRef(el)
    setDropRef(el)
  }

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
    <div
      ref={setRowRef}
      className={cn(
        "group flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-muted",
        isOver && "bg-primary/5 ring-1 ring-inset ring-primary/40",
        isDragging && "opacity-30",
      )}
      style={{ paddingLeft: depth * 14 + 4 }}
      {...(canEdit && !isRenaming ? attributes : {})}
      {...(canEdit && !isRenaming ? listeners : {})}
    >
      <button
        type="button"
        onClick={() => onToggleExpand(node.id)}
        className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent"
        aria-label={expanded ? "Collapse folder" : "Expand folder"}
      >
        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
      </button>
      <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
            className="h-6 text-xs"
          />
          <button onClick={submitRename} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={cancelRename} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-xs font-semibold uppercase text-muted-foreground"
          title={node.full_path}
          onDoubleClick={() => canEdit && setIsRenaming(true)}
        >
          {node.name}
        </span>
      )}
      {canEdit && !isRenaming ? (
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            title="Rename folder"
            aria-label="Rename folder"
            onClick={() => setIsRenaming(true)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={isEmpty ? "Delete folder" : "Only empty folders can be deleted"}
            aria-label="Delete folder"
            disabled={!isEmpty}
            onClick={() => onDeleteFolder(node.id)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

interface ProductionRowProps {
  item: ProductionTreeItem
  depth: number
  active: boolean
  canEdit: boolean
  onNavigate: (id: string) => void
  onRenameProduction: (id: string, name: string) => void
  onDeleteProduction: (id: string) => void
}

function ProductionRow({ item, depth, active, canEdit, onNavigate, onRenameProduction, onDeleteProduction }: ProductionRowProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(item.name)

  const dragId = `${PRODUCTION_DRAG_PREFIX}${item.id}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId })
  const isUnused = !item.templates_count && !item.realizations_count

  const submitRename = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== item.name) {
      onRenameProduction(item.id, trimmed)
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setNameDraft(item.name)
    setIsRenaming(false)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-muted",
        active && "bg-muted font-medium",
        isDragging && "opacity-30",
      )}
      style={{ paddingLeft: depth * 14 + 4 }}
      {...(canEdit && !isRenaming ? attributes : {})}
      {...(canEdit && !isRenaming ? listeners : {})}
    >
      <Package className="ml-5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
            className="h-6 text-xs"
          />
          <button onClick={submitRename} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={cancelRename} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={cn("min-w-0 flex-1 truncate text-left text-sm", active ? "text-foreground" : "text-muted-foreground")}
          onClick={() => onNavigate(item.id)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (canEdit) setIsRenaming(true)
          }}
        >
          {item.name}
        </button>
      )}
      {canEdit && !isRenaming ? (
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            title="Rename production"
            aria-label="Rename production"
            onClick={() => setIsRenaming(true)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title={isUnused ? "Delete production" : "Only productions without BOM series can be deleted"}
            aria-label="Delete production"
            disabled={!isUnused}
            onClick={() => onDeleteProduction(item.id)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

interface ProductionTreeProps {
  rows: ProductionTreeRow[]
  activeProductionId?: string | null
  canEdit: boolean
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  productionsByFolder: Map<string, ProductionTreeItem[]>
  blockedDropFolderIds: Set<string>
  onNavigateProduction: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onRenameProduction: (id: string, name: string) => void
  onDeleteProduction: (id: string) => void
}

/** Root drop zone so a dragged folder can be moved back to the top level of the tree. */
function RootDropZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID, disabled: !visible })
  if (!visible) return null
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mb-1 rounded-md border border-dashed border-border/70 px-2 py-1.5 text-center text-xs text-muted-foreground",
        isOver && "border-primary/60 bg-primary/5 text-foreground",
      )}
    >
      Drop here to move to top level
    </div>
  )
}

export function ProductionTree({
  rows,
  activeProductionId,
  canEdit,
  expandedIds,
  onToggleExpand,
  productionsByFolder,
  blockedDropFolderIds,
  onNavigateProduction,
  onRenameFolder,
  onDeleteFolder,
  onRenameProduction,
  onDeleteProduction,
}: ProductionTreeProps) {
  return (
    <div className="space-y-0.5">
      <RootDropZone visible={blockedDropFolderIds.size > 0} />
      {rows.length === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">No folders yet.</p> : null}
      {rows.map((row) =>
        row.kind === "folder" ? (
          <FolderRow
            key={`folder-${row.node.id}`}
            node={row.node}
            depth={row.depth}
            expanded={expandedIds.has(row.node.id)}
            onToggleExpand={onToggleExpand}
            canEdit={canEdit}
            isEmpty={row.node.children.length === 0 && (productionsByFolder.get(row.node.id) || []).length === 0}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            blockedDropFolderIds={blockedDropFolderIds}
          />
        ) : (
          <ProductionRow
            key={`production-${row.item.id}`}
            item={row.item}
            depth={row.depth}
            active={row.item.id === activeProductionId}
            canEdit={canEdit}
            onNavigate={onNavigateProduction}
            onRenameProduction={onRenameProduction}
            onDeleteProduction={onDeleteProduction}
          />
        ),
      )}
    </div>
  )
}
