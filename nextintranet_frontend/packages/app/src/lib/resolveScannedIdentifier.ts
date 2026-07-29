import type { NavigateFunction } from "react-router-dom"
import { toast } from "sonner"
import { apiFetch } from "@nextintranet/core"
import { getScannerCapture } from "@/lib/scannerCapture"

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

let lastGlobalIdentifierScan: { text: string; ts: number } | null = null
const DEDUPE_MS = 800

export type ResolveScannedIdentifierOutcome =
  | "empty"
  | "capture"
  | "skipped_page"
  | "deduped"
  | "navigated"
  | "no_match"
  | "api_error"
  /** API returned matches but no in-app link to follow (same as legacy silent success). */
  | "result_without_link"

export interface ScanSourceContext {
  stationId?: string | null
  agentId?: string | null
  deviceId?: string | null
}

/**
 * Shared path for barcode text: scanner capture, then identifier API + navigate
 * (same rules as the hardware scanner listener).
 */
export async function resolveScannedIdentifier(
  rawText: string,
  pathname: string,
  navigate: NavigateFunction,
  sourceContext?: ScanSourceContext,
): Promise<ResolveScannedIdentifierOutcome> {
  const text = rawText.trim()
  if (!text) {
    return "empty"
  }

  const capture = getScannerCapture()
  if (capture) {
    capture(text)
    return "capture"
  }

  if (
    pathname.startsWith("/store/inventory") ||
    pathname.startsWith("/production")
  ) {
    return "skipped_page"
  }

  const now = Date.now()
  const last = lastGlobalIdentifierScan
  if (last && last.text === text && now - last.ts < DEDUPE_MS) {
    return "deduped"
  }
  lastGlobalIdentifierScan = { text, ts: now }

  try {
    const response = await apiFetch<IdentifierResponse>("/api/v1/core/identifier/", {
      method: "POST",
      body: JSON.stringify({
        codeReader: "barcode",
        scanDateTime: new Date().toISOString(),
        data: text,
        q: null,
        parsedData: {},
        stationId: sourceContext?.stationId ?? null,
        agentId: sourceContext?.agentId ?? null,
        deviceId: sourceContext?.deviceId ?? null,
      }),
    })

    const resultLink = response?.result?.[0]?.link
    const actionLink = response?.action?.value
    const link = resultLink || actionLink

    if (link) {
      if (link.startsWith("http")) {
        const url = new URL(link)
        navigate(`${url.pathname}${url.search}${url.hash}`)
        return "navigated"
      }
      if (link.startsWith("/")) {
        navigate(link)
        return "navigated"
      }
    }

    if (!response?.result?.length) {
      toast.error(`Scanner: no match found for "${text}".`)
      return "no_match"
    }
    return "result_without_link"
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    toast.error(`Scanner lookup failed: ${message}`)
    return "api_error"
  }
}
