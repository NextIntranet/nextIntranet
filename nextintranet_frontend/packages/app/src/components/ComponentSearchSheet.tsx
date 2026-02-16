import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Loader2 } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type Paginated<T> = {
  results: T[]
}

export type SearchComponentItem = {
  id: string
  name: string
  description?: string | null
  inventory_summary?: {
    total_quantity?: number
  }
}

type ComponentSearchSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSearch?: string
  onSelect: (component: SearchComponentItem) => void
}

const unwrap = <T,>(data: T[] | Paginated<T> | undefined): T[] => {
  if (!data) return []
  return Array.isArray(data) ? data : data.results || []
}

export function ComponentSearchSheet({
  open,
  onOpenChange,
  initialSearch = "",
  onSelect,
}: ComponentSearchSheetProps) {
  const [search, setSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch)

  useEffect(() => {
    if (!open) return
    setSearch(initialSearch)
    setDebouncedSearch(initialSearch)
  }, [open, initialSearch])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)
    return () => window.clearTimeout(handle)
  }, [search])

  const { data, isLoading, isFetching } = useQuery<SearchComponentItem[] | Paginated<SearchComponentItem>>({
    queryKey: ["production-component-link-search", debouncedSearch, open],
    queryFn: () => {
      const params = new URLSearchParams({ page_size: "30" })
      if (debouncedSearch) {
        params.set("search", debouncedSearch)
      }
      return apiFetch<SearchComponentItem[] | Paginated<SearchComponentItem>>(`/api/v1/store/components/?${params.toString()}`)
    },
    enabled: open,
  })

  const rows = useMemo(() => unwrap(data), [data])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle>Link component</SheetTitle>
          <SheetDescription>Search warehouse components and select one to link this BOM row.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <Input
            placeholder="Search by name, description or ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />

          <div className="max-h-[70vh] overflow-auto rounded-md border border-border/70">
            {isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading components...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No components found.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {rows.map((component) => (
                  <button
                    key={component.id}
                    type="button"
                    className="w-full px-4 py-3 text-left hover:bg-muted/40"
                    onClick={() => onSelect(component)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{component.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{component.id}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {component.description || "No description"}
                        </p>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">
                        Stock: {component.inventory_summary?.total_quantity ?? 0}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {isFetching && !isLoading ? <p className="text-xs text-muted-foreground">Updating results...</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
