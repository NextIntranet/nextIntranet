import { useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// Target routes for short QR links printed on labels (<base>/q/<kind>/<uuid>).
const KIND_ROUTES: Record<string, (id: string) => string> = {
  p: (id) => `/store/packet/${id}`,
  l: (id) => `/store/location/${id}`,
  c: (id) => `/store/component/${id}`,
}

export function QrRedirectPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    const route = kind ? KIND_ROUTES[kind] : undefined
    if (!route || !id || !UUID_RE.test(id)) {
      toast.error("Unrecognized QR code link.")
      navigate("/", { replace: true })
      return
    }
    navigate(route(id), { replace: true })
  }, [kind, id, navigate])

  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      Opening...
    </div>
  )
}
