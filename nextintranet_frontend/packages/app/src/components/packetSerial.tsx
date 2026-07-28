import { cn } from "@/lib/utils"

/** Format a per-component packet serial number as "S001". */
export function formatSerialCode(value?: number | string | null): string {
  if (value === null || value === undefined || value === "") {
    return ""
  }
  const num = typeof value === "string" ? Number(value) : value
  if (!Number.isFinite(num)) {
    return ""
  }
  return `S${String(Math.trunc(num)).padStart(3, "0")}`
}

/** Prefer the API-provided serial_code, fall back to formatting serial_number. */
export function serialCodeFromPacket(
  packet?: { serial_code?: string | null; serial_number?: number | null } | null,
): string {
  if (!packet) {
    return ""
  }
  if (packet.serial_code) {
    return packet.serial_code
  }
  return formatSerialCode(packet.serial_number)
}

/** Small monospace badge with the packet S-code (e.g. "S001"). */
export function SerialBadge({
  code,
  className,
}: {
  code?: string | null
  className?: string
}) {
  if (!code) {
    return null
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5",
        "font-mono text-[11px] font-semibold leading-none text-foreground ring-1 ring-border",
        className,
      )}
    >
      {code}
    </span>
  )
}
