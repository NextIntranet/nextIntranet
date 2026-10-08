import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

import { LocationParentSelect } from "@/components/LocationParentSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export type TargetLocationNode = {
  id: string
  name: string
  full_path: string
  can_store_items?: boolean
  is_warehouse?: boolean
  children?: TargetLocationNode[]
}

/** Keep warehouses, storage positions and the nodes leading to them. */
export function targetLocationTree(nodes: TargetLocationNode[]): TargetLocationNode[] {
  return nodes.flatMap((node) => {
    const children = targetLocationTree(node.children || [])
    if (node.is_warehouse || node.can_store_items || children.length > 0) {
      return [{ ...node, children }]
    }
    return []
  })
}

type RequestComponentSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId?: string | null
  componentName?: string | null
  onCreated?: () => void
  /** When set, the request is filed for this BOM line (one open request per line). */
  bomLineId?: string | null
  defaultQuantity?: number
  defaultTargetLocation?: string | null
  /** Shown under the title, e.g. which BOM asks for the parts. */
  context?: string | null
}

/**
 * Create a purchase request for a fixed component, with a target warehouse or position.
 *
 * Slim counterpart of the create form on PurchaseRequestsPage — the component is
 * given by the page it is opened from. Opened from a BOM line it files (or updates)
 * that line's open request.
 */
export function RequestComponentSheet({
  open,
  onOpenChange,
  componentId,
  componentName,
  onCreated,
  bomLineId,
  defaultQuantity,
  defaultTargetLocation,
  context,
}: RequestComponentSheetProps) {
  const queryClient = useQueryClient()
  const [formState, setFormState] = useState({ quantity: "1", description: "", targetLocation: "" })

  useEffect(() => {
    if (open) {
      setFormState({
        quantity: String(defaultQuantity && defaultQuantity > 0 ? defaultQuantity : 1),
        description: "",
        targetLocation: defaultTargetLocation || "",
      })
    }
  }, [open, defaultQuantity, defaultTargetLocation])

  const { data: locationsTree } = useQuery<TargetLocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<TargetLocationNode[]>("/api/v1/store/location/tree/"),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  const targetTree = useMemo(() => targetLocationTree(locationsTree || []), [locationsTree])

  const createMutation = useMutation({
    mutationFn: (payload: { quantity: number; description: string; target_location: string | null }) =>
      bomLineId
        ? apiFetch(`/api/v1/production/template-components/${bomLineId}/request/`, {
            method: "POST",
            body: JSON.stringify({ quantity: payload.quantity, target_location: payload.target_location }),
          })
        : apiFetch("/api/v1/store/purchase-requests/", {
            method: "POST",
            body: JSON.stringify({ component_id: componentId, ...payload }),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] })
      queryClient.invalidateQueries({ queryKey: ["production-availability"] })
      onOpenChange(false)
      onCreated?.()
      toast.success(bomLineId ? "Component requested." : "Purchase request created.")
    },
    onError: (err) => {
      const message = (err as { data?: { error?: string } } | null)?.data?.error
      toast.error(message || "Failed to create request.")
    },
  })

  const quantity = Number(formState.quantity)
  const canSubmit = !!componentId && Number.isInteger(quantity) && quantity > 0

  const handleCreate = () => {
    if (!canSubmit) {
      return
    }
    createMutation.mutate({
      quantity,
      description: formState.description.trim(),
      target_location: formState.targetLocation || null,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg">
        <SheetHeader>
          <SheetTitle>Request component</SheetTitle>
          <SheetDescription>
            {context || "Create a purchase request for this component."}
          </SheetDescription>
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
              min={1}
              step={1}
              value={formState.quantity}
              onChange={(e) => setFormState({ ...formState, quantity: e.target.value })}
              placeholder="1"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Target warehouse or position</label>
            <LocationParentSelect
              locations={targetTree}
              value={formState.targetLocation || null}
              onChange={(value) => setFormState({ ...formState, targetLocation: value ?? "" })}
              placeholder="Select target location"
              emptyLabel={bomLineId ? "BOM warehouse" : "Not specified"}
            />
            <p className="text-xs text-muted-foreground">Where the parts should end up once they arrive.</p>
          </div>
          {!bomLineId ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Additional details or specifications"
              />
            </div>
          ) : null}
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
              {createMutation.isPending ? "Saving..." : bomLineId ? "Request" : "Create request"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
