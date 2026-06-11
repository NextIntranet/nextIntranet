import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Download, Printer } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  LABEL_FORMATS,
  fetchFileBlob,
  fetchLabelTemplates,
  pollRenderJob,
  templatesForFormat,
} from "@/lib/printing"
import type { LabelTargetType, PrintRenderJob } from "@/lib/printing"

const selectClassName = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "disabled:cursor-not-allowed disabled:opacity-50",
)

type PdfPrintDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ad-hoc label target (renders a temporary print item). */
  targetType?: LabelTargetType
  targetId?: string | null
  /** Render all label items of an existing print queue. */
  queueId?: string | null
  /** Preview an existing document (no label rendering). */
  documentUrl?: string | null
  label?: string
}

export function PdfPrintDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  queueId,
  documentUrl,
  label,
}: PdfPrintDialogProps) {
  const isDocument = Boolean(documentUrl)
  const [format, setFormat] = useState("a4_3x7")
  const [templateId, setTemplateId] = useState("")
  const [copies, setCopies] = useState(1)
  const [skipLabels, setSkipLabels] = useState(0)
  const [showBorders, setShowBorders] = useState(true)
  const [showLogo, setShowLogo] = useState(true)
  const [colorMode, setColorMode] = useState<"color" | "bw">("color")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const generationRef = useRef(0)

  const { data: templates = [] } = useQuery({
    queryKey: ["label-templates"],
    queryFn: fetchLabelTemplates,
    enabled: open && !isDocument,
  })

  const { data: queues = [] } = useQuery<Array<{ id: string; is_default?: boolean }>>({
    queryKey: ["print-queues"],
    queryFn: () => apiFetch("/api/v1/print/list/"),
    enabled: open && !isDocument && Boolean(targetId),
  })

  const defaultQueueId =
    queues.find((queue) => queue.is_default)?.id ?? queues[0]?.id ?? ""

  const availableTemplates = useMemo(
    () => templatesForFormat(templates, format, targetType),
    [templates, format, targetType],
  )

  // Keep the selected template valid for the chosen format; prefer defaults.
  useEffect(() => {
    if (!availableTemplates.length) {
      setTemplateId("")
      return
    }
    if (templateId && availableTemplates.some((template) => template.id === templateId)) {
      return
    }
    const preferred =
      availableTemplates.find((template) => template.is_default) ?? availableTemplates[0]
    setTemplateId(preferred.id)
  }, [availableTemplates, templateId])

  const setPdfBlob = useCallback((blob: Blob | null) => {
    setPdfUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return blob ? URL.createObjectURL(blob) : null
    })
  }, [])

  const generate = useCallback(async () => {
    const generation = ++generationRef.current
    setGenerating(true)
    setError(null)
    try {
      let blob: Blob
      if (isDocument && documentUrl) {
        blob = await fetchFileBlob(documentUrl)
      } else {
        const payload: Record<string, unknown> = {
          format,
          show_borders: showBorders,
          show_logo: showLogo,
          color_mode: colorMode,
          skip_labels: skipLabels,
        }
        if (templateId) {
          payload.template_id = templateId
        }

        let itemIds: string[] = []
        let tempItemIds: string[] = []
        if (targetId && targetType) {
          if (!defaultQueueId) {
            throw new Error("A default print queue is required for PDF printing.")
          }
          const copiesCount = Math.max(1, copies)
          for (let index = 0; index < copiesCount; index += 1) {
            const item = await apiFetch<{ id: string }>("/api/v1/print/item/add/", {
              method: "POST",
              body: JSON.stringify({
                target_type: targetType,
                target_id: targetId,
                kind: "label",
                print_list: defaultQueueId,
              }),
            })
            itemIds.push(item.id)
          }
          tempItemIds = itemIds
        }

        try {
          const body: Record<string, unknown> = { payload }
          if (itemIds.length) {
            body.print_item_ids = itemIds
          } else if (queueId) {
            body.print_list = queueId
          } else {
            throw new Error("Nothing to render.")
          }
          const job = await apiFetch<PrintRenderJob>("/api/v1/print/render/", {
            method: "POST",
            body: JSON.stringify(body),
          })
          const fileUrl = await pollRenderJob(job.id)
          blob = await fetchFileBlob(fileUrl)
        } finally {
          for (const itemId of tempItemIds) {
            try {
              await apiFetch(`/api/v1/print/item/${itemId}/`, { method: "DELETE" })
            } catch {
              // Temporary item cleanup is best-effort.
            }
          }
        }
      }
      if (generation === generationRef.current) {
        setPdfBlob(blob)
      }
    } catch (err) {
      if (generation === generationRef.current) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setError(message)
        setPdfBlob(null)
      }
    } finally {
      if (generation === generationRef.current) {
        setGenerating(false)
      }
    }
  }, [
    colorMode,
    copies,
    defaultQueueId,
    documentUrl,
    format,
    isDocument,
    queueId,
    setPdfBlob,
    showBorders,
    showLogo,
    skipLabels,
    targetId,
    targetType,
    templateId,
  ])

  // Regenerate the preview (debounced) whenever the dialog is open and
  // any option changes.
  useEffect(() => {
    if (!open) {
      return
    }
    if (!isDocument && targetId && !defaultQueueId && !queues.length) {
      // Wait until queues are loaded for ad-hoc targets.
      return
    }
    const timer = setTimeout(() => {
      void generate()
    }, 400)
    return () => clearTimeout(timer)
  }, [open, generate, isDocument, targetId, defaultQueueId, queues.length])

  // Reset state when the dialog closes.
  useEffect(() => {
    if (!open) {
      generationRef.current += 1
      setPdfBlob(null)
      setError(null)
      setGenerating(false)
    }
  }, [open, setPdfBlob])

  const handlePrint = () => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) {
      toast.error("Preview is not ready yet.")
      return
    }
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } catch {
      toast.error("Failed to open the print dialog. Use Download instead.")
    }
  }

  const handleDownload = () => {
    if (!pdfUrl) {
      return
    }
    const anchor = document.createElement("a")
    anchor.href = pdfUrl
    anchor.download = `${(label || "labels").replace(/\s+/g, "-").toLowerCase()}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const isSheetFormat = format !== "single"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isDocument ? "Print document" : "Print labels to PDF"}</DialogTitle>
          <DialogDescription>
            {isDocument
              ? "Preview the document and print it on any system printer."
              : "Generate a PDF with labels and print it on any system printer."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          {!isDocument && (
            <div className="w-full shrink-0 space-y-3 lg:w-64">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="pdf-format">
                  Format
                </label>
                <select
                  id="pdf-format"
                  className={selectClassName}
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                >
                  {LABEL_FORMATS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="pdf-template">
                  Label template
                </label>
                <select
                  id="pdf-template"
                  className={selectClassName}
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  disabled={!availableTemplates.length}
                >
                  {availableTemplates.length ? (
                    availableTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                        {targetType ? "" : ` (${template.label_type})`}
                      </option>
                    ))
                  ) : (
                    <option value="">Built-in layout</option>
                  )}
                </select>
                <p className="text-xs text-muted-foreground">
                  Only templates supporting the selected format are listed.
                </p>
              </div>

              {targetId && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="pdf-copies">
                    Copies
                  </label>
                  <Input
                    id="pdf-copies"
                    type="number"
                    min={1}
                    max={210}
                    value={copies}
                    onChange={(event) =>
                      setCopies(Math.max(1, Number(event.target.value) || 1))
                    }
                  />
                </div>
              )}

              {isSheetFormat && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground" htmlFor="pdf-skip">
                    Skip label positions
                  </label>
                  <Input
                    id="pdf-skip"
                    type="number"
                    min={0}
                    value={skipLabels}
                    onChange={(event) =>
                      setSkipLabels(Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Useful for partially used label sheets.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="pdf-color-mode">
                  Color mode
                </label>
                <select
                  id="pdf-color-mode"
                  className={selectClassName}
                  value={colorMode}
                  onChange={(event) => setColorMode(event.target.value as "color" | "bw")}
                >
                  <option value="color">Color</option>
                  <option value="bw">Black and white</option>
                </select>
              </div>

              {isSheetFormat && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pdf-borders"
                    checked={showBorders}
                    onCheckedChange={(value) => setShowBorders(Boolean(value))}
                  />
                  <label htmlFor="pdf-borders" className="text-sm text-muted-foreground">
                    Show label borders
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="pdf-logo"
                  checked={showLogo}
                  onCheckedChange={(value) => setShowLogo(Boolean(value))}
                />
                <label htmlFor="pdf-logo" className="text-sm text-muted-foreground">
                  Show logo on labels
                </label>
              </div>
            </div>
          )}

          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-md border border-border bg-muted/30">
            {pdfUrl ? (
              <iframe
                ref={iframeRef}
                src={pdfUrl}
                title="PDF preview"
                className="h-full min-h-[420px] w-full"
              />
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {generating
                  ? "Generating PDF..."
                  : error
                    ? `Failed to generate PDF: ${error}`
                    : "PDF preview will appear here."}
              </div>
            )}
            {generating && pdfUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
                Updating preview...
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={handleDownload} disabled={!pdfUrl}>
            <Download className="mr-1.5 h-4 w-4" />
            Download
          </Button>
          <Button onClick={handlePrint} disabled={!pdfUrl || generating}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
