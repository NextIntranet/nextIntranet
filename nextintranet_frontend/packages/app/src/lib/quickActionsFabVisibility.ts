import { useSyncExternalStore } from "react"

export const QUICK_ACTIONS_FAB_STORAGE_KEY = "nextintranet-quick-actions-fab"

const listeners = new Set<() => void>()

export function getQuickActionsFabVisible(): boolean {
  if (typeof window === "undefined") {
    return true
  }
  return localStorage.getItem(QUICK_ACTIONS_FAB_STORAGE_KEY) !== "0"
}

export function setQuickActionsFabVisible(visible: boolean): void {
  localStorage.setItem(QUICK_ACTIONS_FAB_STORAGE_KEY, visible ? "1" : "0")
  listeners.forEach((listener) => listener())
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  const onStorage = (event: StorageEvent) => {
    if (event.key === QUICK_ACTIONS_FAB_STORAGE_KEY || event.key === null) {
      onStoreChange()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener("storage", onStorage)
  }
}

export function useQuickActionsFabVisible(): boolean {
  return useSyncExternalStore(subscribe, getQuickActionsFabVisible, () => true)
}
