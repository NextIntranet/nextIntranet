import { RealtimeClient } from "../realtime/client"
import { BrowserSerialManager, type BrowserSerialPort } from "./browserSerial"
import { loadStationProfile, saveStationProfile } from "./profile"
import type {
  AgentProfile,
  BrowserDeviceProfile,
  HwEvent,
  PrintJobRequest,
  SerialCloseRequest,
  SerialOpenRequest,
  SerialWriteRequest,
  StationProfile,
} from "./types"

type EventHandler = (event: HwEvent) => void

type AgentStatus = Record<string, unknown>

type AgentRequestInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> }

function stripAgentId<T extends { agentId: string }>(request: T): Omit<T, "agentId"> {
  const { agentId: _agentId, ...rest } = request
  return rest
}

function toWsBaseUrl(baseUrl: string): string {
  if (baseUrl.startsWith("ws")) {
    return baseUrl
  }
  if (baseUrl.startsWith("http")) {
    return baseUrl.replace(/^http/, "ws")
  }
  return baseUrl
}

async function agentFetch<T>(agent: AgentProfile, path: string, init?: AgentRequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (agent.token) {
    headers.set("X-Agent-Token", agent.token)
  }
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData
  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${agent.baseUrl}${path}`, {
    ...init,
    headers,
  })

  if (!response.ok) {
    let errorData: unknown
    try {
      errorData = await response.json()
    } catch {
      errorData = await response.text()
    }
    const message = `Agent error: ${response.status} ${response.statusText}`
    const error = new Error(message) as Error & { data?: unknown }
    error.data = errorData
    throw error
  }

  if (response.status === 204 || response.headers.get("Content-Length") === "0") {
    return undefined as T
  }

  return response.json() as Promise<T>
}

class AgentConnection {
  private realtime?: RealtimeClient
  private unsubscribe?: () => void

  constructor(
    private profile: AgentProfile,
    private stationId: string | null,
    private emit: EventHandler,
  ) {}

  connect(): void {
    if (typeof window === "undefined") return
    const wsBaseUrl = toWsBaseUrl(this.profile.baseUrl)
    this.realtime = new RealtimeClient(wsBaseUrl, () => this.profile.token ?? null)
    this.realtime.initialize()
    if (this.stationId) {
      this.realtime.setStation(this.stationId)
    }
    this.unsubscribe = this.realtime.onMessage((event) => {
      this.emit({ ...event, agentId: this.profile.id })
    })
  }

  updateStation(stationId: string | null): void {
    this.stationId = stationId
    this.realtime?.setStation(stationId)
  }

  disconnect(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = undefined
    }
    this.realtime?.destroy()
    this.realtime = undefined
  }

  request<T>(path: string, init?: AgentRequestInit): Promise<T> {
    return agentFetch<T>(this.profile, path, init)
  }

  getProfile(): AgentProfile {
    return this.profile
  }
}

export class NextIOClient {
  private profile: StationProfile
  private connections = new Map<string, AgentConnection>()
  private handlers = new Map<string, Set<EventHandler>>()
  private browserSerialManager = new BrowserSerialManager((event) => this.emit(event))

  constructor(initialProfile?: StationProfile) {
    this.profile = initialProfile ?? loadStationProfile()
    this.syncConnections()
    this.browserSerialManager.setStationId(this.profile.stationId ?? null)
  }

  getProfile(): StationProfile {
    return this.profile
  }

  setProfile(profile: StationProfile): void {
    this.profile = profile
    saveStationProfile(profile)
    this.syncConnections()
    this.browserSerialManager.setStationId(profile.stationId ?? null)
    const browserIds = new Set((profile.browserDevices ?? []).map((device) => device.id))
    this.browserSerialManager.syncDevices(browserIds)
  }

  setStationId(stationId: string | null): void {
    this.profile = {
      ...this.profile,
      stationId,
    }
    saveStationProfile(this.profile)
    for (const connection of this.connections.values()) {
      connection.updateStation(stationId)
    }
    this.browserSerialManager.setStationId(stationId)
  }

  on(eventType: string, handler: EventHandler): () => void {
    const existing = this.handlers.get(eventType) ?? new Set<EventHandler>()
    existing.add(handler)
    this.handlers.set(eventType, existing)
    return () => {
      existing.delete(handler)
    }
  }

  status(): Promise<Record<string, AgentStatus>> {
    const promises = this.profile.agents.map(async (agent) => {
      const connection = this.getConnection(agent.id)
      const status = await connection.request<AgentStatus>("/v1/status")
      return [agent.id, status] as const
    })
    return Promise.all(promises).then((entries) => Object.fromEntries(entries))
  }

  serial = {
    listPorts: (agentId: string) => this.getConnection(agentId).request("/v1/serial/ports"),
    open: (request: SerialOpenRequest) =>
      this.getConnection(request.agentId).request("/v1/serial/open", {
        method: "POST",
        body: JSON.stringify(stripAgentId(request)),
      }),
    write: (request: SerialWriteRequest) =>
      this.getConnection(request.agentId).request("/v1/serial/write", {
        method: "POST",
        body: JSON.stringify(stripAgentId(request)),
      }),
    close: (request: SerialCloseRequest) =>
      this.getConnection(request.agentId).request("/v1/serial/close", {
        method: "POST",
        body: JSON.stringify(stripAgentId(request)),
      }),
  }

  scanner = {
    listPorts: (agentId: string) => this.serial.listPorts(agentId),
    open: (request: SerialOpenRequest) =>
      this.serial.open({ ...request, mode: "scanner" }),
    close: (request: SerialCloseRequest) => this.serial.close(request),
  }

  print = {
    listPrinters: (agentId: string) => this.getConnection(agentId).request("/v1/print/printers"),
    submitJob: (request: PrintJobRequest) =>
      this.getConnection(request.agentId).request("/v1/print/job", {
        method: "POST",
        body: JSON.stringify(stripAgentId(request)),
      }),
  }

  browserSerial = {
    isSupported: () => this.browserSerialManager.isSupported(),
    getConnectedDeviceIds: () => this.browserSerialManager.getConnectedDeviceIds(),
    requestPort: () => this.browserSerialManager.requestPort(),
    connectDevice: (device: BrowserDeviceProfile, port?: BrowserSerialPort) =>
      this.browserSerialManager.connectDevice(device, port),
    disconnectDevice: (deviceId: string) => this.browserSerialManager.disconnectDevice(deviceId),
  }

  private syncConnections(): void {
    const next = new Map<string, AgentConnection>()
    const stationId = this.profile.stationId ?? null

    for (const agent of this.profile.agents) {
      const connection = new AgentConnection(agent, stationId, (event) => this.emit(event))
      connection.connect()
      next.set(agent.id, connection)
    }

    for (const connection of this.connections.values()) {
      connection.disconnect()
    }

    this.connections = next
  }

  private emit(event: HwEvent): void {
    const directHandlers = this.handlers.get(event.type) ?? new Set<EventHandler>()
    for (const handler of directHandlers) {
      handler(event)
    }

    const wildcardHandlers = this.handlers.get("*") ?? new Set<EventHandler>()
    for (const handler of wildcardHandlers) {
      handler(event)
    }
  }

  private getConnection(agentId: string): AgentConnection {
    const connection = this.connections.get(agentId)
    if (!connection) {
      throw new Error(`Unknown agentId: ${agentId}`)
    }
    return connection
  }
}

export const nextIO = new NextIOClient()
