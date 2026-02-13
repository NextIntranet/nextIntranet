import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, nextIO } from "@nextintranet/core"
import { toast } from "sonner"

import { ComponentInfoPopover } from "@/components/ComponentInfoPopover"
import { LocationParentSelect } from "@/components/LocationParentSelect"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getOperationLabel } from "@/lib/stockOperations"

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
  count?: number | null
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

const playAlertTone = () => {
  if (typeof window === "undefined") {
    return
  }
  const AudioContext =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof window.AudioContext })
      .webkitAudioContext
  if (!AudioContext) {
    return
  }
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "triangle"
    oscillator.frequency.value = 880
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25)
    oscillator.stop(context.currentTime + 0.27)
    oscillator.onended = () => {
      context.close()
    }
  } catch {}
}

const packetIdRegex =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/

const extractPacketId = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const cleaned = trimmed.replace(/;$/, "")

  if (cleaned.includes("packet=")) {
    const query = cleaned.startsWith("?") ? cleaned : cleaned.split("?")[1] || cleaned
    const params = new URLSearchParams(query)
    const packetId = params.get("packet")
    if (packetId) {
      return packetId
    }
  }

  if (cleaned.includes("/store/packet/")) {
    const match = cleaned.match(/\/store\/packet\/([^/?#]+)/)
    if (match?.[1]) {
      return match[1]
    }
  }

  const directMatch = cleaned.match(packetIdRegex)
  if (directMatch?.[0]) {
    return directMatch[0]
  }

  return null
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
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null)
  const urlSyncRef = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedLocationId, setSelectedLocationId] = useState("")
  const [locationScanValue, setLocationScanValue] = useState("")
  const [packetScanValue, setPacketScanValue] = useState("")
  const [selectedPacketId, setSelectedPacketId] = useState("")
  const [selectedPacketOverride, setSelectedPacketOverride] = useState<Packet | null>(
    null,
  )
  const [movePromptPacket, setMovePromptPacket] = useState<Packet | null>(null)
  const [newCount, setNewCount] = useState("")
  const [description, setDescription] = useState("")

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

  const selectedPacket =
    selectedPacketOverride ?? packets.find((packet) => packet.id === selectedPacketId)

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

  const isSelectedInventoried = selectedPacket
    ? inventoriedPacketIds.has(selectedPacket.id)
    : false
  const currentCount = selectedPacket?.count ?? 0
  const parsedNewCount = newCount.trim() === "" ? null : Number(newCount)
  const diff =
    parsedNewCount === null || Number.isNaN(parsedNewCount)
      ? null
      : parsedNewCount - currentCount

  useEffect(() => {
    const locationParam = searchParams.get("location-id") ?? ""
    const packetParam = searchParams.get("packet-id") ?? ""

    if (locationParam !== selectedLocationId) {
      setSelectedLocationId(locationParam)
    }
    if (packetParam !== selectedPacketId) {
      setSelectedPacketId(packetParam)
      setSelectedPacketOverride(null)
    }

    urlSyncRef.current = true
  }, [searchParams])

  useEffect(() => {
    if (!urlSyncRef.current) {
      return
    }
    const nextParams = new URLSearchParams(searchParams)
    const locationParam = selectedLocationId.trim()
    const packetParam = selectedPacketId.trim()

    if (locationParam) {
      nextParams.set("location-id", locationParam)
    } else {
      nextParams.delete("location-id")
    }

    if (packetParam) {
      nextParams.set("packet-id", packetParam)
    } else {
      nextParams.delete("packet-id")
    }

    const nextQuery = nextParams.toString()
    if (nextQuery !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, selectedLocationId, selectedPacketId, setSearchParams])

  useEffect(() => {
    if (!selectedPacket) {
      return
    }
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

      const packetId = extractPacketId(text)
      if (!packetId) {
        playAlertTone()
        toast.error("Scanned code is not a packet.")
        return
      }

      try {
        const packet = await apiFetch<Packet>(`/api/v1/store/packet/${packetId}/`)
        setSelectedPacketId(packet.id)
        setSelectedPacketOverride(packet)
        setPacketScanValue("")
        setNewCount("")
        if (selectedLocationId && packet.location?.id !== selectedLocationId) {
          playAlertTone()
          setMovePromptPacket(packet)
          return
        }
        if (packet.location?.id && !selectedLocationId) {
          setSelectedLocationId(packet.location.id)
        }
        if (inventoriedPacketIds.has(packet.id)) {
          playAlertTone()
          toast("Inventory already recorded for this packet.")
        }
      } catch {
        playAlertTone()
        toast.error("Packet not found.")
      }
    })

    return unsubscribe
  }, [inventoriedPacketIds, selectedLocationId])

  const inventoryMutation = useMutation({
    mutationFn: (payload: {
      packet: string
      quantity: number
      description?: string | null
      reference?: string | null
    }) =>
      apiFetch("/api/v1/store/packet/operation/", {
        method: "POST",
        body: JSON.stringify({
          packet: payload.packet,
          operation_type: "inventory",
          quantity: payload.quantity,
          relative_quantity: true,
          description: payload.description,
          reference: payload.reference,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-packets", selectedLocationId] })
      queryClient.invalidateQueries({
        queryKey: ["stocktaking-operations", activeCampaign?.id],
      })
      toast.success("Inventory recorded.")
      setNewCount("")
      setDescription("")
    },
    onError: () => {
      toast.error("Failed to record inventory.")
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
      return
    }
    toast.error("Location not found.")
  }

  const handlePacketScan = async () => {
    const value = packetScanValue.trim()
    if (!value) {
      return
    }
    const match = packets.find((packet) => packet.id === value)
    if (match) {
      setSelectedPacketId(match.id)
      setSelectedPacketOverride(null)
      setPacketScanValue("")
      setNewCount("")
      if (inventoriedPacketIds.has(match.id)) {
        playAlertTone()
        toast("Inventory already recorded for this packet.")
      }
      return
    }

    try {
      const packet = await apiFetch<Packet>(`/api/v1/store/packet/${value}/`)
      setSelectedPacketId(packet.id)
      setSelectedPacketOverride(packet)
      setPacketScanValue("")
      setNewCount("")
      if (inventoriedPacketIds.has(packet.id)) {
        playAlertTone()
        toast("Inventory already recorded for this packet.")
      }
      if (selectedLocationId && packet.location?.id !== selectedLocationId) {
        playAlertTone()
        setMovePromptPacket(packet)
        return
      }
      if (packet.location?.id && !selectedLocationId) {
        setSelectedLocationId(packet.location.id)
      }
    } catch {
      toast.error("Packet not found.")
    }
  }

  const handleSubmit = () => {
    if (!selectedPacket || diff === null || !activeCampaign) {
      return
    }
    inventoryMutation.mutate({
      packet: selectedPacket.id,
      quantity: diff,
      description: description.trim() || null,
      reference: activeCampaign.id,
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
    diff !== null &&
    !Number.isNaN(diff) &&
    !!activeCampaign &&
    !inventoryMutation.isPending

  const allInventoried =
    !!activeCampaign && selectedLocationId && packets.length > 0 && !visiblePackets.length

  const movePromptLocation = movePromptPacket?.location?.full_path || "No location"
  const moveTargetLocation = selectedLocation?.full_path || "this location"
  const hasPacketHistory = packetOperations.length > 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Record the actual counts per packet and location.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inventory entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedPacket ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Recorded count
                      </label>
                      <Input
                        value={selectedPacket ? String(currentCount) : ""}
                        disabled
                        className="h-14 text-lg font-semibold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">
                        Current count
                      </label>
                      <Input
                        ref={countInputRef}
                        type="number"
                        value={newCount}
                        onChange={(e) => setNewCount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            if (canSubmit) {
                              handleSubmit()
                            }
                          }
                        }}
                        placeholder="Enter current count"
                        className="h-14 text-lg font-semibold"
                        disabled={false}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Difference:</span>{" "}
                    <span className="font-medium text-foreground">
                      {diff === null || Number.isNaN(diff) ? "-" : diff}
                    </span>
                  </div>
                  {isSelectedInventoried && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
                      Inventory already recorded for this packet in this campaign. You
                      can record it again if needed.
                    </div>
                  )}
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
                  <Button onClick={handleSubmit} disabled={!canSubmit}>
                    {inventoryMutation.isPending ? "Saving..." : "Record inventory"}
                  </Button>
                  {!activeCampaign && (
                    <p className="text-xs text-muted-foreground">
                      Open an inventory campaign to record counts.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a packet to start counting.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/70">
            <CardHeader>
              <CardTitle>Selected packet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedPacket ? (
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
                        <p className="text-foreground">
                          {selectedPacket.location?.full_path || "-"}
                        </p>
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
                <p className="text-sm text-muted-foreground">
                  No active inventory campaign. Open a campaign to start counting.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Scan location</label>
                <div className="flex gap-2">
                  <Input
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
                    }}
                    emptyLabel="No location"
                    placeholder="Select location"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Packets in location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeCampaign && (
                <p className="text-xs text-muted-foreground">
                  Showing only packets without inventory for this campaign.
                </p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Scan packet</label>
                <div className="flex gap-2">
                  <Input
                    value={packetScanValue}
                    onChange={(e) => setPacketScanValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void handlePacketScan()
                      }
                    }}
                    placeholder="Scan or paste packet ID"
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
                    {visiblePackets.map((packet) => (
                      <button
                        key={packet.id}
                        type="button"
                        onClick={() => {
                          setSelectedPacketId(packet.id)
                          setSelectedPacketOverride(null)
                          setNewCount("")
                        }}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                          selectedPacketId === packet.id
                            ? "bg-muted/40 text-foreground"
                            : "hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-foreground">
                            {packet.component.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {packet.id}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {packet.count ?? 0}
                        </div>
                      </button>
                    ))}
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
