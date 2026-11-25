import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowDownToLine,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  MoreHorizontal,
  RotateCcw,
  Save,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@nextintranet/core"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LocationParentSelect } from "@/components/LocationParentSelect"
import {
  CameraScanDialog,
  type CameraScanOutcome,
} from "@/components/CameraScanDialog"
import { SerialBadge, serialCodeFromPacket } from "@/components/packetSerial"
import { hasAreaLevel, useMe } from "@/hooks/useMe"
import { setScannerCapture } from "@/lib/scannerCapture"
import { useHotkeys } from "@/lib/hotkeys"
import type { ScanSourceContext } from "@/lib/resolveScannedIdentifier"
import type { PaginatedResponse } from "@/lib/inventory"
import { playAlertTone, playFanfare, playSuccessTone } from "@/lib/celebration"
import { packetStateLabel, packetStateOf } from "@/lib/packetState"
import { cn } from "@/lib/utils"

interface LocationNode {
  id: string
  name: string
  full_path: string
  can_store_items?: boolean
  children?: LocationNode[]
}

interface CheckPacket {
  id: string
  count?: number | string | null
  state?: string | null
  is_active?: boolean
  serial_code?: string | null
  serial_number?: number | null
  component: { id: string; name: string }
  location?: { id: string; full_path: string } | null
}

interface IdentifierResponse {
  result?: Array<{ type?: string; id?: string; name?: string }>
}

interface CheckRecordEntry {
  id: string
  component: string
  serial_code: string
  location: string | null
}

interface CheckRecord {
  id: string
  created_at: string
  author_name: string | null
  include_children: boolean
  expected_count: number
  confirmed_count: number
  missing_count: number
  unexpected_count: number
  details: {
    missing?: CheckRecordEntry[]
    unexpected?: CheckRecordEntry[]
  }
}

type ScanResult = "confirmed" | "repeat" | "foreign"

interface LastScan {
  result: ScanResult
  packet: CheckPacket
}

/** Progress of one location's check; kept per browser tab so a reload does not lose it. */
interface StoredProgress {
  found: string[]
  foreign: CheckPacket[]
}

const DEDUPE_MS = 800
const STORAGE_PREFIX = "location-check:"

const lastScanStyles: Record<ScanResult, { panel: string; headline: string }> = {
  confirmed: {
    panel: "border-emerald-300 bg-emerald-50 text-emerald-800",
    headline: "Belongs here",
  },
  repeat: {
    panel: "border-sky-300 bg-sky-50 text-sky-800",
    headline: "Already confirmed",
  },
  foreign: {
    panel: "border-red-300 bg-red-50 text-red-800",
    headline: "Does not belong here",
  },
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

const formatCount = (count: CheckPacket["count"]): string => {
  const numeric = typeof count === "string" ? Number(count) : count
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) {
    return "—"
  }
  return `${Number.isInteger(numeric) ? numeric : numeric.toFixed(2)} pcs`
}

const loadProgress = (locationId: string): StoredProgress => {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + locationId)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredProgress>
      return {
        found: Array.isArray(parsed.found) ? parsed.found : [],
        foreign: Array.isArray(parsed.foreign) ? parsed.foreign : [],
      }
    }
  } catch {
    // Unavailable or corrupted storage only costs the saved progress.
  }
  return { found: [], foreign: [] }
}

const saveProgress = (locationId: string, progress: StoredProgress) => {
  try {
    if (progress.found.length === 0 && progress.foreign.length === 0) {
      sessionStorage.removeItem(STORAGE_PREFIX + locationId)
    } else {
      sessionStorage.setItem(STORAGE_PREFIX + locationId, JSON.stringify(progress))
    }
  } catch {
    // See loadProgress.
  }
}

function PacketRow({
  packet,
  note,
  actions,
}: {
  packet: CheckPacket
  note?: ReactNode
  actions?: ReactNode
}) {
  const state = packetStateOf(packet)
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <SerialBadge code={serialCodeFromPacket(packet)} />
          <Link
            to={`/store/packet/${packet.id}`}
            className="truncate text-sm font-medium hover:underline"
          >
            {packet.component.name}
          </Link>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatCount(packet.count)}
          {state !== "stocked" ? ` · ${packetStateLabel(packet)}` : ""}
          {note ? <> · {note}</> : null}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </li>
  )
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Column({
  title,
  count,
  tone,
  hint,
  empty,
  children,
}: {
  title: string
  count: number
  tone: string
  hint: string
  empty: string
  children: ReactNode
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <CardHeader className={cn("space-y-0.5 border-b px-3 py-2", tone)}>
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span>{title}</span>
          <span className="tabular-nums">{count}</span>
        </CardTitle>
        <p className="text-xs opacity-80">{hint}</p>
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto">{children}</ul>
        )}
      </CardContent>
    </Card>
  )
}

export function LocationCheckPage() {
  const { id: locationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const canMove = hasAreaLevel(me, "warehouse", "write")

  const [includeChildren, setIncludeChildren] = useState(true)
  const [found, setFound] = useState<string[]>([])
  const [foreign, setForeign] = useState<CheckPacket[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<LastScan | null>(null)
  const [scanValue, setScanValue] = useState("")
  const [filter, setFilter] = useState("")
  const [isResolving, setIsResolving] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState<CheckPacket | null>(null)
  const [moveLocationId, setMoveLocationId] = useState<string | null>(null)
  const [retireTarget, setRetireTarget] = useState<CheckPacket | null>(null)

  const scanInputRef = useRef<HTMLInputElement>(null)
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null)
  const celebratedRef = useRef(false)

  const { data: locationsTree, isLoading: locationsLoading } = useQuery<LocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
  })

  const locationLookup = useMemo(
    () => flattenLocations(locationsTree || []),
    [locationsTree],
  )
  const location = locationId ? locationLookup.get(locationId) ?? null : null
  const hasChildren = !!location?.children?.length

  // The API's location filter always covers the whole subtree; narrowing to the
  // exact location happens below.
  const { data: subtreePackets, isLoading: packetsLoading } = useQuery<CheckPacket[]>({
    queryKey: ["location-check-packets", locationId],
    queryFn: async () => {
      const response = await apiFetch<PaginatedResponse<CheckPacket>>(
        `/api/v1/store/packet/?location=${locationId}&is_active=true&page_size=1000`,
      )
      return response.results
    },
    enabled: !!locationId,
  })

  const { data: history } = useQuery<CheckRecord[]>({
    queryKey: ["location-checks", locationId],
    queryFn: async () => {
      const response = await apiFetch<PaginatedResponse<CheckRecord>>(
        `/api/v1/store/location-check/?location=${locationId}&page_size=5`,
      )
      return response.results
    },
    enabled: !!locationId,
  })

  // Restore saved progress when the location changes, then keep it saved.
  useEffect(() => {
    const progress = locationId ? loadProgress(locationId) : { found: [], foreign: [] }
    setFound(progress.found)
    setForeign(progress.foreign)
    setLoadedFor(locationId ?? null)
    setLastScan(null)
    setFilter("")
    celebratedRef.current = false
  }, [locationId])

  useEffect(() => {
    if (locationId && loadedFor === locationId) {
      saveProgress(locationId, { found, foreign })
    }
  }, [found, foreign, loadedFor, locationId])

  const expected = useMemo(
    () =>
      (subtreePackets || []).filter(
        (packet) => includeChildren || packet.location?.id === locationId,
      ),
    [includeChildren, locationId, subtreePackets],
  )
  const expectedById = useMemo(
    () => new Map(expected.map((packet) => [packet.id, packet])),
    [expected],
  )
  const foundSet = useMemo(() => new Set(found), [found])

  const remaining = useMemo(
    () => expected.filter((packet) => !foundSet.has(packet.id)),
    [expected, foundSet],
  )
  const confirmed = useMemo(
    () => expected.filter((packet) => foundSet.has(packet.id)),
    [expected, foundSet],
  )
  // A packet moved here (or a scope change) can make a flagged packet expected.
  const unexpected = useMemo(
    () => foreign.filter((packet) => !expectedById.has(packet.id)),
    [expectedById, foreign],
  )

  const filteredRemaining = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) {
      return remaining
    }
    return remaining.filter(
      (packet) =>
        packet.component.name.toLowerCase().includes(needle) ||
        serialCodeFromPacket(packet).toLowerCase().includes(needle),
    )
  }, [filter, remaining])

  const isComplete =
    expected.length > 0 && remaining.length === 0 && unexpected.length === 0

  useEffect(() => {
    if (isComplete && !celebratedRef.current) {
      celebratedRef.current = true
      playFanfare()
    } else if (!isComplete) {
      celebratedRef.current = false
    }
  }, [isComplete])

  const confirmPacket = useCallback((packetId: string) => {
    setFound((prev) => (prev.includes(packetId) ? prev : [...prev, packetId]))
  }, [])

  const registerPacket = useCallback(
    (packet: CheckPacket) => {
      if (expectedById.has(packet.id)) {
        const repeat = foundSet.has(packet.id)
        confirmPacket(packet.id)
        setLastScan({ result: repeat ? "repeat" : "confirmed", packet })
        playSuccessTone()
        return
      }
      setForeign((prev) => [packet, ...prev.filter((item) => item.id !== packet.id)])
      setLastScan({ result: "foreign", packet })
      playAlertTone()
    },
    [confirmPacket, expectedById, foundSet],
  )

  const handleScan = useCallback(
    async (rawText: string, source?: ScanSourceContext) => {
      const text = rawText.trim()
      if (!text) {
        return
      }

      // The camera decodes the same label many times a second, and hardware
      // scanners repeat on a long trigger press.
      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.text === text && now - last.ts < DEDUPE_MS) {
        return
      }
      lastScanRef.current = { text, ts: now }

      setIsResolving(true)
      try {
        const response = await apiFetch<IdentifierResponse>("/api/v1/core/identifier/", {
          method: "POST",
          body: JSON.stringify({
            codeReader: "barcode",
            scanDateTime: new Date().toISOString(),
            data: text,
            q: null,
            parsedData: {},
            stationId: source?.stationId ?? null,
            agentId: source?.agentId ?? null,
            deviceId: source?.deviceId ?? null,
          }),
        })

        const match = response?.result?.[0]
        if (!match?.id) {
          playAlertTone()
          toast.error("Unknown code.")
          return
        }

        if (match.type === "location") {
          if (match.id !== locationId) {
            navigate(`/store/location-check/${match.id}`)
          }
          return
        }

        if (match.type === "packet") {
          if (!locationId) {
            playAlertTone()
            toast.error("Select or scan a location first.")
            return
          }
          const known = expectedById.get(match.id)
          registerPacket(
            known ?? (await apiFetch<CheckPacket>(`/api/v1/store/packet/${match.id}/`)),
          )
          return
        }

        playAlertTone()
        toast.error("Scan a packet or a location label.")
      } catch {
        playAlertTone()
        toast.error("Could not look up the scanned code.")
      } finally {
        setIsResolving(false)
      }
    },
    [expectedById, locationId, navigate, registerPacket],
  )

  // Hardware scanners and the global camera button both route through
  // resolveScannedIdentifier, which hands the text here before it navigates away.
  useEffect(() => {
    setScannerCapture((text, source) => {
      void handleScan(text, source)
    })
    return () => setScannerCapture(null)
  }, [handleScan])

  const moveHereMutation = useMutation({
    mutationFn: (packet: CheckPacket) =>
      apiFetch(`/api/v1/store/packet/${packet.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ location: locationId }),
      }),
    onSuccess: async (_data, packet) => {
      confirmPacket(packet.id)
      queryClient.invalidateQueries({ queryKey: ["packet", packet.id] })
      await queryClient.invalidateQueries({ queryKey: ["location-check-packets"] })
      setForeign((prev) => prev.filter((item) => item.id !== packet.id))
      toast.success("Packet moved to this location.")
    },
    onError: () => {
      toast.error("Failed to move packet.")
    },
  })

  const refreshPacket = (packetId: string) => {
    queryClient.invalidateQueries({ queryKey: ["packet", packetId] })
    return queryClient.invalidateQueries({ queryKey: ["location-check-packets"] })
  }

  // A missing packet that turned up elsewhere: store it where it really is.
  const moveElsewhereMutation = useMutation({
    mutationFn: (payload: { packet: CheckPacket; target: string }) =>
      apiFetch(`/api/v1/store/packet/${payload.packet.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ location: payload.target }),
      }),
    onSuccess: async (_data, payload) => {
      await refreshPacket(payload.packet.id)
      setMoveTarget(null)
      toast.success("Packet moved.")
    },
    onError: () => {
      toast.error("Failed to move packet.")
    },
  })

  // A missing packet that is gone for good.
  const retireMutation = useMutation({
    mutationFn: (packet: CheckPacket) =>
      apiFetch(`/api/v1/store/packet/${packet.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ state: "retired" }),
      }),
    onSuccess: async (_data, packet) => {
      await refreshPacket(packet.id)
      setRetireTarget(null)
      toast.success("Packet retired.")
    },
    onError: () => {
      toast.error("Failed to retire packet.")
    },
  })

  const saveCheckMutation = useMutation({
    mutationFn: () =>
      apiFetch<CheckRecord>("/api/v1/store/location-check/", {
        method: "POST",
        body: JSON.stringify({
          location: locationId,
          include_children: includeChildren,
          found: confirmed.map((packet) => packet.id),
          unexpected: unexpected.map((packet) => packet.id),
        }),
      }),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ["location-checks", locationId] })
      toast.success(
        record.missing_count || record.unexpected_count
          ? `Check saved: ${record.missing_count} missing, ${record.unexpected_count} unexpected.`
          : "Check saved: location verified.",
      )
    },
    onError: () => {
      toast.error("Failed to save the check.")
    },
  })

  const handleManualSubmit = () => {
    const value = scanValue.trim()
    if (!value) {
      return
    }
    setScanValue("")
    void handleScan(value)
  }

  const handleReset = () => {
    setFound([])
    setForeign([])
    setLastScan(null)
  }

  useHotkeys([
    {
      keys: "s",
      description: "Focus scan input",
      group: "Location check",
      handler: () => {
        scanInputRef.current?.focus()
        scanInputRef.current?.select()
      },
    },
  ])

  const lastStyle = lastScan ? lastScanStyles[lastScan.result] : null
  const canStoreHere = location?.can_store_items !== false
  const moveDisabledReason = !canMove
    ? "You need write access to move packets"
    : !canStoreHere
      ? "This location cannot store items"
      : null

  return (
    <div className="w-full px-4 py-6 lg:px-6">
      <div className="flex w-full flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Location check</h1>
          <p className="text-sm text-muted-foreground">
            Scan everything stored in one location and compare it with what the
            warehouse expects there.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <LocationParentSelect
                locations={locationsTree || []}
                value={locationId ?? null}
                onChange={(value) =>
                  navigate(value ? `/store/location-check/${value}` : "/store/location-check")
                }
                isLoading={locationsLoading}
                emptyLabel="No location selected"
                placeholder="Select or scan a location"
              />
              {hasChildren ? (
                <div className="flex items-center gap-2">
                  <Switch
                    id="location-check-children"
                    checked={includeChildren}
                    onCheckedChange={setIncludeChildren}
                  />
                  <Label htmlFor="location-check-children" className="text-sm font-normal">
                    Include sub-locations
                  </Label>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                ref={scanInputRef}
                className="h-10 min-w-40 flex-1"
                placeholder="Scan or type a code"
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    handleManualSubmit()
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => setCameraOpen(true)}
              >
                <Camera className="mr-2 h-4 w-4" />
                Camera
              </Button>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={found.length === 0 && foreign.length === 0}
                onClick={handleReset}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Start over
              </Button>
              <Button
                type="button"
                className="shrink-0"
                disabled={!locationId || packetsLoading || saveCheckMutation.isPending}
                onClick={() => saveCheckMutation.mutate()}
              >
                <Save className="mr-2 h-4 w-4" />
                Save check
              </Button>
            </div>
          </CardContent>
        </Card>

        {!locationId ? (
          <div className="rounded-lg border-2 border-dashed border-muted bg-muted/30 p-10 text-center text-muted-foreground">
            Select a location or scan its label to start.
          </div>
        ) : (
          <>
            <div
              className={cn(
                "flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg border-2 px-4 py-3",
                isComplete
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : lastStyle
                    ? lastStyle.panel
                    : "border-dashed border-muted bg-muted/30 text-muted-foreground",
              )}
            >
              {isComplete ? (
                <p className="flex items-center gap-2 text-lg font-semibold">
                  <CheckCircle2 className="h-5 w-5" aria-hidden />
                  Location verified — everything is where it should be.
                </p>
              ) : lastScan && lastStyle ? (
                <div className="min-w-0">
                  <p className="text-lg font-bold uppercase tracking-tight">
                    {lastStyle.headline}
                  </p>
                  <p className="truncate text-sm">
                    {lastScan.packet.component.name}
                    {serialCodeFromPacket(lastScan.packet)
                      ? ` · ${serialCodeFromPacket(lastScan.packet)}`
                      : ""}
                    {lastScan.result === "foreign"
                      ? ` · belongs in ${lastScan.packet.location?.full_path ?? "no location"}`
                      : ""}
                  </p>
                </div>
              ) : (
                <p>{isResolving ? "Looking up code…" : "Scan the packets in this location."}</p>
              )}
              <p className="text-sm font-medium tabular-nums">
                {confirmed.length} / {expected.length} confirmed
                {unexpected.length > 0 ? ` · ${unexpected.length} unexpected` : ""}
              </p>
            </div>

            {packetsLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Column
                  title="Not found yet"
                  count={remaining.length}
                  tone="bg-amber-50 text-amber-900"
                  hint="Expected here. What stays in this list is missing."
                  empty={
                    expected.length === 0
                      ? "The warehouse expects nothing here."
                      : "Everything expected has been found."
                  }
                >
                  {remaining.length > 8 ? (
                    <li className="p-2">
                      <Input
                        className="h-8"
                        placeholder="Filter by name or serial"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                      />
                    </li>
                  ) : null}
                  {filteredRemaining.map((packet) => (
                    <PacketRow
                      key={packet.id}
                      packet={packet}
                      note={
                        packet.location?.id !== locationId
                          ? packet.location?.full_path
                          : undefined
                      }
                      actions={
                        <>
                          <IconAction
                            label="Mark as found"
                            onClick={() => registerPacket(packet)}
                          >
                            <Check className="h-4 w-4" />
                          </IconAction>
                          {canMove ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label="Resolve missing packet"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onSelect={() => {
                                    setMoveLocationId(null)
                                    setMoveTarget(packet)
                                  }}
                                >
                                  Found elsewhere — move…
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setRetireTarget(packet)}>
                                  Lost — retire packet…
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </>
                      }
                    />
                  ))}
                </Column>

                <Column
                  title="Confirmed"
                  count={confirmed.length}
                  tone="bg-emerald-50 text-emerald-900"
                  hint="Expected here and physically present."
                  empty="Nothing confirmed yet."
                >
                  {confirmed.map((packet) => (
                    <PacketRow
                      key={packet.id}
                      packet={packet}
                      note={
                        packet.location?.id !== locationId
                          ? packet.location?.full_path
                          : undefined
                      }
                      actions={
                        <IconAction
                          label="Undo"
                          onClick={() =>
                            setFound((prev) => prev.filter((item) => item !== packet.id))
                          }
                        >
                          <Undo2 className="h-4 w-4" />
                        </IconAction>
                      }
                    />
                  ))}
                </Column>

                <Column
                  title="Does not belong here"
                  count={unexpected.length}
                  tone="bg-red-50 text-red-900"
                  hint="Physically here, but stored elsewhere. Resolve each one."
                  empty="No unexpected packets."
                >
                  {unexpected.map((packet) => (
                    <PacketRow
                      key={packet.id}
                      packet={packet}
                      note={
                        packet.location
                          ? `belongs in ${packet.location.full_path}`
                          : "no location assigned"
                      }
                      actions={
                        <>
                          <IconAction
                            label={moveDisabledReason ?? "Move to this location"}
                            disabled={!!moveDisabledReason || moveHereMutation.isPending}
                            onClick={() => moveHereMutation.mutate(packet)}
                          >
                            <ArrowDownToLine className="h-4 w-4" />
                          </IconAction>
                          {packet.location ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  asChild
                                >
                                  <Link
                                    to={`/store/location/${packet.location.id}`}
                                    aria-label="Open home location"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open home location</TooltipContent>
                            </Tooltip>
                          ) : null}
                          <IconAction
                            label="Remove from list (returned to its place)"
                            onClick={() =>
                              setForeign((prev) =>
                                prev.filter((item) => item.id !== packet.id),
                              )
                            }
                          >
                            <X className="h-4 w-4" />
                          </IconAction>
                        </>
                      }
                    />
                  ))}
                </Column>
              </div>
            )}

            {history?.length ? (
              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Previous checks
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y border-t text-sm">
                    {history.map((record) => {
                      const issues = [
                        ...(record.details.missing ?? []).map((entry) => ({
                          ...entry,
                          kind: "Missing",
                        })),
                        ...(record.details.unexpected ?? []).map((entry) => ({
                          ...entry,
                          kind: "Unexpected",
                        })),
                      ]
                      const clean = issues.length === 0
                      return (
                        <li key={record.id} className="px-4 py-2">
                          <details>
                            <summary
                              className={cn(
                                "flex flex-wrap items-center justify-between gap-x-4 gap-y-1",
                                clean ? "list-none" : "cursor-pointer",
                              )}
                            >
                              <span>
                                {new Date(record.created_at).toLocaleString()}
                                <span className="text-muted-foreground">
                                  {record.author_name ? ` · ${record.author_name}` : ""}
                                  {record.include_children ? "" : " · without sub-locations"}
                                </span>
                              </span>
                              <span
                                className={cn(
                                  "font-medium tabular-nums",
                                  clean ? "text-emerald-600" : "text-red-600",
                                )}
                              >
                                {record.confirmed_count} / {record.expected_count} confirmed
                                {record.missing_count
                                  ? ` · ${record.missing_count} missing`
                                  : ""}
                                {record.unexpected_count
                                  ? ` · ${record.unexpected_count} unexpected`
                                  : ""}
                              </span>
                            </summary>
                            {clean ? null : (
                              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {issues.map((entry) => (
                                  <li key={`${entry.kind}-${entry.id}`}>
                                    {entry.kind}:{" "}
                                    <Link
                                      to={`/store/packet/${entry.id}`}
                                      className="text-foreground hover:underline"
                                    >
                                      {entry.component}
                                      {entry.serial_code ? ` · ${entry.serial_code}` : ""}
                                    </Link>
                                    {entry.kind === "Unexpected"
                                      ? ` · belonged in ${entry.location ?? "no location"}`
                                      : ""}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </details>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={!!moveTarget} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move packet</DialogTitle>
            <DialogDescription>
              {moveTarget?.component.name}
              {moveTarget && serialCodeFromPacket(moveTarget)
                ? ` · ${serialCodeFromPacket(moveTarget)}`
                : ""}{" "}
              is not here. Pick the location where it actually is.
            </DialogDescription>
          </DialogHeader>
          <LocationParentSelect
            locations={locationsTree || []}
            value={moveLocationId}
            onChange={setMoveLocationId}
            isLoading={locationsLoading}
            emptyLabel="No location selected"
            placeholder="Select a location"
          />
          {moveLocationId && locationLookup.get(moveLocationId)?.can_store_items === false ? (
            <p className="text-sm text-destructive">This location cannot store items.</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !moveTarget ||
                !moveLocationId ||
                moveLocationId === moveTarget.location?.id ||
                locationLookup.get(moveLocationId)?.can_store_items === false ||
                moveElsewhereMutation.isPending
              }
              onClick={() =>
                moveTarget &&
                moveLocationId &&
                moveElsewhereMutation.mutate({ packet: moveTarget, target: moveLocationId })
              }
            >
              Move packet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!retireTarget} onOpenChange={(open) => !open && setRetireTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire packet?</DialogTitle>
            <DialogDescription>
              {retireTarget?.component.name}
              {retireTarget && serialCodeFromPacket(retireTarget)
                ? ` · ${serialCodeFromPacket(retireTarget)}`
                : ""}{" "}
              ({retireTarget ? formatCount(retireTarget.count) : ""}) will be marked as
              retired and no longer count as usable stock. You can reactivate it on the
              packet detail page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRetireTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={retireMutation.isPending}
              onClick={() => retireTarget && retireMutation.mutate(retireTarget)}
            >
              Retire packet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraScanDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={async (text): Promise<CameraScanOutcome> => {
          await handleScan(text)
          // Stay open so a whole location can be checked without reopening the camera.
          return "continue"
        }}
        title="Scan packet or location"
        description="Point the label at the camera. The camera stays open so you can scan one packet after another."
        busyLabel="Checking…"
      />
    </div>
  )
}
