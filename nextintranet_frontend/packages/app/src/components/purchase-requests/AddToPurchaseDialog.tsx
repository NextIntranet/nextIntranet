import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, type ApiError } from "@nextintranet/core"
import Select, { type SingleValue } from "react-select"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { PurchaseRequest } from "./types"
import { purchaseRequestToItem } from "./purchaseRequestToItem"

const OPEN_PURCHASE_STATUSES = new Set(["draft", "items_defined", "priced"])

const selectStyles = {
  control: (base: Record<string, unknown>) => ({
    ...base,
    minHeight: 32,
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    "&:hover": { borderColor: "var(--border)" },
  }),
  menuPortal: (base: Record<string, unknown>) => ({ ...base, zIndex: 10000 }),
  menu: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: "var(--background)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 12px rgb(0 0 0 / 0.15)",
    zIndex: 10000,
  }),
  menuList: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: "var(--background)",
    padding: 0,
    maxHeight: 260,
  }),
  option: (base: Record<string, unknown>, state: { isFocused: boolean }) => ({
    ...base,
    backgroundColor: state.isFocused ? "var(--muted)" : "var(--background)",
    color: "var(--foreground)",
  }),
  singleValue: (base: Record<string, unknown>) => ({ ...base, color: "var(--foreground)" }),
  input: (base: Record<string, unknown>) => ({ ...base, color: "var(--foreground)", backgroundColor: "transparent" }),
}

interface Supplier {
  id: string
  name: string
}

interface Purchase {
  id: string
  supplier: Supplier
  status: string
}

interface PaginatedResponse<T> {
  results: T[]
}

const asList = <T,>(data: T[] | PaginatedResponse<T> | undefined): T[] =>
  !data ? [] : Array.isArray(data) ? data : data.results || []

function errorMessage(error: unknown, fallback: string): string {
  const api = error as ApiError
  if (api?.data != null) {
    if (typeof api.data === "string" && api.data.trim()) {
      return api.data.trim()
    }
    if (typeof api.data === "object") {
      for (const value of Object.values(api.data as Record<string, unknown>)) {
        if (typeof value === "string") return value
        if (Array.isArray(value) && typeof value[0] === "string") return value[0]
      }
    }
  }
  return fallback
}

interface Props {
  request: PurchaseRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddToPurchaseDialog({ request, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>("")

  const { data: purchasesData, isLoading } = useQuery<Purchase[] | PaginatedResponse<Purchase>>({
    queryKey: ["purchases", "open"],
    queryFn: () => apiFetch<Purchase[] | PaginatedResponse<Purchase>>("/api/v1/store/purchases/?page_size=1000"),
    enabled: open,
  })

  const openPurchases = useMemo(
    () => asList(purchasesData).filter((purchase) => OPEN_PURCHASE_STATUSES.has(purchase.status)),
    [purchasesData],
  )

  const purchaseOptions = useMemo(
    () =>
      openPurchases.map((purchase) => ({
        value: purchase.id,
        label: `${purchase.supplier?.name || "Supplier"} · #${purchase.id.slice(0, 8)}`,
      })),
    [openPurchases],
  )

  const addMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      const purchase = openPurchases.find((item) => item.id === purchaseId)
      if (!purchase) {
        throw new Error("Selected order is not available.")
      }

      // Refetch the request scoped to the target supplier so the backend can resolve
      // matching_supplier_relation_id for that specific order.
      const scoped = await apiFetch<PurchaseRequest[] | PaginatedResponse<PurchaseRequest>>(
        `/api/v1/store/purchase-requests/?page_size=1&assigned=all&component=${request.component_id}&supplier=${purchase.supplier.id}`,
      )
      const scopedRequest = asList(scoped).find((item) => item.id === request.id) || request

      const item = purchaseRequestToItem(scopedRequest)
      if (!item) {
        throw new Error("Request has no matching supplier relation for this order's supplier.")
      }

      return apiFetch(`/api/v1/store/purchase/${purchaseId}/`, {
        method: "PATCH",
        body: JSON.stringify({ items: [item], purchase_request_ids: [request.id] }),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["purchases"] }),
      ])
      toast.success("Request added to purchase order.")
      setSelectedPurchaseId("")
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Failed to add request to purchase order."))
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to purchase order</DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Link this request to an open purchase order. The request will be marked as ordered.
          </p>
          <Select
            options={purchaseOptions}
            value={purchaseOptions.find((option) => option.value === selectedPurchaseId) || null}
            onChange={(option: SingleValue<{ value: string; label: string }>) =>
              setSelectedPurchaseId(option?.value || "")
            }
            placeholder={isLoading ? "Loading orders..." : "Select an open order"}
            isLoading={isLoading}
            isClearable
            menuPortalTarget={document.body}
            styles={selectStyles}
            noOptionsMessage={() => "No open purchase orders."}
          />
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!selectedPurchaseId || addMutation.isPending}
              onClick={() => addMutation.mutate(selectedPurchaseId)}
            >
              {addMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
