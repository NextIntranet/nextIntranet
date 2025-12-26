import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Link, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface SearchResult {
  id: string
  label: string
  subtitle?: string | null
  route?: string | null
  source?: string | null
  type?: string | null
}

interface SearchResponse {
  query: string
  context?: string | null
  sources: string[]
  page: number
  page_size: number
  total_count: number
  total_pages: number
  results: SearchResult[]
}

const contextFromPath = (path: string) => {
  if (path.startsWith("/store")) return "store"
  if (path.startsWith("/production")) return "production"
  if (path.startsWith("/store/purchase")) return "purchases"
  return undefined
}

export function SearchModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const location = useLocation()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setDebouncedQuery("")
      setPage(1)
    }
  }, [open])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false)
      }
    }
    if (open) {
      window.addEventListener("keydown", handleKey)
    }
    return () => window.removeEventListener("keydown", handleKey)
  }, [open, onOpenChange])

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery])

  const context = useMemo(() => contextFromPath(location.pathname), [location.pathname])

  const { data, isFetching } = useQuery<SearchResponse>({
    queryKey: ["search", debouncedQuery, context, page],
    queryFn: () =>
      apiFetch<SearchResponse>(
        `/api/v1/search/?q=${encodeURIComponent(debouncedQuery)}${
          context ? `&context=${encodeURIComponent(context)}` : ""
        }&page=${page}&limit=8`
      ),
    enabled: open && debouncedQuery.length > 1,
  })

  const results = data?.results ?? []
  const totalPages = data?.total_pages ?? 1
  const totalCount = data?.total_count ?? 0

  if (!open) {
    return null
  }

  const modal = (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-center bg-black/40 px-4 py-10"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components, packets, locations..."
            className="border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {isFetching && debouncedQuery.length > 1 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">Searching…</div>
          )}
          {!isFetching && debouncedQuery.length > 1 && results.length === 0 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">No results.</div>
          )}
          {results.map((result) => {
            const wrapperClass = cn(
              "flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )
            const content = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {result.label}
                  </span>
                  {result.source && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase text-muted-foreground">
                      {result.source}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {result.subtitle || result.type || "Result"}
                  </span>
                  {result.route && <span className="text-primary">Open</span>}
                </div>
              </>
            )
            if (result.route) {
              return (
                <Link
                  key={`${result.source}-${result.id}`}
                  to={result.route}
                  onClick={() => onOpenChange(false)}
                  className={wrapperClass}
                >
                  {content}
                </Link>
              )
            }
            return (
              <div key={`${result.source}-${result.id}`} className={wrapperClass}>
                {content}
              </div>
            )
          })}
          {debouncedQuery.length <= 1 && (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              Start typing to search.
            </div>
          )}
        </div>
        {debouncedQuery.length > 1 && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {totalCount} results
            </span>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1 || isFetching}
              >
                Prev
              </button>
              <button
                className="rounded-md border border-border px-2 py-1 disabled:opacity-50"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages || isFetching}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
