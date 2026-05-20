import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { nextIO } from "@nextintranet/core"
import { resolveScannedIdentifier } from "@/lib/resolveScannedIdentifier"

export function HardwareScannerListener() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const unsubscribe = nextIO.on("scanner.data", async (event) => {
      const payload = event.payload as { text?: string } | undefined
      const text = payload?.text?.trim()
      if (!text) {
        return
      }

      await resolveScannedIdentifier(text, location.pathname, navigate)
    })

    return unsubscribe
  }, [location.pathname, navigate])

  return null
}
