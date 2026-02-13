import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { ChevronDown, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAddToPrintQueue } from "@/hooks/useAddToPrintQueue"
import { cn } from "@/lib/utils"

interface PrintQueueOption {
  id: string
  name: string
  is_default?: boolean
}

type AddToQueueActionProps = {
  targetType: "packet" | "location" | "component"
  targetId?: string | null
  kind?: "label" | "document"
  className?: string
  buttonLabel?: string
}

export function AddToQueueAction({
  targetType,
  targetId,
  kind = "label",
  className,
  buttonLabel = "Add",
}: AddToQueueActionProps) {
  const addToQueueMutation = useAddToPrintQueue()
  const { data: queues = [], isLoading } = useQuery<PrintQueueOption[]>({
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
    if (!defaultQueueId) {
      return
    }
  }, [defaultQueueId])

  const hasQueues = queues.length > 0
  const isDisabled = !targetId || isLoading || !hasQueues || !defaultQueueId

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        variant="secondary"
        size="sm"
        className="h-8 gap-1 rounded-r-none px-2 text-xs"
        title={`Add to default queue: ${defaultQueueName}`}
        onClick={() =>
          targetId &&
          addToQueueMutation.mutate({
            targetType,
            targetId,
            kind,
            queueId: defaultQueueId || undefined,
          })
        }
        disabled={isDisabled || addToQueueMutation.isPending}
      >
        <Printer className="h-3.5 w-3.5" />
        {buttonLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 rounded-l-none border-l border-border px-1.5"
            disabled={!hasQueues || isLoading || otherQueues.length === 0}
            title="Add to another queue"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem
            disabled
            className="cursor-default text-xs text-muted-foreground"
          >
            Other queues
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {otherQueues.length === 0 ? (
            <DropdownMenuItem disabled className="cursor-default text-sm">
              No other queues
            </DropdownMenuItem>
          ) : (
            otherQueues.map((queue) => (
              <DropdownMenuItem
                key={queue.id}
                onClick={() =>
                  targetId &&
                  addToQueueMutation.mutate({
                    targetType,
                    targetId,
                    kind,
                    queueId: queue.id,
                  })
                }
              >
                {queue.name || "Untitled queue"}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
