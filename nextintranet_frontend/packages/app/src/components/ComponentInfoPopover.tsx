import type { ReactNode } from "react"
import { Info } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface ComponentInfo {
  id: string
  name: string
  description?: string | null
  primary_image_url?: string | null
  category?: {
    id: string
    name: string
  } | null
}

interface ComponentInfoPopoverProps {
  component: ComponentInfo
  packetId?: string
  children?: ReactNode
}

export function ComponentInfoPopover({
  component,
  packetId,
  children,
}: ComponentInfoPopoverProps) {
  const componentLink = `/store/component/${component.id}${
    packetId ? `?packet=${packetId}` : ""
  }`
  const trigger = children ?? (
    <Button variant="ghost" size="icon" type="button" className="h-8 w-8">
      <Info className="h-4 w-4" />
      <span className="sr-only">Component details</span>
    </Button>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="flex items-start gap-3">
          {component.primary_image_url ? (
            <img
              src={component.primary_image_url}
              alt={component.name}
              className="h-12 w-12 rounded-md border border-border object-contain"
              loading="lazy"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted text-[10px] text-muted-foreground">
              No image
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{component.name}</p>
            <p className="text-xs text-muted-foreground">{component.id}</p>
            {component.category?.name && (
              <p className="text-xs text-muted-foreground">
                Category: {component.category.name}
              </p>
            )}
          </div>
        </div>
        {component.description && (
          <p className="mt-3 max-h-20 overflow-hidden text-xs text-muted-foreground">
            {component.description}
          </p>
        )}
        <div className="mt-4">
          <Link to={componentLink} className="text-sm text-primary hover:underline">
            Open component details
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
