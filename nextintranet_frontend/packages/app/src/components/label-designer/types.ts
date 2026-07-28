import type { LabelTargetType } from "@/lib/printing"

export type LabelElementType = "text" | "barcode" | "logo" | "line" | "rect"

export interface LabelCanvas {
  width_mm: number
  height_mm: number
}

// Mirrors the element schema rendered by the backend
// (nextintranet_backend/labels/template.py). Unknown keys are preserved.
export interface LabelElement {
  id?: string
  type: LabelElementType
  x: number
  y: number
  w: number
  h: number
  content?: string
  font_size?: number
  bold?: boolean
  align?: "L" | "C" | "R"
  multiline?: boolean
  fit?: boolean
  max_chars?: number
  line_height?: number
  color?: number[]
  barcode_type?: string
  line_width?: number
  fill?: boolean
  [key: string]: unknown
}

export interface LabelDefinition {
  version?: number
  canvas: LabelCanvas
  elements: LabelElement[]
  [key: string]: unknown
}

export const ELEMENT_TYPE_LABELS: Record<LabelElementType, string> = {
  text: "Text",
  barcode: "Barcode",
  logo: "Logo",
  line: "Line",
  rect: "Rectangle",
}

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

/**
 * Coerce a parsed JSON definition into a shape the designer can work with
 * without losing unknown keys.
 */
export const normalizeDefinition = (value: Record<string, unknown>): LabelDefinition => {
  const canvas = (value.canvas ?? {}) as Record<string, unknown>
  const elements = Array.isArray(value.elements) ? value.elements : []
  return {
    ...value,
    canvas: {
      width_mm: asNumber(canvas.width_mm, 66.04),
      height_mm: asNumber(canvas.height_mm, 38.1),
    },
    elements: elements
      .filter((element): element is Record<string, unknown> =>
        Boolean(element) && typeof element === "object",
      )
      .map((element) => ({
        ...element,
        type: (element.type ?? "text") as LabelElementType,
        x: asNumber(element.x, 0),
        y: asNumber(element.y, 0),
        w: asNumber(element.w, 0),
        h: asNumber(element.h, 0),
      })) as LabelElement[],
  }
}

export interface PlaceholderOption {
  value: string
  label: string
}

// Available on every label type; resolved at print time on the server.
const NOW_PLACEHOLDERS: PlaceholderOption[] = [
  { value: "{now.date}", label: "Print date" },
  { value: "{now.time}", label: "Print time" },
  { value: "{now.datetime}", label: "Print date & time" },
]

// Mirrors sample_label_context() in nextintranet_backend/labels/template.py.
export const PLACEHOLDERS: Record<LabelTargetType, PlaceholderOption[]> = {
  packet: [
    { value: "{component.name}", label: "Component name" },
    { value: "{component.description}", label: "Component description" },
    { value: "{component.id}", label: "Component ID" },
    { value: "{packet.uuid}", label: "Packet UUID" },
    { value: "{packet.uuid_short}", label: "Packet UUID (short)" },
    { value: "{packet.serial_code}", label: "Packet S-code" },
    { value: "{packet.serial_number}", label: "Packet serial number" },
    { value: "{packet.location}", label: "Packet location" },
    { value: "{packet.count}", label: "Stock count (at print time)" },
    { value: "{packet.barcode_url}", label: "Packet barcode URL" },
    { value: "{packet.barcode_short}", label: "Packet QR URL (short)" },
    ...NOW_PLACEHOLDERS,
  ],
  location: [
    { value: "{location.building}", label: "Building" },
    { value: "{location.room}", label: "Room" },
    { value: "{location.full_path}", label: "Full path" },
    { value: "{location.name}", label: "Location name" },
    { value: "{location.description}", label: "Location description" },
    { value: "{location.uuid}", label: "Location ID" },
    { value: "{location.url}", label: "Location URL" },
    { value: "{location.barcode_short}", label: "Location QR URL (short)" },
    ...NOW_PLACEHOLDERS,
  ],
  component: [
    { value: "{component.type}", label: "Component type" },
    { value: "{component.serial}", label: "Serial number" },
    { value: "{component.id}", label: "Component ID" },
    { value: "{component.barcode_url}", label: "Component barcode URL" },
    { value: "{component.barcode_short}", label: "Component QR URL (short)" },
    ...NOW_PLACEHOLDERS,
  ],
}

const SAMPLE_UUID = "0f47c1de-1234-4abc-9def-0123456789ab"

const SAMPLE_CONTEXTS: Record<LabelTargetType, Record<string, Record<string, string>>> = {
  packet: {
    packet: {
      uuid: SAMPLE_UUID,
      uuid_short: SAMPLE_UUID.slice(0, 8),
      serial_code: "S003",
      serial_number: "3",
      location: "Building A/Room 12/Shelf 3",
      count: "100",
      barcode_url: `https://ni.ust.cz/?packet=${SAMPLE_UUID}&component=42`,
      barcode_short: `https://ni.ust.cz/q/p/${SAMPLE_UUID}`,
    },
    component: {
      name: "Resistor 10k 0805 1%",
      description: "Thick film chip resistor, 0805, 10 kOhm, 1%, 125 mW",
      id: "42",
    },
  },
  location: {
    location: {
      building: "Building A",
      room: "Room 12",
      full_path: "Building A/Room 12",
      name: "Room 12",
      description: "Shelving for SMD reels, row 3",
      uuid: SAMPLE_UUID,
      url: `https://ni.ust.cz/store/location/${SAMPLE_UUID}`,
      barcode_short: `https://ni.ust.cz/q/l/${SAMPLE_UUID}`,
    },
  },
  component: {
    component: {
      type: "Resistor 10k 0805",
      serial: SAMPLE_UUID.slice(0, 8),
      id: SAMPLE_UUID,
      barcode_url: `https://ni.ust.cz/?component=${SAMPLE_UUID}`,
      barcode_short: `https://ni.ust.cz/q/c/${SAMPLE_UUID}`,
    },
  },
}

const pad2 = (value: number) => String(value).padStart(2, "0")

const nowContext = (): Record<string, string> => {
  const now = new Date()
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  return { date, time, datetime: `${date} ${time}` }
}

/**
 * Replace {a.b} placeholders with sample values so canvas text roughly
 * matches what the server-side PDF preview renders.
 */
export const resolvePlaceholders = (text: string, labelType: LabelTargetType) =>
  (text || "").replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, path: string) => {
    let value: unknown = { ...SAMPLE_CONTEXTS[labelType], now: nowContext() }
    for (const part of path.split(".")) {
      if (value && typeof value === "object" && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part]
      } else {
        return ""
      }
    }
    return String(value)
  })

const DEFAULT_BARCODE_CONTENT: Record<LabelTargetType, string> = {
  packet: "{packet.barcode_short}",
  location: "{location.barcode_short}",
  component: "{component.barcode_short}",
}

export const createElement = (
  type: LabelElementType,
  canvas: LabelCanvas,
  labelType: LabelTargetType,
): LabelElement => {
  const base = { id: crypto.randomUUID(), type, x: 2, y: 2 }
  switch (type) {
    case "text":
      return {
        ...base,
        w: Math.max(canvas.width_mm - 4, 10),
        h: 6,
        content: "Text",
        font_size: 10,
      }
    case "barcode": {
      const size = Math.min(15, canvas.height_mm - 4)
      return {
        ...base,
        w: size,
        h: size,
        content: DEFAULT_BARCODE_CONTENT[labelType],
        barcode_type: "datamatrix",
      }
    }
    case "logo":
      return { ...base, w: 16, h: 8 }
    case "line":
      return { ...base, y: 10, w: Math.max(canvas.width_mm - 4, 10), h: 0, line_width: 0.3 }
    case "rect":
      return { ...base, w: 20, h: 10, line_width: 0.3 }
  }
}

export const rgbToCss = (color: number[] | undefined, fallback = "rgb(0,0,0)") => {
  if (!Array.isArray(color) || color.length !== 3) {
    return fallback
  }
  return `rgb(${color.map((c) => Math.round(Number(c) || 0)).join(",")})`
}

export const rgbToHex = (color: number[] | undefined) => {
  if (!Array.isArray(color) || color.length !== 3) {
    return "#000000"
  }
  return `#${color
    .map((c) => Math.max(0, Math.min(255, Math.round(Number(c) || 0))).toString(16).padStart(2, "0"))
    .join("")}`
}

export const hexToRgb = (hex: string): number[] => {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) {
    return [0, 0, 0]
  }
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export const roundMm = (value: number) => Math.round(value * 100) / 100
