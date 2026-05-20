import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser"
import { Camera, Loader2, Zap } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  resolveScannedIdentifier,
  type ResolveScannedIdentifierOutcome,
} from "@/lib/resolveScannedIdentifier"
import {
  setQuickActionsFabVisible,
  useQuickActionsFabVisible,
} from "@/lib/quickActionsFabVisibility"

function releaseCamera(video: HTMLVideoElement | null): void {
  BrowserCodeReader.releaseAllStreams()
  if (video) {
    BrowserCodeReader.cleanVideoSource(video)
  }
}

function shouldCloseScannerAfterResolve(outcome: ResolveScannedIdentifierOutcome): boolean {
  return (
    outcome === "capture" ||
    outcome === "navigated" ||
    outcome === "result_without_link" ||
    outcome === "deduped"
  )
}

function shouldRetryScanAfterResolve(outcome: ResolveScannedIdentifierOutcome): boolean {
  return outcome === "no_match" || outcome === "api_error" || outcome === "skipped_page"
}

const RETRY_SCAN_DELAY_MS = 500

export function QuickActionsFab() {
  const visible = useQuickActionsFabVisible()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [scanSession, setScanSession] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraOpenRef = useRef(cameraOpen)
  cameraOpenRef.current = cameraOpen

  useEffect(() => {
    if (!cameraOpen) {
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
          setCameraOpen(false)
        }
        return
      }

      const reader = new BrowserMultiFormatReader()
      try {
        const result = await reader.decodeOnceFromVideoDevice(undefined, video)
        if (cancelled || !cameraOpenRef.current) {
          return
        }
        const text = result.getText()
        releaseCamera(video)

        setIsResolving(true)
        const outcome = await resolveScannedIdentifier(text, pathname, navigate)

        setIsResolving(false)

        if (cancelled || !cameraOpenRef.current) {
          return
        }

        if (shouldCloseScannerAfterResolve(outcome)) {
          setCameraOpen(false)
          return
        }

        if (outcome === "skipped_page") {
          toast.info("Barcode lookup from the camera is not available on this page.")
        }

        if (outcome === "empty") {
          setCameraOpen(false)
          return
        }

        if (shouldRetryScanAfterResolve(outcome)) {
          await new Promise((r) => setTimeout(r, RETRY_SCAN_DELAY_MS))
          if (cancelled || !cameraOpenRef.current) {
            return
          }
          setScanSession((s) => s + 1)
        }
      } catch (error) {
        if (cancelled || !cameraOpenRef.current) {
          return
        }
        setIsResolving(false)
        const name = error instanceof Error ? error.name : ""
        const message = error instanceof Error ? error.message : "Unknown error"
        if (name === "NotAllowedError" || message.includes("Permission")) {
          toast.error("Camera access was denied. Allow camera use in the browser to scan.")
          setCameraOpen(false)
        } else if (name === "NotFoundError" || message.includes("device")) {
          toast.error("No camera was found on this device.")
          setCameraOpen(false)
        } else {
          toast.error(`Could not scan: ${message}`)
          releaseCamera(video)
          await new Promise((r) => setTimeout(r, RETRY_SCAN_DELAY_MS))
          if (!cancelled && cameraOpenRef.current) {
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
  }, [cameraOpen, pathname, navigate, scanSession])

  const handleOpenCamera = () => {
    setScanSession(0)
    setIsResolving(false)
    setCameraOpen(true)
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) {
      setCameraOpen(false)
      setIsResolving(false)
      setScanSession(0)
      releaseCamera(videoRef.current)
    }
  }

  if (!visible) {
    return null
  }

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        <div className="pointer-events-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="h-14 w-14 rounded-full shadow-lg"
                aria-label="Quick actions"
              >
                <Zap className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56">
              <DropdownMenuItem onSelect={handleOpenCamera}>
                <Camera className="mr-2 h-4 w-4" />
                Scan with camera
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setQuickActionsFabVisible(false)
                }}
              >
                Hide quick actions button
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Dialog open={cameraOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="z-[110] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan barcode</DialogTitle>
            <DialogDescription>
              Point the barcode at the camera. This window stays open until the code is read and
              looked up successfully.
            </DialogDescription>
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
                <p className="text-sm text-muted-foreground">Looking up code…</p>
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
    </>
  )
}
