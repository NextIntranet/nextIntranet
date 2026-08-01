import type { ScanSourceContext } from "@/lib/resolveScannedIdentifier"

/**
 * When a "scanner capture" handler is registered, the next scanner.data event
 * is delivered to it instead of the default global behavior (search/navigate).
 * Used e.g. by the "Add external identifier" sheet to lock input to the code field.
 *
 * The handler also receives the station/agent/device context of the scan when the
 * event carried one, so a capturing page can still audit the scan the same way the
 * global path does. Handlers that only care about the text may ignore it.
 */
export type ScannerCaptureHandler = (
  text: string,
  source?: ScanSourceContext,
) => void

let captureHandler: ScannerCaptureHandler | null = null

export function getScannerCapture(): ScannerCaptureHandler | null {
  return captureHandler
}

export function setScannerCapture(handler: ScannerCaptureHandler | null): void {
  captureHandler = handler
}
