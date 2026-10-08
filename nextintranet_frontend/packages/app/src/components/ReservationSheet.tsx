import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"

import { ComponentAsyncSelect } from "@/components/ComponentAsyncSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type LocationNode = {
  id: string
  full_path: string
  is_warehouse?: boolean
  children?: LocationNode[]
}

export type WarehouseOption = { id: string; full_path: string }

/** All locations flagged as warehouse, in tree order. */
export function flattenWarehouses(nodes: LocationNode[], out: WarehouseOption[] = []): WarehouseOption[] {
  nodes.forEach((node) => {
    if (node.is_warehouse) out.push({ id: String(node.id), full_path: node.full_path })
    flattenWarehouses(node.children || [], out)
  })
  return out
}

export function useWarehouseOptions(enabled = true) {
  const { data } = useQuery<LocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => flattenWarehouses(data || []), [data])
}

/** `datetime-local`-free expiry: a date, stored as the end of that day. */
export function expiryFromDateInput(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null
}

export function dateInputFromExpiry(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type ReservationSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fixes the component (opened from a component page); otherwise it is picked in the form. */
  componentId?: string | null
  componentName?: string | null
  onCreated?: () => void
}

/** Create a manual reservation: holds stock of one component in one warehouse. */
export function ReservationSheet({ open, onOpenChange, componentId, componentName, onCreated }: ReservationSheetProps) {
  const queryClient = useQueryClient()
  const warehouses = useWarehouseOptions(open)
  const [form, setForm] = useState({
    component: "",
    quantity: "1",
    warehouse: "",
    priority: "3",
    expiration: "",
    description: "",
  })

  useEffect(() => {
    if (open) {
      setForm({
        component: componentId || "",
        quantity: "1",
        warehouse: "",
        priority: "3",
        expiration: "",
        description: "",
      })
    }
  }, [open, componentId])

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/v1/store/reservations/", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] })
      queryClient.invalidateQueries({ queryKey: ["component"] })
      queryClient.invalidateQueries({ queryKey: ["production-availability"] })
      onOpenChange(false)
      onCreated?.()
      toast.success("Reservation created.")
    },
    onError: (err) => {
      const data = (err as { data?: Record<string, unknown> } | null)?.data
      const message = data
        ? Object.values(data)
            .flat()
            .filter((v) => typeof v === "string")
            .join(" ")
        : ""
      toast.error(message || "Failed to create reservation.")
    },
  })

  const quantity = Number(form.quantity)
  const canSubmit = !!form.component && Number.isFinite(quantity) && quantity > 0

  const handleCreate = () => {
    if (!canSubmit) return
    createMutation.mutate({
      component_id: form.component,
      quantity,
      warehouse: form.warehouse || null,
      priority: Number(form.priority) || 3,
      expiration_date: expiryFromDateInput(form.expiration),
      description: form.description.trim(),
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-lg">
        <SheetHeader>
          <SheetTitle>New reservation</SheetTitle>
          <SheetDescription>Hold stock of a component in a warehouse so it is no longer counted as available.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Component</label>
            {componentId ? (
              <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-foreground">
                {componentName || componentId}
              </div>
            ) : (
              <ComponentAsyncSelect value={form.component} onChange={(id) => setForm({ ...form, component: id })} />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="1">1 — highest</option>
                <option value="2">2</option>
                <option value="3">3 — normal</option>
                <option value="4">4</option>
                <option value="5">5 — lowest</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Warehouse</label>
            <select
              value={form.warehouse}
              onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Default (your home warehouse)</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.full_path}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">The reservation holds stock only in this warehouse.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Expires</label>
            <Input type="date" value={form.expiration} onChange={(e) => setForm({ ...form, expiration: e.target.value })} />
            <p className="text-xs text-muted-foreground">Optional. After this day the stock is available again.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="What the stock is held for"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleCreate} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Create reservation"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
