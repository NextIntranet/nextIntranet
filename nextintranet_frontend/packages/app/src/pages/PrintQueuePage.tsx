import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, getApiConfig, nextIO, tokenStorage } from "@nextintranet/core"
import type { AgentConfig } from "@nextintranet/core"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExtensionPoint } from "@/plugins/ExtensionPoint"
import { PdfPrintDialog } from "@/components/PdfPrintDialog"
import { cn } from "@/lib/utils"

interface AgentPrinter {
  name: string
  info?: string | null
  location?: string | null
  isDefault?: boolean
}

interface PrintRenderJob {
  id: string
  status: "queued" | "processing" | "ready" | "failed"
  file_url?: string | null
  error?: string | null
}

interface PrintQueue {
  id: string
  name: string
  created_at: string
  printed_at?: string | null
  items_count?: number
  is_default?: boolean
}

interface PrintQueueItem {
  id: string
  kind: "label" | "document"
  status: "queued" | "printing" | "printed" | "failed"
  content_type_model?: string | null
  content_label?: string | null
  content_url?: string | null
  object_id: string
  created_at: string
  printed_at?: string | null
  payload?: Record<string, unknown>
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "Not printed"
  }
  return new Date(value).toLocaleString()
}

const formatKind = (kind: PrintQueueItem["kind"]) =>
  kind === "document" ? "Document" : "Label"

const formatStatus = (status: PrintQueueItem["status"]) =>
  status.charAt(0).toUpperCase() + status.slice(1)

export function PrintQueuePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [queueName, setQueueName] = useState("")
  const [queueDefault, setQueueDefault] = useState(false)
  const [uploadName, setUploadName] = useState("")
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const agents = nextIO.getProfile().agents
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "")
  const [printers, setPrinters] = useState<AgentPrinter[]>([])
  const [printersLoading, setPrintersLoading] = useState(false)
  const [selectedPrinter, setSelectedPrinter] = useState("")
  const [printing, setPrinting] = useState(false)
  const [printStatus, setPrintStatus] = useState<string | null>(null)
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  )
  const agentConfig = selectedAgent?.config as AgentConfig | undefined

  const { data: queues = [], isLoading: queuesLoading } = useQuery<PrintQueue[]>({
    queryKey: ["print-queues"],
    queryFn: () => apiFetch<PrintQueue[]>("/api/v1/print/list/"),
  })

  const activeQueueId = id ?? queues.find((queue) => queue.is_default)?.id ?? queues[0]?.id

  useEffect(() => {
    if (!id && queues.length > 0) {
      const nextId = queues.find((queue) => queue.is_default)?.id ?? queues[0].id
      navigate(`/print/queue/${nextId}`, { replace: true })
    }
  }, [id, navigate, queues])

  const { data: items = [], isLoading: itemsLoading } = useQuery<PrintQueueItem[]>({
    queryKey: ["print-queue-items", activeQueueId],
    queryFn: () =>
      apiFetch<PrintQueueItem[]>(`/api/v1/print/item/?print_list=${activeQueueId}`),
    enabled: !!activeQueueId,
  })

  const activeQueue = useMemo(
    () => queues.find((queue) => queue.id === activeQueueId) ?? null,
    [activeQueueId, queues],
  )

  useEffect(() => {
    if (createOpen) {
      setQueueName("")
      setQueueDefault(!queues.some((queue) => queue.is_default))
    }
  }, [createOpen, queues])

  useEffect(() => {
    if (uploadOpen) {
      setUploadName("")
      setUploadFile(null)
    }
  }, [uploadOpen])

  useEffect(() => {
    if (!agents.length) {
      if (selectedAgentId) {
        setSelectedAgentId("")
      }
      return
    }
    if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(agents[0].id)
    }
  }, [agents, selectedAgentId])

  useEffect(() => {
    if (!selectedAgentId) {
      setPrinters([])
      setSelectedPrinter("")
      return
    }

    let active = true
    setPrintersLoading(true)
    nextIO.print
      .listPrinters(selectedAgentId)
      .then((data) => {
        if (!active) return
        const printerList = Array.isArray(data) ? (data as AgentPrinter[]) : []
        setPrinters(printerList)
        const configuredDefault =
          typeof agentConfig?.print?.defaultPrinter === "string"
            ? agentConfig.print.defaultPrinter
            : null
        const preferred =
          printerList.find((printer) => printer.name === configuredDefault)?.name
          || printerList.find((printer) => printer.isDefault)?.name
          || printerList[0]?.name
          || ""
        setSelectedPrinter((current) =>
          current && printerList.some((printer) => printer.name === current)
            ? current
            : preferred,
        )
      })
      .catch((error) => {
        if (!active) return
        const message = error instanceof Error ? error.message : "Unknown error"
        toast.error(`Failed to load printers: ${message}`)
        setPrinters([])
      })
      .finally(() => {
        if (active) {
          setPrintersLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [agentConfig?.print?.defaultPrinter, selectedAgentId])

  const createQueueMutation = useMutation({
    mutationFn: (payload: { name: string; is_default: boolean }) =>
      apiFetch("/api/v1/print/list/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print-queues"] })
      toast.success("Print queue created.")
      setCreateOpen(false)
    },
    onError: () => {
      toast.error("Failed to create print queue.")
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (queueId: string) =>
      apiFetch(`/api/v1/print/list/${queueId}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_default: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print-queues"] })
      toast.success("Default queue updated.")
    },
    onError: () => {
      toast.error("Failed to update default queue.")
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!activeQueueId) {
        throw new Error("Missing queue.")
      }
      if (!uploadFile) {
        throw new Error("Missing file.")
      }
      const data = new FormData()
      data.append("print_list", activeQueueId)
      data.append("file", uploadFile)
      if (uploadName.trim()) {
        data.append("name", uploadName.trim())
      }
      return apiFetch("/api/v1/print/item/upload/", {
        method: "POST",
        body: data,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print-queue-items", activeQueueId] })
      toast.success("Document added to queue.")
      setUploadOpen(false)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to upload document: ${message}`)
    },
  })

  const resolveFileUrl = (fileUrl: string) => {
    if (fileUrl.startsWith("http")) {
      return fileUrl
    }
    const apiBaseUrl = getApiConfig().baseUrl
    if (!apiBaseUrl) {
      return fileUrl
    }
    const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl
    const suffix = fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`
    return `${base}${suffix}`
  }

  const pollRenderJob = async (jobId: string) => {
    const maxAttempts = 24
    const delayMs = 1000
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const job = await apiFetch<PrintRenderJob>(`/api/v1/print/render/${jobId}/`)
      if (job.status === "ready" && job.file_url) {
        return job.file_url
      }
      if (job.status === "failed") {
        throw new Error(job.error || "Print render failed.")
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    throw new Error("Print render timed out.")
  }

  const handleAgentPrint = async () => {
    if (!activeQueueId) {
      toast.error("Select a print queue before printing.")
      return
    }
    if (!selectedAgentId) {
      toast.error("Select an agent before printing.")
      return
    }
    if (!selectedPrinter) {
      toast.error("Select a printer before printing.")
      return
    }

    setPrinting(true)
    setPrintStatus("Rendering labels...")
    try {
      const job = await apiFetch<PrintRenderJob>("/api/v1/print/render/", {
        method: "POST",
        body: JSON.stringify({
          print_list: activeQueueId,
          payload: {
            format: "single",
          },
        }),
      })

      const fileUrl = await pollRenderJob(job.id)
      const resolvedFileUrl = resolveFileUrl(fileUrl)
      setPrintStatus("Sending job to printer...")

      const token = tokenStorage.getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const printOptions =
        agentConfig?.print?.options
          && typeof agentConfig.print.options === "object"
          && !Array.isArray(agentConfig.print.options)
          ? agentConfig.print.options
          : undefined
      const printFormat = agentConfig?.print?.format === "raw" ? "raw" : "pdf"

      await nextIO.print.submitJob({
        agentId: selectedAgentId,
        printer: selectedPrinter,
        fileUrl: resolvedFileUrl,
        headers,
        title: activeQueue?.name ? `Labels: ${activeQueue.name}` : "Print queue labels",
        format: printFormat,
        options: printOptions,
      })

      toast.success(`Print job sent to ${selectedPrinter}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to print queue: ${message}`)
    } finally {
      setPrinting(false)
      setPrintStatus(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Print queue</h1>
          <p className="text-sm text-muted-foreground">
            Track queued labels and documents waiting to print.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            New queue
          </Button>
          <Button
            size="sm"
            onClick={() => setPdfDialogOpen(true)}
            disabled={!activeQueueId || !items.some((item) => item.kind === "label")}
          >
            Print to PDF
          </Button>
          <ExtensionPoint name="printqueue.actions" context={{ queueId: activeQueueId }} />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Agent printing</CardTitle>
          <CardDescription>
            Render queued labels and send them to a local agent printer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground" htmlFor="agent-select">
                  Agent
                </label>
                <select
                  id="agent-select"
                  value={selectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                    "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  )}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label || agent.id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-foreground" htmlFor="printer-select">
                  Printer
                </label>
                <select
                  id="printer-select"
                  value={selectedPrinter}
                  onChange={(event) => setSelectedPrinter(event.target.value)}
                  disabled={!printers.length || printersLoading}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm",
                    "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  {printersLoading ? (
                    <option value="">Loading printers...</option>
                  ) : printers.length ? (
                    printers.map((printer) => (
                      <option key={printer.name} value={printer.name}>
                        {printer.name}
                      </option>
                    ))
                  ) : (
                    <option value="">No printers found</option>
                  )}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleAgentPrint}
                  disabled={printing || !selectedPrinter || !selectedAgentId}
                >
                  {printing ? "Printing..." : "Print queued labels"}
                </Button>
                {printStatus && (
                  <span className="text-xs text-muted-foreground">{printStatus}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No agents configured. Add one in{" "}
              <Link className="text-primary" to="/setting/hardware">
                Hardware
              </Link>
              .
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Queues</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="w-full table-fixed">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 w-[50%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Name
                  </TableHead>
                  <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Items
                  </TableHead>
                  <TableHead className="h-9 w-[30%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Last printed
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queuesLoading ? (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={3} className="py-6">
                      <div className="space-y-2 px-3">
                        <Skeleton className="h-5 w-2/3" />
                        <Skeleton className="h-5 w-1/2" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : queues.length ? (
                  queues.map((queue) => {
                    const isActive = queue.id === activeQueueId
                    return (
                      <TableRow
                        key={queue.id}
                        className={cn("border-border/40", isActive && "bg-muted/30")}
                      >
                        <TableCell className="h-9 px-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/print/queue/${queue.id}`)}
                              className="text-left font-medium text-primary hover:underline"
                            >
                              {queue.name || "Untitled queue"}
                            </button>
                            {queue.is_default && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                Default
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {queue.items_count ?? 0}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <span>{formatDate(queue.printed_at)}</span>
                            {!queue.is_default && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDefaultMutation.mutate(queue.id)}
                                disabled={setDefaultMutation.isPending}
                              >
                                Set default
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={3} className="py-6 px-3 text-sm text-muted-foreground">
                      No print queues available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                {activeQueue ? `Queue items: ${activeQueue.name || "Untitled"}` : "Queue items"}
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUploadOpen(true)}
                disabled={!activeQueueId}
              >
                Upload document
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="w-full table-fixed">
              <TableHeader className="bg-muted/40">
                <TableRow className="border-border/50">
                  <TableHead className="h-9 w-[18%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Kind
                  </TableHead>
                  <TableHead className="h-9 w-[36%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Target
                  </TableHead>
                  <TableHead className="h-9 w-[22%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="h-9 w-[24%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={4} className="py-6">
                      <div className="space-y-2 px-3">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-2/3" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.length ? (
                  items.map((item) => {
                    const targetLabel =
                      item.content_label ||
                      (item.content_type_model
                        ? `${item.content_type_model} ${item.object_id}`
                        : item.object_id)

                    return (
                      <TableRow key={item.id} className="border-border/40">
                        <TableCell className="h-9 px-3 text-sm font-medium">
                          {formatKind(item.kind)}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {targetLabel}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {formatStatus(item.status)}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {new Date(item.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow className="border-border/40">
                    <TableCell colSpan={4} className="py-6 px-3 text-sm text-muted-foreground">
                      {activeQueueId
                        ? "No items queued for this print queue."
                        : "Select a queue to see its items."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <PdfPrintDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        queueId={activeQueueId}
        label={activeQueue?.name || "queue-labels"}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New print queue</DialogTitle>
            <DialogDescription>Queues help organize labels and documents for printing.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="queue-name">
                Queue name
              </label>
              <Input
                id="queue-name"
                value={queueName}
                onChange={(event) => setQueueName(event.target.value)}
                placeholder="Main print queue"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="queue-default"
                checked={queueDefault}
                onCheckedChange={(value) => setQueueDefault(Boolean(value))}
              />
              <label htmlFor="queue-default" className="text-sm text-muted-foreground">
                Set as default queue
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createQueueMutation.mutate({ name: queueName.trim(), is_default: queueDefault })}
              disabled={createQueueMutation.isPending || !queueName.trim()}
            >
              {createQueueMutation.isPending ? "Creating..." : "Create queue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              Add an existing A4 document to the selected print queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="upload-name">
                Document name
              </label>
              <Input
                id="upload-name"
                value={uploadName}
                onChange={(event) => setUploadName(event.target.value)}
                placeholder="Invoice 2024-07"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="upload-file">
                File
              </label>
              <Input
                id="upload-file"
                type="file"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !uploadFile}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload to queue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
