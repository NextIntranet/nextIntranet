import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { nextIO, loadStationProfile } from "@nextintranet/core"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type {
  AgentProfile,
  BrowserDeviceProfile,
  BrowserSerialDeviceParams,
  BrowserSerialPort,
  BrowserSerialPortInfo,
  StationProfile,
} from "@nextintranet/core"

const createAgentId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `agent-${Date.now()}`
}

const createBrowserDeviceId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `browser-device-${Date.now()}`
}

const formatUsbId = (value?: number) => {
  if (value === undefined || value === null) {
    return "unknown"
  }
  return `0x${value.toString(16).padStart(4, "0")}`
}

const formatPortInfo = (info?: BrowserSerialPortInfo | null) => {
  if (!info) {
    return "Unknown"
  }
  return `${formatUsbId(info.usbVendorId)}:${formatUsbId(info.usbProductId)}`
}

const parseBaudrate = (value: string) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

type AgentDraft = {
  id: string
  label: string
  baseUrl: string
  token: string
  capabilities: string
  config: string
}

type BrowserScannerDraft = {
  label: string
  baudrate: string
  port: BrowserSerialPort | null
  portInfo: BrowserSerialPortInfo | null
}

const createDraftFromAgent = (agent: AgentProfile): AgentDraft => ({
  id: agent.id,
  label: agent.label ?? "",
  baseUrl: agent.baseUrl,
  token: agent.token ?? "",
  capabilities: (agent.capabilities ?? []).join(", "),
  config: agent.config ? JSON.stringify(agent.config, null, 2) : "",
})

const createEmptyDraft = (): AgentDraft => ({
  id: createAgentId(),
  label: "",
  baseUrl: "",
  token: "",
  capabilities: "",
  config: "",
})

const createScannerDraft = (): BrowserScannerDraft => ({
  label: "",
  baudrate: "115200",
  port: null,
  portInfo: null,
})

export function HardwarePage() {
  const [profile, setProfile] = useState<StationProfile>(() => loadStationProfile())
  const [statusByAgentId, setStatusByAgentId] = useState<Record<string, Record<string, unknown>>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AgentDraft>(() => createEmptyDraft())
  const browserSupported = nextIO.browserSerial.isSupported()
  const [scannerDialogOpen, setScannerDialogOpen] = useState(false)
  const [scannerDraft, setScannerDraft] = useState<BrowserScannerDraft>(() =>
    createScannerDraft(),
  )
  const [scannerSaving, setScannerSaving] = useState(false)
  const [browserBusyIds, setBrowserBusyIds] = useState<Record<string, boolean>>({})
  const [browserConnectedIds, setBrowserConnectedIds] = useState<string[]>(() =>
    nextIO.browserSerial.getConnectedDeviceIds(),
  )

  const hasAgents = profile.agents.length > 0
  const webSerialDevices = useMemo(
    () =>
      (profile.browserDevices ?? []).filter((device) => device.type === "web-serial"),
    [profile.browserDevices],
  )
  const browserConnectionSet = useMemo(
    () => new Set(browserConnectedIds),
    [browserConnectedIds],
  )

  const sortedAgents = useMemo(
    () => [...profile.agents].sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id)),
    [profile.agents],
  )

  useEffect(() => {
    setBrowserConnectedIds(nextIO.browserSerial.getConnectedDeviceIds())
  }, [profile])

  useEffect(() => {
    if (scannerDialogOpen) {
      setScannerDraft(createScannerDraft())
    }
  }, [scannerDialogOpen])

  const refreshBrowserConnections = () => {
    setBrowserConnectedIds(nextIO.browserSerial.getConnectedDeviceIds())
  }

  const setBrowserBusy = (deviceId: string, busy: boolean) => {
    setBrowserBusyIds((prev) => {
      const next = { ...prev }
      if (busy) {
        next[deviceId] = true
      } else {
        delete next[deviceId]
      }
      return next
    })
  }

  const openCreateDialog = () => {
    setEditingAgentId(null)
    setDraft(createEmptyDraft())
    setDialogOpen(true)
  }

  const openEditDialog = (agent: AgentProfile) => {
    setEditingAgentId(agent.id)
    setDraft(createDraftFromAgent(agent))
    setDialogOpen(true)
  }

  const handleSaveAgent = () => {
    if (!draft.baseUrl.trim()) {
      toast.error("Agent base URL is required.")
      return
    }

    let parsedConfig: Record<string, unknown> | undefined
    const configValue = draft.config.trim()
    if (configValue) {
      try {
        const parsed = JSON.parse(configValue) as unknown
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("Agent config must be a JSON object.")
          return
        }
        parsedConfig = parsed as Record<string, unknown>
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid JSON"
        toast.error(`Agent config must be valid JSON: ${message}`)
        return
      }
    }

    const nextAgent: AgentProfile = {
      id: draft.id,
      label: draft.label.trim() || undefined,
      baseUrl: draft.baseUrl.trim(),
      token: draft.token.trim() || undefined,
      capabilities: draft.capabilities
        .split(",")
        .map((cap) => cap.trim())
        .filter(Boolean),
      config: parsedConfig,
    }

    const nextAgents = editingAgentId
      ? profile.agents.map((agent) => (agent.id === editingAgentId ? nextAgent : agent))
      : [...profile.agents, nextAgent]

    const nextProfile = {
      ...profile,
      agents: nextAgents,
    }

    setProfile(nextProfile)
    nextIO.setProfile(nextProfile)
    setDialogOpen(false)
    toast.success("Agent settings saved.")
  }

  const handleRemoveAgent = (agentId: string) => {
    const nextProfile = {
      ...profile,
      agents: profile.agents.filter((agent) => agent.id !== agentId),
    }
    setProfile(nextProfile)
    nextIO.setProfile(nextProfile)
    toast.success("Agent removed.")
  }

  const handleProfileChange = (key: "stationId", value: string) => {
    const nextProfile = {
      ...profile,
      [key]: value.trim() ? value.trim() : null,
    }
    setProfile(nextProfile)
  }

  const handleSaveProfile = () => {
    nextIO.setProfile(profile)
    refreshBrowserConnections()
    toast.success("Hardware profile saved.")
  }

  const handleReloadProfile = () => {
    const stored = loadStationProfile()
    setProfile(stored)
    nextIO.setProfile(stored)
    refreshBrowserConnections()
    toast.success("Hardware profile reloaded.")
  }

  const handleRefreshStatus = async () => {
    if (!profile.agents.length) {
      toast.error("No agents configured to check.")
      return
    }

    try {
      const statuses = await nextIO.status()
      setStatusByAgentId(statuses)
      toast.success("Agent status updated.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to load agent status: ${message}`)
    }
  }

  const handleSelectScannerPort = async () => {
    if (!browserSupported) {
      toast.error("Web Serial is not supported in this browser.")
      return
    }
    try {
      const selection = await nextIO.browserSerial.requestPort()
      setScannerDraft((prev) => ({
        ...prev,
        port: selection.port,
        portInfo: selection.info ?? null,
      }))
      toast.success("Serial port selected.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to select serial port: ${message}`)
    }
  }

  const handleSaveScanner = async () => {
    if (!scannerDraft.port) {
      toast.error("Select a serial port before saving.")
      return
    }
    const baudrate = parseBaudrate(scannerDraft.baudrate)
    if (!baudrate) {
      toast.error("Baudrate must be a positive number.")
      return
    }

    const deviceId = createBrowserDeviceId()
    const params: BrowserSerialDeviceParams = {
      mode: "scanner",
      baudrate,
      portInfo: scannerDraft.portInfo ?? undefined,
    }
    const device: BrowserDeviceProfile = {
      id: deviceId,
      type: "web-serial",
      label: scannerDraft.label.trim() || undefined,
      params,
    }

    const nextProfile = {
      ...profile,
      browserDevices: [...(profile.browserDevices ?? []), device],
    }
    setProfile(nextProfile)
    nextIO.setProfile(nextProfile)

    setScannerSaving(true)
    try {
      await nextIO.browserSerial.connectDevice(device, scannerDraft.port)
      refreshBrowserConnections()
      setScannerDialogOpen(false)
      toast.success("Scanner connected.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to connect scanner: ${message}`)
    } finally {
      setScannerSaving(false)
    }
  }

  const handleConnectBrowserDevice = async (device: BrowserDeviceProfile) => {
    if (!browserSupported) {
      toast.error("Web Serial is not supported in this browser.")
      return
    }
    setBrowserBusy(device.id, true)
    try {
      await nextIO.browserSerial.connectDevice(device)
      refreshBrowserConnections()
      toast.success("Scanner connected.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to connect scanner: ${message}`)
    } finally {
      setBrowserBusy(device.id, false)
    }
  }

  const handleDisconnectBrowserDevice = async (deviceId: string) => {
    setBrowserBusy(deviceId, true)
    try {
      await nextIO.browserSerial.disconnectDevice(deviceId)
      refreshBrowserConnections()
      toast.success("Scanner disconnected.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to disconnect scanner: ${message}`)
    } finally {
      setBrowserBusy(deviceId, false)
    }
  }

  const handleRemoveBrowserDevice = async (deviceId: string) => {
    setBrowserBusy(deviceId, true)
    try {
      await nextIO.browserSerial.disconnectDevice(deviceId)
    } finally {
      setBrowserBusy(deviceId, false)
    }
    const nextProfile = {
      ...profile,
      browserDevices: (profile.browserDevices ?? []).filter((device) => device.id !== deviceId),
    }
    setProfile(nextProfile)
    nextIO.setProfile(nextProfile)
    refreshBrowserConnections()
    toast.success("Browser device removed.")
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Hardware</h1>
          <p className="text-sm text-muted-foreground">
            Configure local agents and station settings. Profiles are stored in localStorage for now.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReloadProfile}>
            Reload
          </Button>
          <Button size="sm" onClick={handleSaveProfile}>
            Save profile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Station</CardTitle>
          <CardDescription>Used to target station-specific events.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:max-w-md">
            <label className="text-sm font-medium text-foreground" htmlFor="station-id">
              Station ID
            </label>
            <Input
              id="station-id"
              placeholder="station-01"
              value={profile.stationId ?? ""}
              onChange={(event) => handleProfileChange("stationId", event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Agents</CardTitle>
            <CardDescription>Local or LAN services that expose HW capabilities.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefreshStatus}>
              Refresh status
            </Button>
            <Button size="sm" onClick={openCreateDialog}>
              Add agent
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {hasAgents ? (
            <Table className="w-full">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Agent
                  </TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Base URL
                  </TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Capabilities
                  </TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="h-9 px-4 text-right text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAgents.map((agent) => {
                  const status = statusByAgentId[agent.id]
                  const capabilities = agent.capabilities?.length
                    ? agent.capabilities.join(", ")
                    : "All"
                  return (
                    <TableRow key={agent.id} className="border-border/40">
                      <TableCell className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          {agent.label || agent.id}
                        </div>
                        <div className="text-xs text-muted-foreground">{agent.id}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {agent.baseUrl}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {capabilities}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {status ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                            Online
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            Unknown
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(agent)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAgent(agent.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              No agents configured yet. Add one to connect printers and scanners.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Browser scanners</CardTitle>
            <CardDescription>
              Connect a USB serial barcode scanner directly in Chrome/Chromium via Web Serial.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setScannerDialogOpen(true)}
              disabled={!browserSupported}
            >
              Add scanner
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!browserSupported ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              Web Serial is not supported in this browser. Use Chrome/Chromium over HTTPS or localhost.
            </div>
          ) : webSerialDevices.length ? (
            <Table className="w-full">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Device
                  </TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Port
                  </TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Baudrate
                  </TableHead>
                  <TableHead className="h-9 px-4 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="h-9 px-4 text-right text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webSerialDevices.map((device) => {
                  const params = device.params as BrowserSerialDeviceParams | undefined
                  const portInfo = params?.portInfo
                  const baudrate = params?.baudrate ?? 115200
                  const isConnected = browserConnectionSet.has(device.id)
                  const isBusy = Boolean(browserBusyIds[device.id])
                  return (
                    <TableRow key={device.id} className="border-border/40">
                      <TableCell className="px-4 py-3 text-sm">
                        <div className="font-medium text-foreground">
                          {device.label || "Barcode scanner"}
                        </div>
                        <div className="text-xs text-muted-foreground">{device.id}</div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {formatPortInfo(portInfo)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                        {baudrate}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        {isConnected ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                            Connected
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            Disconnected
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          {isConnected ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDisconnectBrowserDevice(device.id)}
                              disabled={isBusy}
                            >
                              Disconnect
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConnectBrowserDevice(device)}
                              disabled={isBusy}
                            >
                              Connect
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveBrowserDevice(device.id)}
                            disabled={isBusy}
                          >
                            Remove
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              No browser scanners configured yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAgentId ? "Edit agent" : "Add agent"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="agent-label">
                Label
              </label>
              <Input
                id="agent-label"
                placeholder="Warehouse agent"
                value={draft.label}
                onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="agent-url">
                Base URL
              </label>
              <Input
                id="agent-url"
                placeholder="http://localhost:9101"
                value={draft.baseUrl}
                onChange={(event) => setDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="agent-token">
                Token
              </label>
              <Input
                id="agent-token"
                placeholder="X-Agent-Token"
                value={draft.token}
                onChange={(event) => setDraft((prev) => ({ ...prev, token: event.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="agent-capabilities">
                Capabilities
              </label>
              <Input
                id="agent-capabilities"
                placeholder="serial, scanner, print"
                value={draft.capabilities}
                onChange={(event) => setDraft((prev) => ({ ...prev, capabilities: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Optional comma-separated list. Leave empty to allow all.
              </p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="agent-config">
                Agent config (JSON)
              </label>
              <textarea
                id="agent-config"
                rows={6}
                placeholder='{"print":{"defaultPrinter":"Zebra","options":{"media":"Custom.63.5x38.1mm"}}}'
                value={draft.config}
                onChange={(event) => setDraft((prev) => ({ ...prev, config: event.target.value }))}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                Stored locally and synced later. Use JSON for defaults like printer, port, or options.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAgent}>{editingAgentId ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scannerDialogOpen} onOpenChange={setScannerDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add browser scanner</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="scanner-label">
                Label
              </label>
              <Input
                id="scanner-label"
                placeholder="Honeywell 1400G2D"
                value={scannerDraft.label}
                onChange={(event) =>
                  setScannerDraft((prev) => ({ ...prev, label: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="scanner-baudrate">
                Baudrate
              </label>
              <Input
                id="scanner-baudrate"
                type="number"
                value={scannerDraft.baudrate}
                onChange={(event) =>
                  setScannerDraft((prev) => ({ ...prev, baudrate: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="scanner-port">
                Serial port
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleSelectScannerPort}>
                  Select port
                </Button>
                <span className="text-xs text-muted-foreground">
                  {scannerDraft.portInfo ? formatPortInfo(scannerDraft.portInfo) : "No port selected"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                The browser will ask for permission to access the scanner.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setScannerDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveScanner} disabled={scannerSaving}>
              {scannerSaving ? "Connecting..." : "Save & connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Agent logs and config live outside the web UI.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Review the agent README in <code className="text-foreground">nextintranet_agent/</code> for
          runtime configuration and environment variables.
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Looking for print settings? Go to the <Link className="text-primary" to="/print/queue">print queue</Link>.
      </div>
    </div>
  )
}
