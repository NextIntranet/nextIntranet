import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch, getApiConfig, nextIO, tokenStorage } from "@nextintranet/core"
import { ChevronDown, ListPlus, Printer } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useAddToPrintQueue } from "@/hooks/useAddToPrintQueue"

import type { AgentConfig } from "@nextintranet/core"

interface AgentPrinter {
  name: string
  info?: string | null
  location?: string | null
  isDefault?: boolean
}

interface PrintQueueOption {
  id: string
  name: string
  is_default?: boolean
}

interface PrintRenderJob {
  id: string
  status: "queued" | "processing" | "ready" | "failed"
  file_url?: string | null
  error?: string | null
}

type PrintActionsProps = {
  targetType: "packet" | "location" | "component"
  targetId?: string | null
  kind?: "label" | "document"
  fileUrl?: string | null
  label?: string
  className?: string
  compact?: boolean
}

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

const isInternalUrl = (fileUrl: string) => {
  if (!fileUrl.startsWith("http")) {
    return true
  }
  const apiBaseUrl = getApiConfig().baseUrl
  if (!apiBaseUrl) {
    return false
  }
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl
  return fileUrl.startsWith(base)
}

const inferFileName = (url: string, fallback: string) => {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split("/").filter(Boolean)
    const name = parts[parts.length - 1]
    if (name) {
      return decodeURIComponent(name)
    }
  } catch {
    // Ignore URL parsing issues.
  }
  return fallback
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

export function PrintActions({
  targetType,
  targetId,
  kind = "label",
  fileUrl,
  label,
  className,
  compact = false,
}: PrintActionsProps) {
  const addToQueueMutation = useAddToPrintQueue()
  const [selectedPrinter, setSelectedPrinter] = useState("")
  const [printing, setPrinting] = useState(false)
  const [queuePending, setQueuePending] = useState(false)
  const agents = nextIO.getProfile().agents
  const isDocument = kind === "document"
  const documentUrl = fileUrl?.trim() || ""

  const printAgents = useMemo(
    () =>
      agents.filter(
        (agent) => !agent.capabilities || agent.capabilities.includes("print"),
      ),
    [agents],
  )

  const [selectedAgentId, setSelectedAgentId] = useState(
    printAgents[0]?.id ?? "",
  )

  useEffect(() => {
    if (!printAgents.length) {
      if (selectedAgentId) {
        setSelectedAgentId("")
      }
      return
    }
    if (!selectedAgentId || !printAgents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(printAgents[0].id)
    }
  }, [printAgents, selectedAgentId])

  const selectedAgent = useMemo(
    () => printAgents.find((agent) => agent.id === selectedAgentId) ?? null,
    [printAgents, selectedAgentId],
  )

  const agentConfig = selectedAgent?.config as AgentConfig | undefined

  const { data: printers = [], isLoading: printersLoading } = useQuery<AgentPrinter[]>({
    queryKey: ["agent-printers", selectedAgentId],
    queryFn: () => nextIO.print.listPrinters(selectedAgentId) as Promise<AgentPrinter[]>,
    enabled: Boolean(selectedAgentId),
  })

  const { data: queues = [] } = useQuery<PrintQueueOption[]>({
    queryKey: ["print-queues"],
    queryFn: () => apiFetch<PrintQueueOption[]>("/api/v1/print/list/"),
  })

  const { defaultQueueId, defaultQueueName, otherQueues } = useMemo(() => {
    const defaultQueue = queues.find((queue) => queue.is_default) ?? null
    const fallbackDefault = defaultQueue ?? queues[0] ?? null
    const excludeId = defaultQueue?.id ?? ""
    const filtered =
      excludeId === ""
        ? queues
        : queues.filter((queue) => queue.id !== excludeId)
    return {
      defaultQueueId: fallbackDefault?.id ?? "",
      defaultQueueName: fallbackDefault?.name || "Default queue",
      otherQueues: filtered,
    }
  }, [queues])

  useEffect(() => {
    if (!printers.length) {
      setSelectedPrinter("")
      return
    }
    const configuredDefault =
      typeof agentConfig?.print?.defaultPrinter === "string"
        ? agentConfig.print.defaultPrinter
        : null
    const preferred =
      printers.find((printer) => printer.name === configuredDefault)?.name
      || printers.find((printer) => printer.isDefault)?.name
      || printers[0]?.name
      || ""
    setSelectedPrinter((current) =>
      current && printers.some((printer) => printer.name === current)
        ? current
        : preferred,
    )
  }, [agentConfig?.print?.defaultPrinter, printers])

  const uploadDocumentToQueue = async (queueId: string) => {
    if (!documentUrl) {
      toast.error("Document URL is missing.")
      return
    }
    setQueuePending(true)
    try {
      const resolvedUrl = resolveFileUrl(documentUrl)
      const token = tokenStorage.getToken()
      const headers =
        token && isInternalUrl(documentUrl) ? { Authorization: `Bearer ${token}` } : undefined
      const response = await fetch(resolvedUrl, { headers })
      if (!response.ok) {
        throw new Error(`Failed to fetch document (${response.status}).`)
      }
      const blob = await response.blob()
      const fallbackName = label?.trim() || "Document"
      let fileName = inferFileName(resolvedUrl, fallbackName)
      if (!fileName.includes(".") && blob.type === "application/pdf") {
        fileName = `${fileName}.pdf`
      }
      const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" })
      const data = new FormData()
      data.append("print_list", queueId)
      data.append("file", file)
      if (label?.trim()) {
        data.append("name", label.trim())
      }
      await apiFetch("/api/v1/print/item/upload/", {
        method: "POST",
        body: data,
      })
      toast.success("Document added to print queue.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to add document to print queue: ${message}`)
    } finally {
      setQueuePending(false)
    }
  }

  const handleAddToDefaultQueue = () => {
    if (!defaultQueueId) {
      toast.error("No default print queue is available.")
      return
    }
    if (isDocument) {
      void uploadDocumentToQueue(defaultQueueId)
      return
    }
    if (!targetId) {
      toast.error("Select an item before adding to the queue.")
      return
    }
    addToQueueMutation.mutate({
      targetType,
      targetId,
      kind: "label",
      queueId: defaultQueueId,
    })
  }

  const handleAddToOtherQueue = (queueId: string) => {
    if (!queueId) {
      return
    }
    if (isDocument) {
      void uploadDocumentToQueue(queueId)
      return
    }
    if (!targetId) {
      toast.error("Select an item before adding to the queue.")
      return
    }
    addToQueueMutation.mutate({
      targetType,
      targetId,
      kind: "label",
      queueId,
    })
  }

  const handlePrintDirect = async () => {
    if (!selectedAgentId) {
      toast.error("No printing agent is configured.")
      return
    }
    if (!selectedPrinter) {
      toast.error("Select a printer before printing.")
      return
    }

    setPrinting(true)
    let itemId = ""
    try {
      const token = tokenStorage.getToken()
      const printOptions =
        agentConfig?.print?.options
          && typeof agentConfig.print.options === "object"
          && !Array.isArray(agentConfig.print.options)
          ? agentConfig.print.options
          : undefined
      const printFormat = agentConfig?.print?.format === "raw" ? "raw" : "pdf"

      if (isDocument) {
        if (!documentUrl) {
          toast.error("Document URL is missing.")
          return
        }
        const resolvedFileUrl = resolveFileUrl(documentUrl)
        const headers =
          token && isInternalUrl(documentUrl) ? { Authorization: `Bearer ${token}` } : undefined
        await nextIO.print.submitJob({
          agentId: selectedAgentId,
          printer: selectedPrinter,
          fileUrl: resolvedFileUrl,
          headers,
          title: label ? `Document: ${label}` : "Document",
          format: printFormat,
          options: printOptions,
        })
      } else {
        if (!targetId) {
          toast.error("Select an item before printing.")
          return
        }
        if (!defaultQueueId) {
          toast.error("A default print queue is required for direct printing.")
          return
        }

        const item = await apiFetch<{ id: string }>("/api/v1/print/item/add/", {
          method: "POST",
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            kind: "label",
            print_list: defaultQueueId,
          }),
        })
        itemId = item.id

        const renderJob = await apiFetch<PrintRenderJob>("/api/v1/print/render/", {
          method: "POST",
          body: JSON.stringify({
            print_item_ids: [itemId],
            payload: {
              format: "single",
            },
          }),
        })

        const fileUrl = await pollRenderJob(renderJob.id)
        const resolvedFileUrl = resolveFileUrl(fileUrl)
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined

        const titlePrefix =
          targetType === "location"
            ? "Location"
            : targetType === "packet"
              ? "Packet"
              : "Component"

        await nextIO.print.submitJob({
          agentId: selectedAgentId,
          printer: selectedPrinter,
          fileUrl: resolvedFileUrl,
          headers,
          title: label ? `${titlePrefix}: ${label}` : `${titlePrefix} label`,
          format: printFormat,
          options: printOptions,
        })
      }

      toast.success(`Print job sent to ${selectedPrinter}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to print: ${message}`)
    } finally {
      if (itemId) {
        try {
          await apiFetch(`/api/v1/print/item/${itemId}/`, { method: "DELETE" })
        } catch {
          // Keep silent; direct print cleanup is best-effort.
        }
      }
      setPrinting(false)
    }
  }

  const iconButtonClassName = compact ? "h-7 w-7" : "h-8 w-8"
  const triggerClassName = compact ? "h-7 w-7 px-0" : "h-8 w-8 px-0"
  const canPrint = isDocument
    ? Boolean(documentUrl && selectedPrinter && selectedAgentId)
    : Boolean(targetId && selectedPrinter && selectedAgentId && defaultQueueId)
  const canAddToDefault = isDocument
    ? Boolean(documentUrl && defaultQueueId)
    : Boolean(targetId && defaultQueueId)
  const queueBusy = addToQueueMutation.isPending || queuePending
  const defaultQueueLabel = canAddToDefault
    ? `Add to default queue: ${defaultQueueName}`
    : "No default queue available"

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className={cn("rounded-r-none", iconButtonClassName)}
            onClick={handlePrintDirect}
            disabled={printing || !canPrint}
            aria-label="Print directly"
            title={printing ? "Printing..." : "Print directly"}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Print directly</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className={cn("rounded-none border-l border-border", iconButtonClassName)}
            onClick={handleAddToDefaultQueue}
            disabled={!canAddToDefault || queueBusy}
            aria-label="Add to default queue"
            title={defaultQueueLabel}
          >
            <ListPlus className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{defaultQueueLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className={cn("rounded-l-none border-l border-border", triggerClassName)}
            disabled={!printersLoading && !printers.length && !queues.length}
            title="Print options"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuItem disabled className="cursor-default text-xs text-muted-foreground">
            Printers
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {printersLoading ? (
            <DropdownMenuItem disabled className="cursor-default text-sm">
              Loading printers...
            </DropdownMenuItem>
          ) : printers.length ? (
            <DropdownMenuRadioGroup
              value={selectedPrinter}
              onValueChange={(value) => setSelectedPrinter(value)}
            >
              {printers.map((printer) => (
                <DropdownMenuRadioItem key={printer.name} value={printer.name}>
                  {printer.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            <DropdownMenuItem disabled className="cursor-default text-sm">
              No printers found
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {otherQueues.length ? (
            <>
              <DropdownMenuItem
                disabled
                className="cursor-default text-xs text-muted-foreground"
              >
                Other queues
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {otherQueues.map((queue) => (
                <DropdownMenuItem
                  key={queue.id}
                  onClick={() => handleAddToOtherQueue(queue.id)}
                  disabled={(isDocument ? !documentUrl : !targetId) || queueBusy}
                >
                  {queue.name || "Untitled queue"}
                </DropdownMenuItem>
              ))}
            </>
          ) : (
            <DropdownMenuItem disabled className="cursor-default text-sm">
              No other queues
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
