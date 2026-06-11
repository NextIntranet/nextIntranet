import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useSearchParams } from "react-router-dom"

import { DocumentationSheet } from "@/components/DocumentationSheet"

export type DocumentationSheetTarget = {
  page: string
  hash?: string
}

type DocumentationSheetContextValue = {
  open: boolean
  target: DocumentationSheetTarget | null
  openDocSheet: (target: DocumentationSheetTarget) => void
  closeDocSheet: () => void
}

const DocumentationSheetContext = createContext<DocumentationSheetContextValue | null>(null)

const HELP_PARAM = "help"
const HELP_HASH_PARAM = "helpHash"

export function DocumentationSheetProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<DocumentationSheetTarget | null>(null)

  useEffect(() => {
    const helpPage = searchParams.get(HELP_PARAM)
    if (helpPage) {
      setTarget({
        page: helpPage,
        hash: searchParams.get(HELP_HASH_PARAM) ?? undefined,
      })
      setOpen(true)
      return
    }
    setOpen(false)
    setTarget(null)
  }, [searchParams])

  const openDocSheet = useCallback(
    ({ page, hash }: DocumentationSheetTarget) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(HELP_PARAM, page)
          if (hash) {
            next.set(HELP_HASH_PARAM, hash)
          } else {
            next.delete(HELP_HASH_PARAM)
          }
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  const closeDocSheet = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete(HELP_PARAM)
        next.delete(HELP_HASH_PARAM)
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  const value = useMemo(
    () => ({
      open,
      target,
      openDocSheet,
      closeDocSheet,
    }),
    [open, target, openDocSheet, closeDocSheet],
  )

  return (
    <DocumentationSheetContext.Provider value={value}>
      {children}
      <DocumentationSheet />
    </DocumentationSheetContext.Provider>
  )
}

export function useDocumentationSheet() {
  const context = useContext(DocumentationSheetContext)
  if (!context) {
    throw new Error("useDocumentationSheet must be used within DocumentationSheetProvider")
  }
  return context
}
