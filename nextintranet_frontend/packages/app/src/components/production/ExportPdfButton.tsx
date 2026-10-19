import { useState } from "react"
import { FileDown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { downloadAuthed } from "@/lib/download"

export type BomExportKind = "overview" | "bom" | "sourcing" | "production" | "finalize"

interface ExportPdfButtonProps {
  bomId: string
  kind: BomExportKind
  label?: string
  variant?: "outline" | "ghost" | "secondary" | "default"
}

/** Downloads one of the BOM series PDF reports (`templates/<id>/export/<kind>/`). */
export function ExportPdfButton({ bomId, kind, label = "Export PDF", variant = "outline" }: ExportPdfButtonProps) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      await downloadAuthed(`/api/v1/production/templates/${bomId}/export/${kind}/`, `${kind}.pdf`)
    } catch {
      toast.error("Failed to generate the PDF.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button type="button" variant={variant} size="sm" onClick={() => void run()} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileDown className="mr-1.5 h-4 w-4" />}
      {label}
    </Button>
  )
}
