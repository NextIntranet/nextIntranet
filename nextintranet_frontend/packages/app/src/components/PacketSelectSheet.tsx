import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Loader2 } from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Paginated<T> = {
  results: T[]
}

export type PacketSelectItem = {
  id: string
  count?: string | number | null
  description?: string | null
  is_active?: boolean
  component?: {
    id: string
    name: string
  } | null
  location?: {
    id?: string
    name?: string
    full_path?: string
  } | null
}

export type PacketLineProgress = {
  refLabel: string
  needed: number
  sourced: number
  placed: number
}

type PacketSelectSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId?: string | null
  componentName?: string
  modeLabel: "SOURCED" | "PLACED"
  lineProgress?: PacketLineProgress | null
  initialSearch?: string
  browseMode?: boolean
  homePath?: string | null
  onSelect: (packet: PacketSelectItem, qty: number) => void
}

const isInHome = (packet: PacketSelectItem, homePath?: string | null) => {
  if (!homePath) return false
  const path = packet.location?.full_path || packet.location?.name || ""
  return path === homePath || path.startsWith(`${homePath}/`)
}

const unwrap = <T,>(data: T[] | Paginated<T> | undefined): T[] => {
  if (!data) return []
  return Array.isArray(data) ? data : data.results || []
}

const toNumber = (value: string | number | null | undefined) => {
  if (value == null) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return "0"
  if (Math.abs(value - Math.round(value)) < 0.000001) {
    return String(Math.round(value))
  }
  return value.toFixed(2).replace(/\.?0+$/, "")
}

const buildProgressSegments = (neededRaw: number, sourcedRaw: number, placedRaw: number) => {
  const needed = Math.max(0, neededRaw)
  if (needed <= 0) {
    return {
      sourcedPct: 0,
      placedPct: 0,
      emptyPct: 0,
      sourcedOverflow: Math.max(sourcedRaw, 0),
      placedOverflow: Math.max(placedRaw, 0),
    }
  }

  const placedSegment = Math.min(Math.max(placedRaw, 0), needed)
  const sourcedOnly = Math.max(sourcedRaw - placedRaw, 0)
  const sourcedSegment = Math.min(sourcedOnly, Math.max(needed - placedSegment, 0))
  const emptySegment = Math.max(needed - placedSegment - sourcedSegment, 0)

  return {
    sourcedPct: (sourcedSegment / needed) * 100,
    placedPct: (placedSegment / needed) * 100,
    emptyPct: (emptySegment / needed) * 100,
    sourcedOverflow: Math.max(sourcedRaw - needed, 0),
    placedOverflow: Math.max(placedRaw - needed, 0),
  }
}

export function PacketSelectSheet({
  open,
  onOpenChange,
  componentId,
  componentName,
  modeLabel,
  lineProgress,
  initialSearch = "",
  browseMode = false,
  homePath = null,
  onSelect,
}: PacketSelectSheetProps) {
  const [search, setSearch] = useState("")
  const [qtyByPacket, setQtyByPacket] = useState<Record<string, string>>({})
  const [activePacketId, setActivePacketId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setSearch("")
      setQtyByPacket({})
      setActivePacketId(null)
      return
    }
    setSearch(initialSearch.trim())
  }, [open, initialSearch])

  const { data, isLoading, isFetching } = useQuery<PacketSelectItem[] | Paginated<PacketSelectItem>>({
    queryKey: ["production-packet-select", componentId || "__all__", open],
    queryFn: () => {
      const params = new URLSearchParams({ page_size: "300" })
      if (componentId) {
        params.set("component", componentId)
      }
      return apiFetch<PacketSelectItem[] | Paginated<PacketSelectItem>>(`/api/v1/store/packet/?${params.toString()}`)
    },
    enabled: open,
  })

  const rows = useMemo(() => {
    let baseRows = unwrap(data).filter((packet) => packet.is_active !== false)
    const query = search.trim().toLowerCase()
    if (query) {
      baseRows = baseRows.filter((packet) => {
        const haystack = [
          packet.id,
          packet.component?.name,
          packet.location?.full_path,
          packet.location?.name,
          packet.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
        return haystack.includes(query)
      })
    }
    if (homePath) {
      // Stable sort: home-location bags first, keep original order otherwise.
      baseRows = baseRows
        .map((packet, index) => ({ packet, index }))
        .sort((a, b) => {
          const ah = isInHome(a.packet, homePath) ? 0 : 1
          const bh = isInHome(b.packet, homePath) ? 0 : 1
          return ah - bh || a.index - b.index
        })
        .map((entry) => entry.packet)
    }
    return baseRows
  }, [data, search, homePath])

  useEffect(() => {
    if (rows.length === 0) {
      setActivePacketId(null)
      return
    }
    setActivePacketId((prev) => {
      if (prev && rows.some((packet) => packet.id === prev)) {
        return prev
      }
      return rows[0].id
    })
  }, [rows])

  const getQty = (packetId: string) => {
    const raw = qtyByPacket[packetId]
    if (raw == null || raw === "") {
      return 0
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }
    return parsed
  }

  const getRequiredQty = () => {
    if (!lineProgress) return 0
    const needed = Math.max(0, toNumber(lineProgress.needed))
    const current =
      modeLabel === "PLACED"
        ? Math.max(0, toNumber(lineProgress.placed))
        : Math.max(0, toNumber(lineProgress.sourced))
    return Math.max(needed - current, 0)
  }

  const selectedQty = activePacketId ? getQty(activePacketId) : 0
  const selectedPacket = activePacketId ? rows.find((packet) => packet.id === activePacketId) || null : null
  const progressPreview = useMemo(() => {
    if (!lineProgress) return null
    const needed = toNumber(lineProgress.needed)
    const currentSourced = toNumber(lineProgress.sourced)
    const currentPlaced = toNumber(lineProgress.placed)
    const qtyDelta = Math.max(0, selectedQty)
    const previewSourced = currentSourced + (modeLabel === "SOURCED" ? qtyDelta : 0)
    const previewPlaced = currentPlaced + (modeLabel === "PLACED" ? qtyDelta : 0)
    const segments = buildProgressSegments(needed, previewSourced, previewPlaced)

    return {
      needed,
      currentSourced,
      currentPlaced,
      previewSourced,
      previewPlaced,
      qtyDelta,
      remainingSourced: Math.max(needed - previewSourced, 0),
      remainingPlaced: Math.max(needed - previewPlaced, 0),
      segments,
    }
  }, [lineProgress, selectedQty, modeLabel])

  const handleUsePacket = (packet: PacketSelectItem) => {
    setActivePacketId(packet.id)
    const qty = browseMode ? 1 : getQty(packet.id)
    if (qty <= 0) {
      toast.error("Quantity must be greater than 0.")
      return
    }
    onSelect(packet, qty)
    onOpenChange(false)
  }

  const handleUseAll = (packet: PacketSelectItem) => {
    setActivePacketId(packet.id)
    const requiredQty = getRequiredQty()
    if (requiredQty <= 0) {
      setQtyByPacket((prev) => ({ ...prev, [packet.id]: "0" }))
      toast.success("Line is already complete.")
      return
    }

    const availableQty = Math.max(0, toNumber(packet.count))
    const nextQty = Math.min(requiredQty, availableQty)
    setQtyByPacket((prev) => ({ ...prev, [packet.id]: String(nextQty) }))

    if (nextQty <= 0) {
      toast.error("No available quantity in this bag.")
      return
    }
    if (availableQty < requiredQty) {
      toast.error(`Not enough quantity in bag. Set to available amount: ${formatQty(nextQty)}.`)
      return
    }
    toast.success(`Set quantity to required amount: ${formatQty(nextQty)}.`)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle>{browseMode ? "Find packet" : `Select bag for ${modeLabel}`}</SheetTitle>
          <SheetDescription>
            {browseMode
              ? "Search by packet ID, component, location, or description, then select a bag."
              : componentName
                ? `Choose a bag for component "${componentName}".`
                : "Choose a bag from the warehouse list."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-2">
          <Input
            placeholder={browseMode ? "Search packets..." : "Filter by packet ID, location, description..."}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />

          {lineProgress && progressPreview ? (
            <div className="rounded-md border border-border/70 bg-muted/15 p-2">
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-tight">
                <span className="font-medium text-foreground">Line {lineProgress.refLabel}</span>
                <span className="text-muted-foreground">Need: {formatQty(progressPreview.needed)}</span>
                <span className="text-amber-700">Sourced: {formatQty(progressPreview.previewSourced)}</span>
                <span className="text-emerald-700">Placed: {formatQty(progressPreview.previewPlaced)}</span>
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800">
                  Current pick: {selectedPacket ? `${selectedPacket.id} (+${formatQty(progressPreview.qtyDelta)})` : "none"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex h-2 w-full flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="bg-amber-400" style={{ width: `${progressPreview.segments.sourcedPct}%` }} />
                  <div className="bg-emerald-500" style={{ width: `${progressPreview.segments.placedPct}%` }} />
                  <div className="bg-muted" style={{ width: `${progressPreview.segments.emptyPct}%` }} />
                </div>
                {progressPreview.segments.sourcedOverflow > 0 ? (
                  <span className="inline-flex rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                    (+{formatQty(progressPreview.segments.sourcedOverflow)})
                  </span>
                ) : null}
                {progressPreview.segments.placedOverflow > 0 ? (
                  <span className="inline-flex rounded border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                    (+{formatQty(progressPreview.segments.placedOverflow)})
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className={cn(modeLabel === "SOURCED" ? "font-semibold text-amber-800" : "text-muted-foreground")}>
                  Remaining to source: {formatQty(progressPreview.remainingSourced)}
                </span>
                <span className={cn(modeLabel === "PLACED" ? "font-semibold text-emerald-800" : "text-muted-foreground")}>
                  Remaining to place: {formatQty(progressPreview.remainingPlaced)}
                </span>
              </div>
            </div>
          ) : null}

          <div className="max-h-[70vh] overflow-auto rounded-md border border-border/70">
            {isLoading ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading bags...
              </div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No bags found.</div>
            ) : (
              <div className="divide-y divide-border/50">
                {rows.map((packet) => (
                  <div
                    key={packet.id}
                    className={cn(
                      "px-3 py-1.5 transition-colors",
                      browseMode ? "cursor-pointer" : undefined,
                      activePacketId === packet.id
                        ? "bg-sky-100/70 ring-2 ring-inset ring-sky-400/70"
                        : "hover:bg-muted/40",
                    )}
                    onClick={() => {
                      if (browseMode) {
                        handleUsePacket(packet)
                        return
                      }
                      setActivePacketId(packet.id)
                    }}
                  >
                    <div className="grid gap-1 text-[11px] sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="leading-[1.15]">
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                          {packet.component?.name || "Unknown component"}
                          {isInHome(packet, homePath) ? (
                            <span className="inline-flex rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-emerald-800">
                              home
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          <span className="block">
                            Packet:{" "}
                            <Link
                              to={`/store/packet/${packet.id}`}
                              className="font-mono text-primary hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {packet.id}
                            </Link>
                          </span>
                          <span className="block">Location: {packet.location?.full_path || packet.location?.name || "-"}</span>
                          <span className="block">Available quantity: {toNumber(packet.count)}</span>
                        </div>
                        {packet.description ? (
                          <div className="line-clamp-1 text-[10px] text-muted-foreground">Description: {packet.description}</div>
                        ) : null}
                      </div>
                      {browseMode ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleUsePacket(packet)
                          }}
                        >
                          Select
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-7 w-20"
                            value={qtyByPacket[packet.id] ?? "0"}
                            onFocus={() => setActivePacketId(packet.id)}
                            onChange={(event) =>
                              setQtyByPacket((prev) => ({
                                ...prev,
                                [packet.id]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleUseAll(packet)}
                          >
                            Use-all
                          </Button>
                          <Button type="button" size="sm" className="h-7 px-2 text-[11px]" onClick={() => handleUsePacket(packet)}>
                            Use
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isFetching && !isLoading ? <p className="text-xs text-muted-foreground">Updating list...</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
