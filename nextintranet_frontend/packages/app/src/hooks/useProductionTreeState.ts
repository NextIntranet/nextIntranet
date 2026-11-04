import { useCallback, useEffect, useRef, useState } from "react"

import { findFolderParentId, type ProductionFolderNode } from "@/components/production/types"

const EXPANDED_KEY = "ni.production.tree.expanded"
const LAST_PRODUCT_KEY = "ni.production.lastProduct"

const readJson = <T>(key: string): T | null => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode, quota) — the tree just won't be remembered.
  }
}

export const readLastProductId = () => {
  try {
    return window.localStorage.getItem(LAST_PRODUCT_KEY)
  } catch {
    return null
  }
}

export const rememberLastProductId = (productId: string) => write(LAST_PRODUCT_KEY, productId)

/**
 * Expanded folders of the production tree, kept across navigation (BOM detail and back)
 * in localStorage. Seeds "top-level folders expanded" only on the very first visit, and always
 * opens the ancestors of `activeFolderId` so the selected product is visible.
 */
export function useProductionTreeState(folders: ProductionFolderNode[], activeFolderId: string | null | undefined) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(readJson<string[]>(EXPANDED_KEY) ?? []))
  const seeded = useRef(readJson<string[]>(EXPANDED_KEY) !== null)

  useEffect(() => {
    if (seeded.current || folders.length === 0) return
    seeded.current = true
    setExpandedIds(new Set(folders.map((folder) => folder.id)))
  }, [folders])

  useEffect(() => {
    if (!activeFolderId || folders.length === 0) return
    const chain: string[] = []
    let current: string | null | undefined = activeFolderId
    while (current) {
      chain.push(current)
      current = findFolderParentId(folders, current)
    }
    setExpandedIds((prev) => (chain.every((id) => prev.has(id)) ? prev : new Set([...prev, ...chain])))
  }, [activeFolderId, folders])

  useEffect(() => {
    if (seeded.current) write(EXPANDED_KEY, JSON.stringify([...expandedIds]))
  }, [expandedIds])

  const toggle = useCallback((folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }, [])

  return { expandedIds, setExpandedIds, toggle }
}
