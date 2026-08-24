import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { FolderTreeRow } from "./FolderTreeRow"
import { PurchaseRequestRow } from "./PurchaseRequestRow"
import { TreeRow } from "./types"

interface Props {
  rows: TreeRow[]
  canEdit: boolean
  deletePending: boolean
  onOpenRequest: (id: string) => void
  onDeleteRequest: (id: string) => void
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  onCreateSubfolder: (parentId: string) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  blockedDropFolderIds: Set<string>
  isLoading?: boolean
}

export function PurchaseRequestTable({
  rows,
  canEdit,
  deletePending,
  onOpenRequest,
  onDeleteRequest,
  expandedIds,
  onToggleExpand,
  onCreateSubfolder,
  onRenameFolder,
  onDeleteFolder,
  blockedDropFolderIds,
  isLoading,
}: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table className="w-full table-fixed">
        <TableHeader className="bg-muted/40">
          <TableRow className="border-border/50">
            <TableHead className="h-9 w-10 px-1" />
            <TableHead className="h-9 w-[32%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Component / Folder
            </TableHead>
            <TableHead className="h-9 w-[8%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Qty
            </TableHead>
            <TableHead className="h-9 w-[16%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Requested by / Suppliers
            </TableHead>
            <TableHead className="h-9 w-[28%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description
            </TableHead>
            <TableHead className="h-9 w-[8%] px-3" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow className="border-border/40">
              <TableCell colSpan={6} className="py-8">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              </TableCell>
            </TableRow>
          ) : rows.length ? (
            rows.map((row) =>
              row.kind === "folder" ? (
                <FolderTreeRow
                  key={`folder-${row.node.id}`}
                  node={row.node}
                  depth={row.depth}
                  expanded={expandedIds.has(row.node.id)}
                  onToggleExpand={onToggleExpand}
                  canEdit={canEdit}
                  onCreateSubfolder={onCreateSubfolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  blockedDropFolderIds={blockedDropFolderIds}
                />
              ) : (
                <PurchaseRequestRow
                  key={`request-${row.request.id}`}
                  request={row.request}
                  depth={row.depth}
                  canEdit={canEdit}
                  deletePending={deletePending}
                  onOpen={onOpenRequest}
                  onDelete={onDeleteRequest}
                />
              ),
            )
          ) : (
            <TableRow className="border-border/40">
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                No purchase requests found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
