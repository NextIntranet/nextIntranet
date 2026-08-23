import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Package } from "lucide-react"

import { ComponentInfoPopover } from "@/components/ComponentInfoPopover"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface ComponentRefData {
  id: string
  name: string
  description?: string | null
  primary_image_url?: string | null
  primary_image?: string | null
  category?: {
    id: string
    name: string
  } | null
}

export function useComponentRef(componentId: string) {
  return useQuery<ComponentRefData>({
    queryKey: ["component-ref", componentId],
    queryFn: () => apiFetch<ComponentRefData>(`/api/v1/store/component/${componentId}/`),
    staleTime: 60_000,
    enabled: !!componentId,
  })
}

interface ComponentRefProps {
  componentId: string
  /** Label to render immediately, before the fetched name arrives (or if the fetch fails). */
  fallbackName?: string
  /** Show the component detail popover when hovering the reference. */
  openOnHover?: boolean
  className?: string
}

/**
 * Generic, self-fetching reference to a component: shows the name, links to the
 * component detail page and (optionally) opens a detail popover on hover.
 * Usable anywhere a component needs to be referenced by id.
 */
export function ComponentRef({ componentId, fallbackName, openOnHover = true, className }: ComponentRefProps) {
  const { data, isLoading, isError } = useComponentRef(componentId)

  if (isLoading && !fallbackName) {
    return <Skeleton className={cn("h-5 w-36", className)} />
  }

  const name = data?.name || fallbackName || componentId
  const link = (
    <Link
      to={`/store/component/${componentId}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-primary hover:underline underline-offset-2",
        className,
      )}
    >
      <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </Link>
  )

  if (!openOnHover || isError || !data) {
    return link
  }

  return (
    <ComponentInfoPopover component={data} openOnHover>
      {link}
    </ComponentInfoPopover>
  )
}
