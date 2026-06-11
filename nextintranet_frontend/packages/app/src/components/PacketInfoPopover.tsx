import { useEffect, useRef, useState, type ReactNode } from "react"
import { Package } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { CopyActions } from "@/components/CopyActions"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface PacketInfo {
  id: string
  count?: number | string | null
  is_active?: boolean
  component?: {
    id: string
    name: string
  } | null
  location?: {
    id: string
    full_path: string
  } | null
}

interface PacketInfoPopoverProps {
  packet: PacketInfo
  children?: ReactNode
  openOnHover?: boolean
}

export function PacketInfoPopover({
  packet,
  children,
  openOnHover = false,
}: PacketInfoPopoverProps) {
  const [hoverOpen, setHoverOpen] = useState(false)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current != null) {
        window.clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [])

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

  const isInactive = packet.is_active === false
  const count = Number(packet.count ?? 0)

  const trigger = children ?? (
    <Button variant="ghost" size="icon" type="button" className="h-8 w-8">
      <Package className="h-4 w-4" />
      <span className="sr-only">Packet details</span>
    </Button>
  )

  const triggerNode = openOnHover ? (
    <span
      className="inline-flex min-w-0"
      onMouseEnter={openPopover}
      onMouseLeave={closePopover}
    >
      {trigger}
    </span>
  ) : (
    trigger
  )

  return (
    <Popover
      open={openOnHover ? hoverOpen : undefined}
      onOpenChange={openOnHover ? setHoverOpen : undefined}
    >
      <PopoverTrigger asChild>{triggerNode}</PopoverTrigger>
      <PopoverContent
        className="w-80"
        onMouseEnter={openOnHover ? openPopover : undefined}
        onMouseLeave={openOnHover ? closePopover : undefined}
      >
        <div className="flex items-start gap-2">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="break-all font-mono text-xs text-foreground">{packet.id}</p>
            {packet.component?.name && (
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {packet.component.name}
              </p>
            )}
          </div>
        </div>
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
          {packet.location?.full_path && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium">Location:</dt>
              <dd className="min-w-0 truncate">{packet.location.full_path}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium">Count:</dt>
            <dd className="tabular-nums">{Number.isFinite(count) ? count.toLocaleString() : "0"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-medium">Status:</dt>
            <dd className={isInactive ? "text-destructive" : "text-emerald-600"}>
              {isInactive ? "Inactive" : "Active"}
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Link
            to={`/store/packet/${packet.id}`}
            className="text-sm text-primary hover:underline"
          >
            Open packet detail
          </Link>
          <CopyActions
            id={packet.id}
            linkPath={`/store/packet/${packet.id}`}
            subject="packet"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
