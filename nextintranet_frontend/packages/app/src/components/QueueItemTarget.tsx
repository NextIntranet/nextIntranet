import { Link } from "react-router-dom"

import { PacketRef } from "@/components/PacketRef"
import { cn } from "@/lib/utils"

export interface QueueItemTargetItem {
  kind: "label" | "document"
  content_type_model?: string | null
  content_label?: string | null
  object_id: string
  payload?: Record<string, unknown>
}

const fallbackLabel = (item: QueueItemTargetItem) =>
  item.content_label ||
  (item.content_type_model ? `${item.content_type_model} ${item.object_id}` : item.object_id)

/**
 * Renders the target of a print queue item: known object types become links to
 * their detail pages; packets get the generic PacketRef (S-code + component).
 */
export function QueueItemTarget({
  item,
  className,
}: {
  item: QueueItemTargetItem
  className?: string
}) {
  const model = (item.content_type_model || "").toLowerCase()

  if (model === "packet") {
    return <PacketRef packetId={item.object_id} className={className} />
  }

  const linkClass = cn("min-w-0 truncate text-primary hover:underline", className)

  if (model === "component") {
    return (
      <Link to={`/store/component/${item.object_id}`} className={linkClass}>
        {fallbackLabel(item)}
      </Link>
    )
  }

  if (model === "location" || model === "warehouse") {
    return (
      <Link to={`/store/location/${item.object_id}`} className={linkClass}>
        {fallbackLabel(item)}
      </Link>
    )
  }

  return <span className={className}>{fallbackLabel(item)}</span>
}
