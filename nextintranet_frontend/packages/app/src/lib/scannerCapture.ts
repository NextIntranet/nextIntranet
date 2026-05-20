/**
 * When a "scanner capture" handler is registered, the next scanner.data event
 * is delivered to it instead of the default global behavior (search/navigate).
 * Used e.g. by the "Add external identifier" sheet to lock input to the code field.
 */
let captureHandler: ((text: string) => void) | null = null

export function getScannerCapture(): ((text: string) => void) | null {
  return captureHandler
}

export function setScannerCapture(handler: ((text: string) => void) | null): void {
  captureHandler = handler
}
