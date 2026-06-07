import { apiFetch } from "@nextintranet/core"

interface IdentifierResponse {
  action?: {
    type?: string | null
    value?: string | null
  }
  result?: Array<{
    type?: string
    id?: string
    name?: string
    link?: string
  }>
}

const packetIdRegex =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/

/** Fast local parsing for query strings, packet URLs, and bare UUIDs. */
export function extractPacketIdFromText(raw: string): string | null {
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

function packetIdFromIdentifierResponse(response: IdentifierResponse): string | null {
  const packetResult = response.result?.find((item) => item.type === "packet")
  if (packetResult?.id) {
    return packetResult.id
  }

  const link = response.result?.[0]?.link || response.action?.value
  if (link) {
    const path = link.startsWith("http") ? new URL(link).pathname : link
    const match = path.match(/\/store\/packet\/([^/?#]+)/)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

/** Resolve a scanned barcode/QR to a packet UUID via local parsing or identifier API. */
export async function resolvePacketIdFromScan(raw: string): Promise<string | null> {
  const local = extractPacketIdFromText(raw)
  if (local) {
    return local
  }

  const response = await apiFetch<IdentifierResponse>("/api/v1/core/identifier/", {
    method: "POST",
    body: JSON.stringify({
      codeReader: "barcode",
      scanDateTime: new Date().toISOString(),
      data: raw.trim(),
      q: null,
      parsedData: {},
    }),
  })

  return packetIdFromIdentifierResponse(response)
}
