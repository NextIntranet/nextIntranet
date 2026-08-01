import { useCallback, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Camera, Zap } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CameraScanDialog,
  type CameraScanOutcome,
} from "@/components/CameraScanDialog"
import {
  resolveScannedIdentifier,
  type ResolveScannedIdentifierOutcome,
} from "@/lib/resolveScannedIdentifier"
import {
  setQuickActionsFabVisible,
  useQuickActionsFabVisible,
} from "@/lib/quickActionsFabVisibility"

function shouldCloseScannerAfterResolve(outcome: ResolveScannedIdentifierOutcome): boolean {
  return (
    outcome === "capture" ||
    outcome === "navigated" ||
    outcome === "result_without_link" ||
    outcome === "deduped" ||
    outcome === "empty"
  )
}

export function QuickActionsFab() {
  const visible = useQuickActionsFabVisible()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [cameraOpen, setCameraOpen] = useState(false)

  const handleScan = useCallback(
    async (text: string): Promise<CameraScanOutcome> => {
      const outcome = await resolveScannedIdentifier(text, pathname, navigate)

      if (outcome === "skipped_page") {
        toast.info("Barcode lookup from the camera is not available on this page.")
      }

      // Anything else (no_match, api_error, skipped_page) leaves the camera running
      // so the next attempt does not need the menu again.
      return shouldCloseScannerAfterResolve(outcome) ? "close" : "continue"
    },
    [pathname, navigate],
  )

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
              <DropdownMenuItem onSelect={() => setCameraOpen(true)}>
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

      <CameraScanDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onScan={handleScan}
        description="Point the barcode at the camera. This window stays open until the code is read and looked up successfully."
      />
    </>
  )
}
