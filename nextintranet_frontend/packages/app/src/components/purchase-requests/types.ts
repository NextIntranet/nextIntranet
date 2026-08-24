export interface SupplierSummary {
  id: string
  supplier_id: string
  supplier_name: string
  symbol?: string | null
}

export interface PurchaseRequest {
  id: string
  component_id?: string | null
  component_name?: string | null
  item_name?: string | null
  quantity: number
  description?: string | null
  requested_by_name?: string | null
  purchase_id?: string | null
  folder_id?: string | null
  suppliers?: SupplierSummary[]
  mfpn?: string | null
  matching_supplier_relation_id?: string | null
  created_at: string
}

export interface PurchaseRequestFolder {
  id: string
  name: string
  parent: string | null
  full_path: string
}

export interface FolderNode extends PurchaseRequestFolder {
  children: FolderNode[]
  requests: PurchaseRequest[]
}

export const FOLDER_DRAG_PREFIX = 'folder:'
export const REQUEST_DRAG_PREFIX = 'request:'
export const ROOT_DROP_ID = 'root'
export const UNGROUPED_ID = '__ungrouped__'

export type TreeRow =
  | { kind: 'folder'; node: FolderNode; depth: number }
  | { kind: 'request'; request: PurchaseRequest; depth: number }

/** Flattens folders (+ an "Ungrouped" pseudo-folder for root-level requests) into one
 * ordered list of visible rows, respecting which folder ids are currently expanded. */
export function buildVisibleRows(
  folderTree: FolderNode[],
  ungroupedRequests: PurchaseRequest[],
  expandedIds: Set<string>,
): TreeRow[] {
  const rows: TreeRow[] = []

  const visit = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ kind: 'folder', node, depth })
      if (expandedIds.has(node.id)) {
        visit(node.children, depth + 1)
        for (const request of node.requests) {
          rows.push({ kind: 'request', request, depth: depth + 1 })
        }
      }
    }
  }

  visit(folderTree, 0)

  const ungroupedNode: FolderNode = {
    id: UNGROUPED_ID,
    name: 'Ungrouped',
    parent: null,
    full_path: 'Ungrouped',
    children: [],
    requests: ungroupedRequests,
  }
  rows.push({ kind: 'folder', node: ungroupedNode, depth: 0 })
  if (expandedIds.has(UNGROUPED_ID)) {
    for (const request of ungroupedRequests) {
      rows.push({ kind: 'request', request, depth: 1 })
    }
  }

  return rows
}

export function suppliersTooltip(suppliers?: SupplierSummary[]) {
  if (!suppliers || suppliers.length === 0) {
    return "-"
  }
  return suppliers.map((supplier) => supplier.supplier_name).filter(Boolean).join(", ")
}

export function isDescendantFolder(
  folders: PurchaseRequestFolder[],
  candidateId: string,
  ancestorId: string,
): boolean {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  let current = byId.get(candidateId)
  while (current?.parent) {
    if (current.parent === ancestorId) {
      return true
    }
    current = byId.get(current.parent)
  }
  return false
}
