import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, nextIO } from "@nextintranet/core"
import { toast } from "sonner"

import { CelebrationOverlay } from "@/components/CelebrationOverlay"
import { ComponentInfoPopover } from "@/components/ComponentInfoPopover"
import { CampaignProgressSummary } from "@/components/CampaignProgressSummary"
import { LocationDisplay } from "@/components/LocationDisplay"
import { LocationParentSelect } from "@/components/LocationParentSelect"
import { PrintActions } from "@/components/PrintActions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getInventorySessionCount,
  incrementInventoryCount,
  playAlertTone,
  playFanfare,
  playSuccessTone,
} from "@/lib/celebration"
import { postInventoryOperation } from "@/lib/inventory"
import { evalMathExpr } from "@/lib/utils"
import {
  STOCKTAKING_PROGRESS_REFETCH_MS,
  type StocktakingProgress,
} from "@/lib/stocktaking"
import { getOperationLabel } from "@/lib/stockOperations"
import { useHotkeys } from "@/lib/hotkeys"
import { resolvePacketIdFromScan } from "@/lib/resolvePacketIdFromScan"
import { isPacketExpected, packetStateLabel } from "@/lib/packetState"

interface LocationNode {
  id: string
  name: string
  full_path: string
  children?: LocationNode[]
}

interface PacketComponent {
  id: string
  name: string
  description?: string | null
  primary_image_url?: string | null
  category?: {
    id: string
    name: string
  } | null
}

interface PacketLocation {
  id: string
  full_path: string
  description?: string | null
}

interface Packet {
  id: string
  // DRF serializes the Decimal field as a string.
  count?: number | string | null
  state?: string | null
  is_active?: boolean
  component: PacketComponent
  location?: PacketLocation | null
}

interface PaginatedPackets {
  results: Packet[]
}

interface StocktakingCampaign {
  id: string
  name: string
  description?: string | null
  target_date?: string | null
  is_active: boolean
  progress?: StocktakingProgress
}

interface StockOperation {
  id: string
  packet: string
  operation_type: string
  reference?: string | null
  description?: string | null
  timestamp?: string | null
  quantity?: number | null
}

interface PaginatedStockOperations {
  results: StockOperation[]
}

type StatusBanner = {
  type: "success" | "error" | "info" | "warning"
  text: string
}

const bannerStyles: Record<StatusBanner["type"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
}

const flattenLocations = (nodes: LocationNode[]) => {
  const map = new Map<string, LocationNode>()
  const walk = (items: LocationNode[]) => {
    items.forEach((item) => {
      map.set(item.id, item)
      if (item.children?.length) {
        walk(item.children)
      }
    })
  }
  walk(nodes)
  return map
}

export function InventoryPage() {
  const queryClient = useQueryClient()
  const countInputRef = useRef<HTMLInputElement>(null)
  const scanPacketInputRef = useRef<HTMLInputElement>(null)
  const scanLocationInputRef = useRef<HTMLInputElement>(null)
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedLocationId, setSelectedLocationId] = useState(
    () => searchParams.get("location-id") ?? "",
  )
  const [locationScanValue, setLocationScanValue] = useState("")
  const [packetScanValue, setPacketScanValue] = useState("")
  const [selectedPacketId, setSelectedPacketId] = useState(
    () => searchParams.get("packet-id") ?? "",
  )
  const [selectedPacketOverride, setSelectedPacketOverride] = useState<Packet | null>(
    null,
  )
  const [movePromptPacket, setMovePromptPacket] = useState<Packet | null>(null)
  const [locationCheckEnabled, setLocationCheckEnabled] = useState(true)
  const [newCount, setNewCount] = useState("")
  const [description, setDescription] = useState("")
  const [showInventoriedWarning, setShowInventoriedWarning] = useState(false)
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null)
  const [sessionCount, setSessionCount] = useState(getInventorySessionCount)
  const [celebration, setCelebration] = useState(0)

  useHotkeys([
    {
      keys: "s",
      description: "Focus scan packet input",
      group: "Do inventory",
      handler: () => {
        scanPacketInputRef.current?.focus()
        scanPacketInputRef.current?.select()
      },
    },
    {
      keys: "l",
      description: "Focus scan location input",
      group: "Do inventory",
      handler: () => {
        scanLocationInputRef.current?.focus()
        scanLocationInputRef.current?.select()
      },
    },
    {
      keys: "t",
      description: "Toggle location check",
      group: "Do inventory",
      handler: () => setLocationCheckEnabled((prev) => !prev),
    },
  ])

  const notePacketLoaded = (packetId: string, componentName?: string) => {
    const alreadyInventoried =
      !!activeCampaign && inventoriedPacketIds.has(packetId)
    setShowInventoriedWarning(alreadyInventoried)
    setStatusBanner(
      alreadyInventoried || !componentName
        ? null
        : { type: "info", text: `Packet changed: ${componentName}` },
    )
  }

  const { data: locationsTree, isLoading: locationsLoading } = useQuery<LocationNode[]>(
    {
      queryKey: ["locations-tree"],
      queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
    },
  )

  const locationLookup = useMemo(
    () => flattenLocations(locationsTree || []),
    [locationsTree],
  )

  const selectedLocation = selectedLocationId
    ? locationLookup.get(selectedLocationId)
    : null

  const { data: activeCampaigns } = useQuery<
    StocktakingCampaign[] | { results: StocktakingCampaign[] }
  >({
    queryKey: ["stocktaking-active"],
    queryFn: () =>
      apiFetch<StocktakingCampaign[] | { results: StocktakingCampaign[] }>(
        "/api/v1/store/stocktaking/?is_active=true&page_size=1",
      ),
    refetchInterval: STOCKTAKING_PROGRESS_REFETCH_MS,
    refetchIntervalInBackground: true,
  })

  const activeCampaign = Array.isArray(activeCampaigns)
    ? activeCampaigns[0]
    : activeCampaigns?.results?.[0]

  const { data: packetsData, isLoading: packetsLoading } = useQuery<
    Packet[] | PaginatedPackets
  >({
    queryKey: ["inventory-packets", selectedLocationId],
    queryFn: () =>
      apiFetch<Packet[] | PaginatedPackets>(
        `/api/v1/store/packet/?location=${selectedLocationId}&page_size=1000`,
      ),
    enabled: selectedLocationId.trim() !== "",
  })

  const packets = Array.isArray(packetsData) ? packetsData : packetsData?.results || []

  const { data: packetDetail, isLoading: packetDetailLoading } = useQuery<Packet>({
    queryKey: ["inventory-packet-detail", selectedPacketId],
    queryFn: () => apiFetch<Packet>(`/api/v1/store/packet/${selectedPacketId}/`),
    enabled: selectedPacketId.trim() !== "",
  })

  const selectedPacket = useMemo(() => {
    const base =
      packetDetail ??
      selectedPacketOverride ??
      packets.find((packet) => packet.id === selectedPacketId)
    if (!base) {
      return null
    }
    if (
      selectedPacketOverride?.id === base.id &&
      selectedPacketOverride.location &&
      selectedPacketOverride.location.id !== base.location?.id
    ) {
      return { ...base, location: selectedPacketOverride.location }
    }
    return base
  }, [packetDetail, selectedPacketOverride, packets, selectedPacketId])

  const { data: inventoryOperationsData } = useQuery<
    StockOperation[] | PaginatedStockOperations
  >({
    queryKey: ["stocktaking-operations", activeCampaign?.id],
    queryFn: () =>
      apiFetch<StockOperation[] | PaginatedStockOperations>(
        `/api/v1/store/packet/operation/?operation_type=inventory&reference=${activeCampaign?.id}&page_size=1000`,
      ),
    enabled: !!activeCampaign?.id,
  })

  const inventoryOperations = Array.isArray(inventoryOperationsData)
    ? inventoryOperationsData
    : inventoryOperationsData?.results || []

  const inventoriedPacketIds = useMemo(
    () => new Set(inventoryOperations.map((operation) => operation.packet)),
    [inventoryOperations],
  )

  const { data: packetOperationsData, isLoading: packetOperationsLoading } = useQuery<
    StockOperation[] | PaginatedStockOperations
  >({
    queryKey: ["packet-operations-preview", selectedPacket?.id],
    queryFn: () =>
      apiFetch<StockOperation[] | PaginatedStockOperations>(
        `/api/v1/store/packet/operation/?packet=${selectedPacket?.id}&page_size=5`,
      ),
    enabled: !!selectedPacket?.id,
  })

  const packetOperations = Array.isArray(packetOperationsData)
    ? packetOperationsData
    : packetOperationsData?.results || []

  const visiblePackets = activeCampaign
    ? packets.filter((packet) => !inventoriedPacketIds.has(packet.id))
    : packets

  // Expected (ordered, not yet received) and inactive packets go to the end of the
  // list, each below its own separator.
  const activeVisiblePackets = visiblePackets.filter(
    (packet) => packet.is_active !== false,
  )
  const expectedVisiblePackets = visiblePackets.filter(
    (packet) => packet.is_active === false && isPacketExpected(packet),
  )
  const inactiveVisiblePackets = visiblePackets.filter(
    (packet) => packet.is_active === false && !isPacketExpected(packet),
  )

  const isPacketResolving =
    selectedPacketId.trim() !== "" &&
    !selectedPacket &&
    (packetDetailLoading || (selectedLocationId.trim() !== "" && packetsLoading))

  // DRF serializes the Decimal count as a string, so coerce before math.
  const currentCount = Number(selectedPacket?.count ?? 0)
  const parseNewCount = (): number | null => {
    const raw = newCount.trim()
    if (raw === "") return null
    // Explicit = prefix or bare number/expression → absolute count
    const absExpr = raw.startsWith("=") ? raw.slice(1) : raw
    if (!raw.startsWith("+") && !raw.startsWith("-")) {
      const v = evalMathExpr(absExpr)
      return v !== null && v >= 0 ? v : null
    }
    // Leading + or - → relative delta
    const v = evalMathExpr(raw)
    if (v === null) return null
    const next = currentCount + v
    return next >= 0 ? next : null
  }
  const parsedNewCount = parseNewCount()
  const diff =
    parsedNewCount === null
      ? null
      : parsedNewCount - currentCount

  // Browser back/forward or external link: apply URL params to local state.
  useEffect(() => {
    const locationParam = searchParams.get("location-id") ?? ""
    const packetParam = searchParams.get("packet-id") ?? ""

    setSelectedLocationId((current) =>
      current === locationParam ? current : locationParam,
    )
    setSelectedPacketId((current) =>
      current === packetParam ? current : packetParam,
    )
    setSelectedPacketOverride((current) =>
      current && current.id !== packetParam ? null : current,
    )
    if (!packetParam) {
      setShowInventoriedWarning(false)
    }
  }, [searchParams])

  // UI selection changes: keep URL in sync without fighting URL hydration on mount.
  useEffect(() => {
    const locationParam = selectedLocationId.trim()
    const packetParam = selectedPacketId.trim()

    setSearchParams(
      (prev) => {
        const currentLocation = prev.get("location-id") ?? ""
        const currentPacket = prev.get("packet-id") ?? ""
        if (locationParam === currentLocation && packetParam === currentPacket) {
          return prev
        }

        const next = new URLSearchParams(prev)
        if (locationParam) {
          next.set("location-id", locationParam)
        } else {
          next.delete("location-id")
        }
        if (packetParam) {
          next.set("packet-id", packetParam)
        } else {
          next.delete("packet-id")
        }
        return next
      },
      { replace: true },
    )
  }, [selectedLocationId, selectedPacketId, setSearchParams])

  useEffect(() => {
    if (!selectedPacket) {
      setNewCount("")
      return
    }
    setNewCount(String(selectedPacket.count ?? 0))
    requestAnimationFrame(() => {
      countInputRef.current?.focus()
      countInputRef.current?.select()
    })
  }, [selectedPacket?.id])

  useEffect(() => {
    const unsubscribe = nextIO.on("scanner.data", async (event) => {
      const payload = event.payload as { text?: string } | undefined
      const text = payload?.text?.trim()
      if (!text) {
        return
      }

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.text === text && now - last.ts < 800) {
        return
      }
      lastScanRef.current = { text, ts: now }

      let packetId: string | null
      try {
        packetId = await resolvePacketIdFromScan(text)
      } catch {
        playAlertTone()
        toast.error("Scanner lookup failed.")
        return
      }
      if (!packetId) {
        playAlertTone()
        toast.error("Scanned code is not a packet.")
        return
      }

      try {
        const packet = await apiFetch<Packet>(`/api/v1/store/packet/${packetId}/`)
        setSelectedPacketId(packet.id)
        setSelectedPacketOverride(packet)
        notePacketLoaded(packet.id, packet.component.name)
        setPacketScanValue("")
        if (
          locationCheckEnabled &&
          selectedLocationId &&
          packet.location?.id !== selectedLocationId
        ) {
          playAlertTone()
          setMovePromptPacket(packet)
          return
        }
        if (locationCheckEnabled && packet.location?.id && !selectedLocationId) {
          setSelectedLocationId(packet.location.id)
        }
        if (activeCampaign && inventoriedPacketIds.has(packet.id)) {
          playAlertTone()
          toast("Inventory already recorded for this packet in the campaign.")
        }
      } catch {
        playAlertTone()
        toast.error("Packet not found.")
      }
    })

    return unsubscribe
  }, [activeCampaign, inventoriedPacketIds, locationCheckEnabled, selectedLocationId])

  const inventoryMutation = useMutation({
    mutationFn: (payload: {
      packet: string
      absoluteQuantity: number
      description?: string | null
      reference?: string | null
    }) =>
      postInventoryOperation({
        packet: payload.packet,
        absoluteQuantity: payload.absoluteQuantity,
        userDescription: payload.description ?? null,
        reference: payload.reference,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-packets", selectedLocationId] })
      queryClient.invalidateQueries({
        queryKey: ["stocktaking-operations", activeCampaign?.id],
      })
      queryClient.invalidateQueries({
        queryKey: ["inventory-packet-detail", variables.packet],
      })
      queryClient.invalidateQueries({
        queryKey: ["packet-operations-preview", variables.packet],
      })
      queryClient.invalidateQueries({ queryKey: ["stocktaking"] })
      queryClient.invalidateQueries({ queryKey: ["stocktaking-detail"] })
      queryClient.invalidateQueries({ queryKey: ["stocktaking-active"] })
      queryClient.invalidateQueries({ queryKey: ["stocktaking-location-progress"] })
      const { count, milestone } = incrementInventoryCount()
      setSessionCount(count)
      if (milestone) {
        setCelebration((key) => key + 1)
        playFanfare()
        toast.success(`🎉 ${count} packets inventoried this session — great job!`)
      } else {
        playSuccessTone()
      }
      setStatusBanner({ type: "success", text: "Inventory recorded." })
      setNewCount(String(variables.absoluteQuantity))
      setDescription("")
      setShowInventoriedWarning(false)
      setSelectedPacketOverride(null)
    },
    onError: () => {
      playAlertTone()
      setStatusBanner({
        type: "error",
        text: "Failed to record inventory. Please try again.",
      })
    },
  })

  const movePacketMutation = useMutation({
    mutationFn: (payload: { packetId: string; locationId: string }) =>
      apiFetch(`/api/v1/store/packet/${payload.packetId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          location: payload.locationId,
        }),
      }),
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-packets"] })
      queryClient.invalidateQueries({
        queryKey: ["inventory-packet-detail", payload.packetId],
      })
      toast.success("Packet moved.")
      const targetLocation = locationLookup.get(payload.locationId)
      if (targetLocation) {
        setSelectedPacketOverride((prev) =>
          prev
            ? {
                ...prev,
                location: {
                  id: targetLocation.id,
                  full_path: targetLocation.full_path,
                },
              }
            : prev,
        )
      }
      setMovePromptPacket(null)
    },
    onError: () => {
      toast.error("Failed to move packet.")
    },
  })

  const deactivatePacketMutation = useMutation({
    mutationFn: (packetId: string) =>
      apiFetch(`/api/v1/store/packet/${packetId}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: (_data, packetId) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-packets", selectedLocationId] })
      queryClient.invalidateQueries({ queryKey: ["inventory-packet-detail", packetId] })
      setSelectedPacketOverride((prev) =>
        prev?.id === packetId ? { ...prev, is_active: false } : prev,
      )
      toast.success("Packet marked inactive.")
    },
    onError: () => {
      toast.error("Failed to mark packet inactive.")
    },
  })

  const handleUnsetLocation = () => {
    setSelectedLocationId("")
    setLocationScanValue("")
    setSelectedPacketId("")
    setSelectedPacketOverride(null)
    setNewCount("")
    setMovePromptPacket(null)
    setShowInventoriedWarning(false)
    setStatusBanner(null)
  }

  const handleLocationScan = () => {
    const value = locationScanValue.trim()
    if (!value) {
      return
    }
    const match = Array.from(locationLookup.values()).find(
      (location) => location.id === value || location.full_path === value,
    )
    if (match) {
      setSelectedLocationId(match.id)
      setLocationScanValue("")
      setSelectedPacketId("")
      setSelectedPacketOverride(null)
      setNewCount("")
      setShowInventoriedWarning(false)
      setStatusBanner(null)
      return
    }
    toast.error("Location not found.")
  }

  const handlePacketScan = async () => {
    const value = packetScanValue.trim()
    if (!value) {
      return
    }

    let packetId: string | null
    try {
      packetId = await resolvePacketIdFromScan(value)
    } catch {
      toast.error("Scanner lookup failed.")
      return
    }
    if (!packetId) {
      toast.error("Scanned code is not a packet.")
      return
    }

    const match = packets.find((packet) => packet.id === packetId)
    if (match) {
      setSelectedPacketId(match.id)
      setSelectedPacketOverride(null)
      notePacketLoaded(match.id, match.component.name)
      setPacketScanValue("")
      if (activeCampaign && inventoriedPacketIds.has(match.id)) {
        playAlertTone()
        toast("Inventory already recorded for this packet in the campaign.")
      }
      return
    }

    try {
      const packet = await apiFetch<Packet>(`/api/v1/store/packet/${packetId}/`)
      setSelectedPacketId(packet.id)
      setSelectedPacketOverride(packet)
      notePacketLoaded(packet.id, packet.component.name)
      setPacketScanValue("")
      if (activeCampaign && inventoriedPacketIds.has(packet.id)) {
        playAlertTone()
        toast("Inventory already recorded for this packet in the campaign.")
      }
      if (
        locationCheckEnabled &&
        selectedLocationId &&
        packet.location?.id !== selectedLocationId
      ) {
        playAlertTone()
        setMovePromptPacket(packet)
        return
      }
      if (locationCheckEnabled && packet.location?.id && !selectedLocationId) {
        setSelectedLocationId(packet.location.id)
      }
    } catch {
      toast.error("Packet not found.")
    }
  }

  const handleSubmit = () => {
    if (
      !selectedPacket ||
      parsedNewCount === null ||
      Number.isNaN(parsedNewCount) ||
      diff === null ||
      Number.isNaN(diff)
    ) {
      return
    }
    inventoryMutation.mutate({
      packet: selectedPacket.id,
      absoluteQuantity: parsedNewCount,
      description: description.trim() || null,
      reference: activeCampaign?.id ?? null,
    })
  }

  const handleMovePacket = () => {
    if (!movePromptPacket || !selectedLocationId) {
      return
    }
    movePacketMutation.mutate({
      packetId: movePromptPacket.id,
      locationId: selectedLocationId,
    })
  }

  const canSubmit =
    !!selectedPacket &&
    parsedNewCount !== null &&
    !Number.isNaN(parsedNewCount) &&
    diff !== null &&
    !Number.isNaN(diff) &&
    !inventoryMutation.isPending

  const allInventoried =
    !!activeCampaign && selectedLocationId && packets.length > 0 && !visiblePackets.length

  const movePromptLocation = movePromptPacket?.location?.full_path || "No location"
  const moveTargetLocation = selectedLocation?.full_path || "this location"
  const hasPacketHistory = packetOperations.length > 0

  const activeBanner: StatusBanner | null =
    statusBanner ??
    (activeCampaign && showInventoriedWarning
      ? {
          type: "warning",
          text: "Inventory already recorded for this packet in this campaign. You can record it again if needed.",
        }
      : null)

  const renderLocationPacketRow = (packet: Packet) => {
    const isInactive = packet.is_active === false
    const isExpected = isPacketExpected(packet)
    // DRF serializes the Decimal count as a string, so coerce before use.
    const countValue = Number(packet.count ?? 0)
    const zeroCount = countValue === 0
    const countLabel = Number.isFinite(countValue) ? countValue.toLocaleString() : "0"

    return (
      <div
        key={packet.id}
        className={`flex w-full items-center gap-2 px-4 py-2 text-sm ${
          selectedPacketId === packet.id ? "bg-muted/40" : "hover:bg-muted/30"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setSelectedPacketId(packet.id)
            setSelectedPacketOverride(null)
            notePacketLoaded(packet.id, packet.component.name)
          }}
          className={`min-w-0 flex-1 text-left ${
            isInactive
              ? "text-muted-foreground line-through opacity-70"
              : selectedPacketId === packet.id
                ? "text-foreground"
                : "text-muted-foreground"
          }`}
        >
          <div className="truncate">{packet.component.name}</div>
          <div className="truncate text-xs">
            {isExpected ? `${packetStateLabel(packet)} · ` : ""}
            {packet.id}
          </div>
        </button>
        {zeroCount && !isInactive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            disabled={deactivatePacketMutation.isPending}
            onClick={(event) => {
              event.stopPropagation()
              deactivatePacketMutation.mutate(packet.id)
            }}
          >
            Mark inactive
          </Button>
        ) : null}
        <span
          className={`shrink-0 text-xs tabular-nums ${
            isInactive
              ? "text-muted-foreground line-through opacity-70"
              : "text-muted-foreground"
          }`}
        >
          {countLabel}
        </span>
      </div>
    )
  }

  return (
    <div className="w-full px-4 py-6 lg:px-6">
      <CelebrationOverlay trigger={celebration} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Record actual counts per packet and location. With an active campaign, progress is
          tracked per campaign; without one, counts are saved as ad-hoc inventory.
        </p>
        {sessionCount > 0 && (
          <p className="text-xs text-muted-foreground">
            This session: <span className="font-medium text-foreground">{sessionCount}</span> inventoried
          </p>
        )}
      </div>

      {activeCampaign ? (
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
          <CampaignProgressSummary
            progress={activeCampaign.progress}
            variant="full"
            label={`Inventoried in ${activeCampaign.name}`}
            headerAction={
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <Link to={`/store/inventory/packets?campaign=${activeCampaign.id}`}>
                    Packet list
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <Link to={`/store/inventory/status?campaign=${activeCampaign.id}`}>
                    Packet status
                  </Link>
                </Button>
              </span>
            }
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No open inventory campaign. Counts are saved as ad-hoc inventory.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inventory entry</CardTitle>
              {selectedPacket ? (
                <Link
                  to={`/store/component/${selectedPacket.component.id}?packet=${selectedPacket.id}`}
                  className="block min-h-[20px] truncate text-lg font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {selectedPacket.component.name}
                </Link>
              ) : isPacketResolving ? (
                <Skeleton className="h-7 w-48" />
              ) : (
                <p className="min-h-[20px] text-lg font-semibold text-muted-foreground">
                  No packet selected
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isPacketResolving ? (
                <div className="space-y-4">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : selectedPacket ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Recorded count
                      </label>
                      <Input
                        value={
                          packetDetailLoading && !packetDetail
                            ? ""
                            : selectedPacket
                              ? String(currentCount)
                              : ""
                        }
                        disabled
                        className="h-14 text-lg font-semibold"
                        placeholder={packetDetailLoading ? "Loading..." : undefined}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Current count
                      </label>
                      <Input
                        ref={countInputRef}
                        type="text"
                        inputMode="text"
                        value={newCount}
                        onChange={(e) => setNewCount(e.target.value)}
                        onBlur={() => {
                          const raw = newCount.trim()
                          if (raw === "" || raw.startsWith("+") || raw.startsWith("-")) return
                          const expr = raw.startsWith("=") ? raw.slice(1) : raw
                          const v = evalMathExpr(expr)
                          if (v !== null && v >= 0 && raw !== String(v)) {
                            setNewCount(String(v))
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            if (canSubmit) {
                              handleSubmit()
                            }
                          }
                        }}
                        placeholder="100 or -5 or 50+50"
                        className="h-14 text-lg font-semibold"
                        disabled={false}
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the physical count. Use -5 to subtract or +5 to add relative to recorded. Expressions like 50+50 are evaluated as absolute count.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Difference:</span>{" "}
                    <span className="font-medium text-foreground">
                      {diff === null || Number.isNaN(diff) ? "-" : diff}
                    </span>
                  </div>
                  <div
                    className={`flex h-12 items-center overflow-hidden rounded-lg border px-4 text-sm ${
                      activeBanner
                        ? bannerStyles[activeBanner.type]
                        : "border-border/40 bg-muted/10 text-muted-foreground"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="truncate">{activeBanner?.text ?? ""}</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      placeholder="Optional notes for this inventory record"
                      disabled={false}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                      {inventoryMutation.isPending ? "Saving..." : "Record inventory"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => deactivatePacketMutation.mutate(selectedPacket.id)}
                      disabled={
                        selectedPacket.is_active === false ||
                        deactivatePacketMutation.isPending
                      }
                    >
                      {deactivatePacketMutation.isPending
                        ? "Discarding..."
                        : selectedPacket.is_active === false
                          ? "Packet inactive"
                          : "Discard packet"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a packet to start counting.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>Selected packet</CardTitle>
              {selectedPacket ? (
                <PrintActions
                  targetType="packet"
                  targetId={selectedPacket.id}
                  label={selectedPacket.component.name || selectedPacket.id}
                  compact
                />
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {isPacketResolving ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                    <Skeleton className="h-40 w-full" />
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-5 w-3/4" />
                    </div>
                  </div>
                </div>
              ) : selectedPacket ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                    <div className="flex items-center justify-center rounded-lg border border-border/70 bg-muted/20 p-2">
                      {selectedPacket.component.primary_image_url ? (
                        <img
                          src={selectedPacket.component.primary_image_url}
                          alt={selectedPacket.component.name}
                          className="h-40 w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">No image</p>
                      )}
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Packet
                        </p>
                        <Link
                          to={`/store/packet/${selectedPacket.id}`}
                          className="text-primary hover:underline"
                        >
                          {selectedPacket.id}
                        </Link>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">
                            Component
                          </p>
                          <ComponentInfoPopover
                            component={selectedPacket.component}
                            packetId={selectedPacket.id}
                          />
                        </div>
                        <Link
                          to={`/store/component/${selectedPacket.component.id}?packet=${selectedPacket.id}`}
                          className="text-primary hover:underline"
                        >
                          {selectedPacket.component.name}
                        </Link>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Location
                        </p>
                        <LocationDisplay location={selectedPacket.location} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70">
                    <div className="border-b border-border/70 px-4 py-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Recent history
                      </p>
                    </div>
                    {packetOperationsLoading ? (
                      <div className="space-y-2 p-4">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-3/4" />
                      </div>
                    ) : hasPacketHistory ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packetOperations.map((operation) => (
                            <TableRow key={operation.id}>
                              <TableCell className="text-muted-foreground">
                                {operation.timestamp
                                  ? new Date(operation.timestamp).toLocaleString()
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                {getOperationLabel(operation.operation_type)}
                              </TableCell>
                              <TableCell className="text-right">
                                {typeof operation.quantity === "number"
                                  ? operation.quantity.toLocaleString()
                                  : "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        No history recorded yet.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a packet to see its details.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border border-border/70">
            <CardContent className="p-4">
              {activeCampaign ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Active campaign
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {activeCampaign.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Target date:{" "}
                    {activeCampaign.target_date
                      ? new Date(activeCampaign.target_date).toLocaleDateString()
                      : "Not set"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Mode</p>
                  <p className="text-lg font-semibold text-foreground">Ad-hoc inventory</p>
                  <p className="text-sm text-muted-foreground">
                    No active campaign. You can count packets now; records are saved without
                    campaign tracking.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/store/inventory-campaign">Manage campaigns</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="location-check" className="text-sm font-medium">
                    Check location on scan
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, scanned packets must match the selected location.
                  </p>
                </div>
                <Switch
                  id="location-check"
                  checked={locationCheckEnabled}
                  onCheckedChange={setLocationCheckEnabled}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Scan location</label>
                <div className="flex gap-2">
                  <Input
                    ref={scanLocationInputRef}
                    value={locationScanValue}
                    onChange={(e) => setLocationScanValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleLocationScan()
                      }
                    }}
                    placeholder="Scan or paste location ID"
                  />
                  <Button variant="secondary" onClick={handleLocationScan}>
                    Apply
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Select location
                </label>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    {locationsLoading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <LocationParentSelect
                        locations={locationsTree || []}
                        value={selectedLocationId || null}
                        onChange={(value) => {
                          setSelectedLocationId(value || "")
                          setSelectedPacketId("")
                          setSelectedPacketOverride(null)
                          setNewCount("")
                          setShowInventoriedWarning(false)
                        }}
                        emptyLabel="No location"
                        placeholder="Select location"
                      />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUnsetLocation}
                    disabled={!selectedLocationId}
                    className="shrink-0"
                  >
                    Unset location
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Packets in location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!locationCheckEnabled && (
                <p className="text-xs text-muted-foreground">
                  Location check is off — you can scan any packet regardless of location.
                </p>
              )}
              {activeCampaign && (
                <p className="text-xs text-muted-foreground">
                  Showing only packets without inventory for this campaign.
                </p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Scan packet</label>
                <div className="flex gap-2">
                  <Input
                    ref={scanPacketInputRef}
                    value={packetScanValue}
                    onChange={(e) => setPacketScanValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void handlePacketScan()
                      }
                    }}
                    placeholder="Scan or paste packet ID / barcode"
                  />
                  <Button variant="secondary" onClick={() => void handlePacketScan()}>
                    Apply
                  </Button>
                </div>
              </div>
              <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border/70">
                {packetsLoading ? (
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-5 w-3/4" />
                  </div>
                ) : visiblePackets.length ? (
                  <div className="divide-y divide-border/70">
                    {activeVisiblePackets.map(renderLocationPacketRow)}
                    {expectedVisiblePackets.length > 0 && (
                      <div className="border-t-2 border-border bg-muted/30 px-4 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Expected — ordered, not received yet
                        </span>
                      </div>
                    )}
                    {expectedVisiblePackets.map(renderLocationPacketRow)}
                    {inactiveVisiblePackets.length > 0 && (
                      <div className="border-t-2 border-border bg-muted/30 px-4 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Inactive
                        </span>
                      </div>
                    )}
                    {inactiveVisiblePackets.map(renderLocationPacketRow)}
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    {selectedLocationId
                      ? allInventoried
                        ? "All packets in this location already have inventory recorded for this campaign."
                        : "No packets found for this location."
                      : "Select a location to see packets."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!movePromptPacket}
        onOpenChange={(open) => {
          if (!open) {
            setMovePromptPacket(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Packet location mismatch</DialogTitle>
            <DialogDescription>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Packet
                    </p>
                    <p className="font-medium text-foreground">
                      {movePromptPacket?.id}
                    </p>
                  </div>
                  {movePromptPacket?.component && (
                    <ComponentInfoPopover
                      component={movePromptPacket.component}
                      packetId={movePromptPacket.id}
                    />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Belongs to
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      {movePromptLocation}
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-primary">
                      Move to
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      {moveTargetLocation}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Is this a mistake, or do you want to move it?
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (movePromptPacket?.location?.id) {
                  setSelectedLocationId(movePromptPacket.location.id)
                }
                setMovePromptPacket(null)
              }}
            >
              Use packet location
            </Button>
            <Button
              type="button"
              onClick={handleMovePacket}
              disabled={!selectedLocationId || movePacketMutation.isPending}
            >
              {movePacketMutation.isPending ? "Moving..." : "Move to this location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
