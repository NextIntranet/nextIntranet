import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { apiFetch, nextIO } from "@nextintranet/core"

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

export function HardwareScannerListener() {
  const navigate = useNavigate()
  const location = useLocation()
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null)

  useEffect(() => {
    const unsubscribe = nextIO.on("scanner.data", async (event) => {
      const payload = event.payload as { text?: string } | undefined
      const text = payload?.text?.trim()
      if (!text) {
        return
      }

      if (location.pathname.startsWith("/store/inventory")) {
        return
      }

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.text === text && now - last.ts < 800) {
        return
      }
      lastScanRef.current = { text, ts: now }

      try {
        const response = await apiFetch<IdentifierResponse>("/api/v1/core/identifier/", {
          method: "POST",
          body: JSON.stringify({
            codeReader: "barcode",
            scanDateTime: new Date().toISOString(),
            data: text,
            q: null,
            parsedData: {},
          }),
        })

        const resultLink = response?.result?.[0]?.link
        const actionLink = response?.action?.value
        const link = resultLink || actionLink

        if (link) {
          if (link.startsWith("http")) {
            const url = new URL(link)
            navigate(`${url.pathname}${url.search}${url.hash}`)
            return
          }
          if (link.startsWith("/")) {
            navigate(link)
            return
          }
        }

        if (!response?.result?.length) {
          toast.error(`Scanner: no match found for "${text}".`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        toast.error(`Scanner lookup failed: ${message}`)
      }
    })

    return unsubscribe
  }, [location.pathname, navigate])

  return null
}
