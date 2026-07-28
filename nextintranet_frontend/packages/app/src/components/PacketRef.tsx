import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"

import { PacketInfoPopover } from "@/components/PacketInfoPopover"
import { SerialBadge, serialCodeFromPacket } from "@/components/packetSerial"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export { formatSerialCode, serialCodeFromPacket, SerialBadge } from "@/components/packetSerial"

export interface PacketRefData {
  id: string
  serial_number?: number | null
  serial_code?: string | null
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

export function usePacket(packetId: string) {
  return useQuery<PacketRefData>({
    queryKey: ["packet", packetId],
    queryFn: () => apiFetch<PacketRefData>(`/api/v1/store/packet/${packetId}/`),
    staleTime: 60_000,
    enabled: !!packetId,
  })
}

interface PacketRefProps {
  packetId: string
  /** Show the packet detail popover when hovering the reference. */
  openOnHover?: boolean
  /** Render as plain text instead of a link. */
  asText?: boolean
  className?: string
}

/**
 * Generic, self-fetching reference to a packet: shows the S-code badge and the
 * component name, links to the packet detail and (optionally) opens a detail
 * popover on hover. Usable anywhere a packet needs to be referenced.
 */
export function PacketRef({ packetId, openOnHover = true, asText = false, className }: PacketRefProps) {
  const { data, isLoading, isError } = usePacket(packetId)

  if (isLoading) {
    return <Skeleton className={cn("h-5 w-36", className)} />
  }

  if (isError || !data) {
    return asText ? (
      <span className={cn("font-mono text-xs text-muted-foreground", className)}>{packetId}</span>
    ) : (
      <Link
        to={`/store/packet/${packetId}`}
        className={cn("font-mono text-xs text-primary hover:underline", className)}
      >
        {packetId}
      </Link>
    )
  }

  const code = serialCodeFromPacket(data)
  const name = data.component?.name || data.id
  const label = (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <SerialBadge code={code} />
      {asText ? (
        <span className="min-w-0 truncate text-foreground">{name}</span>
      ) : (
        <Link
          to={`/store/packet/${data.id}`}
          className="min-w-0 truncate font-medium text-primary hover:underline"
        >
          {name}
        </Link>
      )}
    </span>
  )

  if (!openOnHover) {
    return label
  }

  return (
    <PacketInfoPopover packet={data} openOnHover>
      {label}
    </PacketInfoPopover>
  )
}
