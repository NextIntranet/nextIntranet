import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type RequestComponentSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId?: string | null
  componentName?: string | null
  onCreated?: () => void
}

/**
 * Create a purchase request for a fixed component.
 *
 * Slim counterpart of the create form on PurchaseRequestsPage — the component is
 * given by the page it is opened from, so only quantity and description are asked.
 */
export function RequestComponentSheet({
  open,
  onOpenChange,
  componentId,
  componentName,
  onCreated,
}: RequestComponentSheetProps) {
  const queryClient = useQueryClient()
  const [formState, setFormState] = useState({ quantity: "1", description: "" })

  useEffect(() => {
    if (open) {
      setFormState({ quantity: "1", description: "" })
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (payload: { component_id: string; quantity: number; description: string }) =>
      apiFetch("/api/v1/store/purchase-requests/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      onOpenChange(false)
      onCreated?.()
      toast.success("Purchase request created.")
    },
    onError: () => {
      toast.error("Failed to create request.")
    },
  })

  const quantity = Number(formState.quantity)
  const canSubmit = !!componentId && Number.isFinite(quantity) && quantity > 0

  const handleCreate = () => {
    if (!canSubmit || !componentId) {
      return
    }
    createMutation.mutate({
      component_id: componentId,
      quantity,
      description: formState.description.trim(),
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg">
        <SheetHeader>
          <SheetTitle>Request component</SheetTitle>
          <SheetDescription>Create a purchase request for this component.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Component</label>
            <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground">
              {componentName || componentId || "-"}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Quantity</label>
            <Input
              type="number"
              value={formState.quantity}
              onChange={(e) => setFormState({ ...formState, quantity: e.target.value })}
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={formState.description}
              onChange={(e) => setFormState({ ...formState, description: e.target.value })}
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Additional details or specifications"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleCreate} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create request"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
