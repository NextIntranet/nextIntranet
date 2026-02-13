import { useMutation } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

type AddToPrintQueuePayload = {
  targetType: "packet" | "location" | "component"
  targetId: string
  kind?: "label" | "document"
  queueId?: string
  payload?: Record<string, unknown>
}

export function useAddToPrintQueue() {
  return useMutation({
    mutationFn: (payload: AddToPrintQueuePayload) =>
      apiFetch("/api/v1/print/item/add/", {
        method: "POST",
        body: JSON.stringify({
          target_type: payload.targetType,
          target_id: payload.targetId,
          kind: payload.kind ?? "label",
          print_list: payload.queueId,
          payload: payload.payload ?? {},
        }),
      }),
    onSuccess: () => {
      toast.success("Added to print queue.")
    },
    onError: () => {
      toast.error("Failed to add to print queue.")
    },
  })
}
