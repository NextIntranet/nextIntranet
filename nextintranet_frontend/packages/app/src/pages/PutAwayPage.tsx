import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Camera, PackageSearch, ScanBarcode } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@nextintranet/core"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LocationParentSelect } from "@/components/LocationParentSelect"
import {
  CameraScanDialog,
  type CameraScanOutcome,
} from "@/components/CameraScanDialog"
import { setScannerCapture } from "@/lib/scannerCapture"
import { useHotkeys } from "@/lib/hotkeys"
import type { ScanSourceContext } from "@/lib/resolveScannedIdentifier"
import { playAlertTone, playSuccessTone } from "@/lib/celebration"
import { packetStateLabel, packetStateOf } from "@/lib/packetState"

interface LocationNode {
  id: string
  name: string
  full_path: string
  can_store_items?: boolean
  children?: LocationNode[]
}

interface ScannedLocation {
  id: string
  full_path: string
  can_store_items?: boolean
}

interface ScannedPacket {
  id: string
  count?: number | string | null
  state?: string | null
  is_active?: boolean
  serial_code?: string | null
  component: { id: string; name: string }
  location?: { id: string; full_path: string } | null
}

interface IdentifierResponse {
  result?: Array<{ type?: string; id?: string; name?: string }>
}

type Verdict = "MATCH" | "MISMATCH" | "NO_HOME"

interface HistoryEntry {
  key: string
  at: string
  packetName: string
  serialCode?: string | null
  verdict: Verdict
  belongsIn: string | null
}

type Mode = "pair" | "fixed"

const DEDUPE_MS = 800

const verdictStyles: Record<Verdict, { panel: string; headline: string }> = {
  MATCH: {
    panel: "border-emerald-300 bg-emerald-50 text-emerald-800",
    headline: "Belongs here",
  },
  MISMATCH: {
    panel: "border-red-300 bg-red-50 text-red-800",
    headline: "Does not belong",
  },
  NO_HOME: {
    panel: "border-amber-300 bg-amber-50 text-amber-800",
    headline: "No location assigned",
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

const formatCount = (count: ScannedPacket["count"]): string => {
  const numeric = typeof count === "string" ? Number(count) : count
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) {
    return "—"
  }
  // Counts are decimals on the backend but are whole numbers in practice.
  return `${Number.isInteger(numeric) ? numeric : numeric.toFixed(2)} pcs`
}

export function PutAwayPage() {
  const [mode, setMode] = useState<Mode>("pair")
  const [location, setLocation] = useState<ScannedLocation | null>(null)
  const [packet, setPacket] = useState<ScannedPacket | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [scanValue, setScanValue] = useState("")
  const [isResolving, setIsResolving] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)

  const scanInputRef = useRef<HTMLInputElement>(null)
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null)

  const { data: locationsTree, isLoading: locationsLoading } = useQuery<LocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
  })

  const locationLookup = useMemo(
    () => flattenLocations(locationsTree || []),
    [locationsTree],
  )

  const pushHistory = useCallback(
    (scannedPacket: ScannedPacket, result: Verdict) => {
      setHistory((prev) =>
        [
          {
            key: `${scannedPacket.id}-${Date.now()}`,
            at: new Date().toLocaleTimeString(),
            packetName: scannedPacket.component.name,
            serialCode: scannedPacket.serial_code,
            verdict: result,
            belongsIn: scannedPacket.location?.full_path ?? null,
          },
          ...prev,
        ].slice(0, 10),
      )
    },
    [],
  )

  /**
   * A verdict needs both halves. In fixed mode the location stays put, so every
   * packet scan resolves immediately; in pair mode both slots clear afterwards so
   * the next bag starts from scratch.
   */
  const evaluate = useCallback(
    (scannedPacket: ScannedPacket, against: ScannedLocation, currentMode: Mode) => {
      let result: Verdict
      if (!scannedPacket.location?.id) {
        result = "NO_HOME"
      } else if (scannedPacket.location.id === against.id) {
        result = "MATCH"
      } else {
        result = "MISMATCH"
      }

      setVerdict(result)
      pushHistory(scannedPacket, result)

      if (result === "MATCH") {
        playSuccessTone()
      } else {
        playAlertTone()
      }

      if (currentMode === "pair") {
        setLocation(null)
      }
    },
    [pushHistory],
  )

  const resolveLocation = useCallback(
    async (id: string): Promise<ScannedLocation> => {
      const cached = locationLookup.get(id)
      if (cached) {
        return {
          id: cached.id,
          full_path: cached.full_path,
          can_store_items: cached.can_store_items,
        }
      }
      // The tree query is cached, so a location created since the page loaded
      // would otherwise be unresolvable.
      const fresh = await apiFetch<ScannedLocation>(`/api/v1/store/location/${id}/`)
      return fresh
    },
    [locationLookup],
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
        // One shared lookup for every label generation, and it writes the scan
        // audit row on the backend.
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
          const scannedLocation = await resolveLocation(match.id)
          setLocation(scannedLocation)
          setVerdict(null)
          if (mode === "pair" && packet) {
            evaluate(packet, scannedLocation, mode)
          }
          return
        }

        if (match.type === "packet") {
          const scannedPacket = await apiFetch<ScannedPacket>(
            `/api/v1/store/packet/${match.id}/`,
          )
          setPacket(scannedPacket)
          if (location) {
            evaluate(scannedPacket, location, mode)
          } else {
            setVerdict(null)
          }
          return
        }

        playAlertTone()
        toast.error("Scan a bag or a location label.")
      } catch {
        playAlertTone()
        toast.error("Could not look up the scanned code.")
      } finally {
        setIsResolving(false)
      }
    },
    [evaluate, location, mode, packet, resolveLocation],
  )

  // Hardware scanners and the global camera FAB both route through
  // resolveScannedIdentifier, which hands the text here before it navigates away.
  useEffect(() => {
    setScannerCapture((text, source) => {
      void handleScan(text, source)
    })
    return () => setScannerCapture(null)
  }, [handleScan])

  const handleManualSubmit = () => {
    const value = scanValue.trim()
    if (!value) {
      return
    }
    setScanValue("")
    void handleScan(value)
  }

  const handleModeChange = (next: Mode) => {
    setMode(next)
    setVerdict(null)
    setPacket(null)
    if (next === "pair") {
      setLocation(null)
    }
  }

  const handlePickLocation = (id: string | null) => {
    if (!id) {
      setLocation(null)
      setVerdict(null)
      return
    }
    const node = locationLookup.get(id)
    if (!node) {
      return
    }
    const picked: ScannedLocation = {
      id: node.id,
      full_path: node.full_path,
      can_store_items: node.can_store_items,
    }
    setLocation(picked)
    setVerdict(null)
    if (packet) {
      evaluate(packet, picked, mode)
    }
  }

  useHotkeys([
    {
      keys: "s",
      description: "Focus scan input",
      group: "Put-away check",
      handler: () => {
        scanInputRef.current?.focus()
        scanInputRef.current?.select()
      },
    },
    {
      keys: "m",
      description: "Switch between bag+shelf and fixed shelf",
      group: "Put-away check",
      handler: () => handleModeChange(mode === "pair" ? "fixed" : "pair"),
    },
  ])

  const style = verdict ? verdictStyles[verdict] : null
  const packetState = packet ? packetStateOf(packet) : null

  return (
    <div className="w-full px-4 py-6 lg:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Put-away check</h1>
          <p className="text-sm text-muted-foreground">
            Scan a bag and a shelf to check whether the bag belongs there. Nothing is
            moved or changed.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="lg"
            variant={mode === "pair" ? "default" : "outline"}
            className="h-14 text-base"
            onClick={() => handleModeChange("pair")}
          >
            Bag + shelf
          </Button>
          <Button
            type="button"
            size="lg"
            variant={mode === "fixed" ? "default" : "outline"}
            className="h-14 text-base"
            onClick={() => handleModeChange("fixed")}
          >
            Fixed shelf
          </Button>
        </div>

        {mode === "fixed" ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Shelf
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <LocationParentSelect
                locations={locationsTree || []}
                value={location?.id ?? null}
                onChange={handlePickLocation}
                isLoading={locationsLoading}
                emptyLabel="No shelf selected"
                placeholder="Select or scan a shelf"
              />
              {location ? (
                <p className="text-lg font-medium">{location.full_path}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick a shelf or scan its label, then scan bags one after another.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <Card className={packet ? "border-primary" : undefined}>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Bag</p>
                <p className="truncate text-base font-medium">
                  {packet ? packet.component.name : "Waiting for scan…"}
                </p>
              </CardContent>
            </Card>
            <Card className={location ? "border-primary" : undefined}>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-muted-foreground">Shelf</p>
                <p className="truncate text-base font-medium">
                  {location ? location.full_path : "Waiting for scan…"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div
          className={`flex min-h-[45vh] flex-col items-center justify-center gap-3 rounded-lg border-2 p-6 text-center ${
            style ? style.panel : "border-dashed border-muted bg-muted/30"
          }`}
        >
          {style && packet ? (
            <>
              <p className="text-4xl font-bold uppercase tracking-tight sm:text-5xl">
                {style.headline}
              </p>
              <p className="text-lg font-medium">
                {packet.component.name}
                {packet.serial_code ? ` · ${packet.serial_code}` : ""} ·{" "}
                {formatCount(packet.count)}
              </p>
              {verdict === "MISMATCH" && packet.location ? (
                <div className="pt-2">
                  <p className="text-sm uppercase tracking-wide">Belongs in</p>
                  <p className="text-2xl font-semibold sm:text-3xl">
                    {packet.location.full_path}
                  </p>
                </div>
              ) : null}
              {packetState && packetState !== "stocked" ? (
                <p className="text-sm font-medium">
                  This bag is {packetStateLabel(packet).toLowerCase()} — it should not be
                  shelved as stock.
                </p>
              ) : null}
              {location && location.can_store_items === false ? (
                <p className="text-sm font-medium">This location cannot store items.</p>
              ) : null}
            </>
          ) : (
            <>
              <PackageSearch className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-lg text-muted-foreground">
                {isResolving
                  ? "Looking up code…"
                  : mode === "fixed" && !location
                    ? "Select a shelf to start."
                    : "Scan a bag and a shelf."}
              </p>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            ref={scanInputRef}
            className="h-12 text-base"
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
            className="h-12 shrink-0"
            onClick={() => setCameraOpen(true)}
          >
            <Camera className="mr-2 h-4 w-4" />
            Camera
          </Button>
        </div>

        {history.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Recent scans
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y text-sm">
                {history.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ScanBarcode
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="truncate">
                        {entry.packetName}
                        {entry.serialCode ? ` · ${entry.serialCode}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={
                          entry.verdict === "MATCH"
                            ? "font-medium text-emerald-600"
                            : entry.verdict === "MISMATCH"
                              ? "font-medium text-red-600"
                              : "font-medium text-amber-600"
                        }
                      >
                        {verdictStyles[entry.verdict].headline}
                      </span>
                      {entry.verdict === "MISMATCH" && entry.belongsIn ? (
                        <span className="block text-xs text-muted-foreground">
                          → {entry.belongsIn}
                        </span>
                      ) : null}
                      <span className="block text-xs text-muted-foreground">
                        {entry.at}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <CameraScanDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={async (text): Promise<CameraScanOutcome> => {
          await handleScan(text)
          // Stay open so a whole shelf can be checked without reopening the camera.
          return "continue"
        }}
        title="Scan bag or shelf"
        description="Point the label at the camera. The camera stays open so you can scan one bag after another."
        busyLabel="Checking…"
      />
    </div>
  )
}
