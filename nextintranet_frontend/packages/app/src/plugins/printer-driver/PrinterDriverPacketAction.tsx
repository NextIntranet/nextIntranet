import { useMutation } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Printer } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { PacketActionContext, PluginActionProps } from "@/plugins/types"

type ExecuteResponse = {
  labels?: Array<{ type: string; id: string }>
}

export function PrinterDriverPacketAction({ instance, context }: PluginActionProps) {
  const packetId = (context as PacketActionContext | undefined)?.packetId

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!packetId) {
        throw new Error("Missing packet ID.")
      }
      return apiFetch<ExecuteResponse>(`/api/v1/plugins/instances/${instance.id}/execute/`, {
        method: "POST",
        body: JSON.stringify({
          action: "print_labels",
          target: { type: "packet", id: packetId },
          format: "single_label",
        }),
      })
    },
    onSuccess: (data) => {
      const labels = data?.labels ?? []
      console.info("[PrinterDriver] Labels ready for printing:", labels)
      toast.success(`Printer "${instance.name}" listed ${labels.length} label(s) in console.`)
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Failed to run printer action: ${message}`)
    },
  })

  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-2"
      onClick={() => executeMutation.mutate()}
      disabled={executeMutation.isPending}
      title={`Printer: ${instance.name}`}
    >
      <Printer className="h-4 w-4" />
      Print labels ({instance.name})
    </Button>
  )
}
