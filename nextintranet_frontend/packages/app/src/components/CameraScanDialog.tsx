import { useEffect, useRef, useState } from "react"
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/** What the camera should do after a decoded code has been handled. */
export type CameraScanOutcome = "continue" | "close"

function releaseCamera(video: HTMLVideoElement | null): void {
  BrowserCodeReader.releaseAllStreams()
  if (video) {
    BrowserCodeReader.cleanVideoSource(video)
  }
}

const RETRY_SCAN_DELAY_MS = 500

interface CameraScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Called with every decoded barcode. Return "continue" to keep the camera
   * running for the next code, or "close" to shut the dialog. Callers that scan
   * many labels in a row (put-away check) always return "continue"; callers that
   * act on a single code (quick actions) return "close" once they handled it.
   */
  onScan: (text: string) => CameraScanOutcome | Promise<CameraScanOutcome>
  title?: string
  description?: string
  /** Shown over the preview while onScan is running. */
  busyLabel?: string
}

/**
 * The app's single camera barcode reader. Decoding is one-shot per zxing call, so
 * the loop is re-armed by bumping `scanSession` whenever the caller wants to keep
 * going or a recoverable error occurred.
 */
export function CameraScanDialog({
  open,
  onOpenChange,
  onScan,
  title = "Scan barcode",
  description = "Point the barcode at the camera.",
  busyLabel = "Looking up code…",
}: CameraScanDialogProps) {
  const [isResolving, setIsResolving] = useState(false)
  const [scanSession, setScanSession] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const openRef = useRef(open)
  openRef.current = open
  // Held in a ref so a caller passing an inline arrow does not restart the camera
  // on every render.
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!open) {
      setIsResolving(false)
      setScanSession(0)
      return
    }

    let cancelled = false

    const run = async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      let video = videoRef.current
      if (!video && !cancelled) {
        await new Promise((r) => setTimeout(r, 100))
        video = videoRef.current
      }
      if (!video || cancelled) {
        if (!cancelled) {
          toast.error("Camera preview failed to start.")
          onOpenChange(false)
        }
        return
      }

      const reader = new BrowserMultiFormatReader()
      try {
        const result = await reader.decodeOnceFromVideoDevice(undefined, video)
        if (cancelled || !openRef.current) {
          return
        }
        const text = result.getText()
        releaseCamera(video)

        setIsResolving(true)
        const outcome = text.trim() ? await onScanRef.current(text) : "continue"
        setIsResolving(false)

        if (cancelled || !openRef.current) {
          return
        }

        if (outcome === "close") {
          onOpenChange(false)
          return
        }

        await new Promise((r) => setTimeout(r, RETRY_SCAN_DELAY_MS))
        if (cancelled || !openRef.current) {
          return
        }
        setScanSession((s) => s + 1)
      } catch (error) {
        if (cancelled || !openRef.current) {
          return
        }
        setIsResolving(false)
        const name = error instanceof Error ? error.name : ""
        const message = error instanceof Error ? error.message : "Unknown error"
        if (name === "NotAllowedError" || message.includes("Permission")) {
          toast.error("Camera access was denied. Allow camera use in the browser to scan.")
          onOpenChange(false)
        } else if (name === "NotFoundError" || message.includes("device")) {
          toast.error("No camera was found on this device.")
          onOpenChange(false)
        } else {
          toast.error(`Could not scan: ${message}`)
          releaseCamera(video)
          await new Promise((r) => setTimeout(r, RETRY_SCAN_DELAY_MS))
          if (!cancelled && openRef.current) {
            setScanSession((s) => s + 1)
          }
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      releaseCamera(videoRef.current)
    }
  }, [open, scanSession, onOpenChange])

  const handleDialogOpenChange = (next: boolean) => {
    if (!next) {
      releaseCamera(videoRef.current)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="z-[110] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <video
            ref={videoRef}
            className="aspect-video w-full rounded-md bg-black object-cover"
            muted
            playsInline
            autoPlay
          />
          {isResolving ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-background/85">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">{busyLabel}</p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isResolving}
            onClick={() => handleDialogOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
