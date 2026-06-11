export type HwEventType = "scanner.data" | "serial.data" | "print.job" | "weight.value"

export interface HwEvent<TPayload = unknown> {
  id?: string
  type: HwEventType | string
  stationId?: string | null
  deviceId?: string | null
  ts?: number
  payload?: TPayload
  agentId: string
}

export type AgentConfig = {
  print?: {
    defaultPrinter?: string
    options?: Record<string, string>
    format?: "pdf" | "raw"
  }
  serial?: {
    defaultPort?: string
    baudrate?: number
  }
  scanner?: {
    defaultPort?: string
    baudrate?: number
  }
  [key: string]: unknown
}

export interface AgentProfile {
  id: string
  label?: string
  baseUrl: string
  token?: string
  capabilities?: string[]
  config?: AgentConfig
}

export type BrowserDeviceType = "web-serial" | "keyboard-wedge" | string

export interface BrowserSerialDeviceParams {
  [key: string]: unknown
  mode?: "scanner" | "serial"
  baudrate?: number
  portInfo?: {
    usbVendorId?: number
    usbProductId?: number
  }
}

export interface BrowserDeviceProfile {
  id: string
  type: BrowserDeviceType
  label?: string
  params?: Record<string, unknown>
}

export interface StationProfile {
  version: 1
  stationId?: string | null
  agentsEnabled?: boolean
  agents: AgentProfile[]
  browserDevices?: BrowserDeviceProfile[]
}

export interface SerialOpenRequest {
  agentId: string
  path: string
  baudrate?: number
  mode?: "scanner" | "serial"
}

export interface SerialWriteRequest {
  agentId: string
  deviceId: string
  text?: string
  dataBase64?: string
  encoding?: string
  appendNewline?: boolean
}

export interface SerialCloseRequest {
  agentId: string
  deviceId: string
}

export interface PrintJobRequest {
  agentId: string
  printer: string
  dataBase64?: string
  fileUrl?: string
  headers?: Record<string, string>
  title?: string
  format?: "pdf" | "raw"
  options?: Record<string, string>
}
