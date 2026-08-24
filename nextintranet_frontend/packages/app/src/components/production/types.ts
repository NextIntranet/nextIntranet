export interface ProductionFolderNode {
  id: string
  name: string
  description?: string | null
  full_path: string
  children: ProductionFolderNode[]
}

export interface ProductionTreeItem {
  id: string
  name: string
  folder?: string | null
  templates_count?: number
  realizations_count?: number
}

export const FOLDER_DRAG_PREFIX = "folder:"
export const PRODUCTION_DRAG_PREFIX = "production:"
export const ROOT_DROP_ID = "production-folder-root"

export type ProductionTreeRow =
  | { kind: "folder"; node: ProductionFolderNode; depth: number }
  | { kind: "production"; item: ProductionTreeItem; depth: number }

/** Flattens the folder tree (with productions filed inside each folder) into one
 * ordered list of visible rows, respecting which folder ids are currently expanded. */
export function buildProductionTreeRows(
  folderTree: ProductionFolderNode[],
  productionsByFolder: Map<string, ProductionTreeItem[]>,
  expandedIds: Set<string>,
): ProductionTreeRow[] {
  const rows: ProductionTreeRow[] = []

  const visit = (nodes: ProductionFolderNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ kind: "folder", node, depth })
      if (expandedIds.has(node.id)) {
        visit(node.children, depth + 1)
        for (const item of productionsByFolder.get(node.id) || []) {
          rows.push({ kind: "production", item, depth: depth + 1 })
        }
      }
    }
  }

  visit(folderTree, 0)
  return rows
}

export function findFolderNode(nodes: ProductionFolderNode[], id: string): ProductionFolderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findFolderNode(node.children, id)
    if (found) return found
  }
  return null
}

/** The id of a folder's current parent, or null at root. Undefined when the folder isn't found. */
export function findFolderParentId(
  nodes: ProductionFolderNode[],
  id: string,
  parent: string | null = null,
): string | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return parent
    const found = findFolderParentId(node.children, id, node.id)
    if (found !== undefined) return found
  }
  return undefined
}

/** A folder plus every one of its descendants — used to block dropping a folder into itself. */
export function collectFolderAndDescendantIds(node: ProductionFolderNode): Set<string> {
  const ids = new Set<string>([node.id])
  for (const child of node.children) {
    for (const id of collectFolderAndDescendantIds(child)) ids.add(id)
  }
  return ids
}
