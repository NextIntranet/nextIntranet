import { useEffect, useRef, useState, type ReactNode } from "react"

import { LocationDetailSheet } from "@/components/LocationDetailSheet"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface LocationSummary {
  id: string
  full_path: string
  name?: string | null
  description?: string | null
  can_store_items?: boolean
}

interface LocationDisplayProps {
  location?: LocationSummary | null
  className?: string
  labelClassName?: string
  showInlineDescription?: boolean
  fallback?: ReactNode
}

export function LocationDisplay({
  location,
  className,
  labelClassName,
  showInlineDescription = false,
  fallback = "-",
}: LocationDisplayProps) {
  const [hoverOpen, setHoverOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current != null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

  if (!location?.id) {
    return (
      <span className={cn("text-muted-foreground", className)}>
        {fallback}
      </span>
    )
  }

  const label = location.full_path || location.name || location.id
  const showName = location.name && location.name !== location.full_path

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current != null) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const openPopover = () => {
    clearCloseTimeout()
    setHoverOpen(true)
  }

  const closePopover = () => {
    clearCloseTimeout()
    closeTimeoutRef.current = window.setTimeout(() => {
      setHoverOpen(false)
    }, 120)
  }

  const handleClick = () => {
    setHoverOpen(false)
    setSheetOpen(true)
  }

  return (
    <>
      <Popover open={hoverOpen} onOpenChange={setHoverOpen}>
        <div className={cn("space-y-1", className)}>
          <PopoverAnchor asChild>
            <button
              type="button"
              onClick={handleClick}
              onMouseEnter={openPopover}
              onMouseLeave={closePopover}
              className={cn(
                "text-left text-primary hover:underline",
                labelClassName,
              )}
            >
              {label}
            </button>
          </PopoverAnchor>
          {showInlineDescription && location.description && (
            <p className="text-xs text-muted-foreground">{location.description}</p>
          )}
        </div>
        <PopoverContent
          className="w-80"
          onMouseEnter={openPopover}
          onMouseLeave={closePopover}
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            {showName && (
              <p className="text-xs text-muted-foreground">Name: {location.name}</p>
            )}
            {location.description && (
              <p className="text-xs text-muted-foreground">{location.description}</p>
            )}
            {location.can_store_items != null && (
              <p className="text-xs text-muted-foreground">
                Can store items: {location.can_store_items ? "Yes" : "No"}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Click for full details</p>
          </div>
        </PopoverContent>
      </Popover>

      <LocationDetailSheet
        locationId={location.id}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  )
}
