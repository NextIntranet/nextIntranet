import type { BrowserDeviceProfile, HwEvent } from "./types"

export type BrowserSerialPortInfo = {
  usbVendorId?: number
  usbProductId?: number
}

export type BrowserSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>
  close: () => Promise<void>
  readable?: ReadableStream<Uint8Array> | null
  getInfo: () => BrowserSerialPortInfo
}

type WebSerial = {
  requestPort: (options?: { filters?: BrowserSerialPortInfo[] }) => Promise<BrowserSerialPort>
  getPorts: () => Promise<BrowserSerialPort[]>
}

type BrowserSerialParams = {
  baudrate?: number
  mode?: "scanner" | "serial"
  portInfo?: BrowserSerialPortInfo
}

type BrowserSerialConnection = {
  port: BrowserSerialPort
  reader?: ReadableStreamDefaultReader<Uint8Array>
  active: boolean
}

const DEFAULT_BAUDRATE = 115200

const getWebSerial = (): WebSerial | null => {
  if (typeof navigator === "undefined") {
    return null
  }
  const serial = (navigator as { serial?: WebSerial }).serial
  return serial ?? null
}

const parseParams = (device: BrowserDeviceProfile): BrowserSerialParams => {
  if (!device.params || typeof device.params !== "object") {
    return {}
  }
  return device.params as BrowserSerialParams
}

const matchPortInfo = (
  portInfo: BrowserSerialPortInfo | undefined,
  target: BrowserSerialPortInfo | undefined,
): boolean => {
  if (!portInfo || !target) {
    return false
  }
  return (
    (target.usbVendorId === undefined || portInfo.usbVendorId === target.usbVendorId)
    && (target.usbProductId === undefined || portInfo.usbProductId === target.usbProductId)
  )
}

const toScannerPayload = (text: string, deviceId: string) => ({
  text,
  ts: Date.now(),
  source: {
    type: "web-serial",
    deviceId,
  },
})

export class BrowserSerialManager {
  private connections = new Map<string, BrowserSerialConnection>()
  private stationId: string | null = null

  constructor(private emit: (event: HwEvent) => void) {}

  isSupported(): boolean {
    return Boolean(getWebSerial())
  }

  setStationId(stationId: string | null): void {
    this.stationId = stationId
  }

  getConnectedDeviceIds(): string[] {
    return [...this.connections.keys()]
  }

  async requestPort(): Promise<{ port: BrowserSerialPort; info: BrowserSerialPortInfo }> {
    const serial = getWebSerial()
    if (!serial) {
      throw new Error("Web Serial is not supported in this browser.")
    }
    const port = await serial.requestPort()
    const info = port.getInfo ? port.getInfo() : {}
    return { port, info }
  }

  async connectDevice(device: BrowserDeviceProfile, port?: BrowserSerialPort): Promise<void> {
    if (device.type !== "web-serial") {
      throw new Error("Unsupported browser device type.")
    }
    if (this.connections.has(device.id)) {
      return
    }
    const serial = getWebSerial()
    if (!serial) {
      throw new Error("Web Serial is not supported in this browser.")
    }

    const params = parseParams(device)
    let targetPort = port
    if (!targetPort) {
      const ports = await serial.getPorts()
      if (!ports.length) {
        throw new Error("No authorized serial ports found. Re-authorize the device.")
      }
      const match = ports.find((candidate) => matchPortInfo(candidate.getInfo(), params.portInfo))
      targetPort = match ?? (ports.length === 1 ? ports[0] : undefined)
    }
    if (!targetPort) {
      throw new Error("Serial port not found. Re-authorize the device.")
    }

    const baudrate = Number.isFinite(params.baudrate) ? Number(params.baudrate) : DEFAULT_BAUDRATE
    await targetPort.open({ baudRate: baudrate })

    const connection: BrowserSerialConnection = {
      port: targetPort,
      active: true,
    }
    this.connections.set(device.id, connection)
    void this.startReadLoop(device.id, connection)
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    const connection = this.connections.get(deviceId)
    if (!connection) {
      return
    }
    connection.active = false
    try {
      if (connection.reader) {
        await connection.reader.cancel()
        connection.reader.releaseLock()
      }
    } catch {
      // Ignore reader cleanup errors.
    }
    try {
      await connection.port.close()
    } catch {
      // Ignore port close errors.
    }
    this.connections.delete(deviceId)
  }

  syncDevices(allowedIds: Set<string>): void {
    for (const deviceId of this.connections.keys()) {
      if (!allowedIds.has(deviceId)) {
        void this.disconnectDevice(deviceId)
      }
    }
  }

  private async startReadLoop(
    deviceId: string,
    connection: BrowserSerialConnection,
  ): Promise<void> {
    const readable = connection.port.readable
    if (!readable) {
      await this.disconnectDevice(deviceId)
      return
    }

    const reader = readable.getReader()
    connection.reader = reader

    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (connection.active) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        if (!value) {
          continue
        }

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/[\r\n]+/u)
        buffer = parts.pop() ?? ""

        for (const line of parts) {
          const text = line.trim()
          if (!text) {
            continue
          }
          this.emit({
            type: "scanner.data",
            payload: toScannerPayload(text, deviceId),
            stationId: this.stationId ?? null,
            deviceId,
            agentId: `browser:${deviceId}`,
          })
        }
      }
    } catch {
      await this.disconnectDevice(deviceId)
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // Ignore release errors.
      }
    }
  }
}
