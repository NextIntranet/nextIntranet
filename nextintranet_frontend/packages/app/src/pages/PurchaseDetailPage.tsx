import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, type ApiError, getApiConfig } from "@nextintranet/core"
import { Download, ExternalLink, Pencil, Save, Trash2 } from "lucide-react"
import Select, { type SingleValue } from "react-select"
import AsyncSelect from "react-select/async"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { LocationParentSelect } from "@/components/LocationParentSelect"

const addComponentSelectStyles = {
  control: (base: Record<string, unknown>) => ({
    ...base,
    minHeight: 32,
    backgroundColor: "var(--background)",
    borderColor: "var(--border)",
    "&:hover": { borderColor: "var(--border)" },
  }),
  valueContainer: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: "var(--background)",
  }),
  menuPortal: (base: Record<string, unknown>) => ({
    ...base,
    zIndex: 10000,
  }),
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
  input: (base: Record<string, unknown>) => ({
    ...base,
    color: "var(--foreground)",
    backgroundColor: "transparent",
  }),
}

type PurchaseStatus =
  | "draft"
  | "items_defined"
  | "priced"
  | "closed"
  | "exported"
  | "receiving"
  | "stocking"
  | "completed"

type PurchaseItemType = "component" | "non_stock"

type PurchaseExportMode = "list" | "supplier_csv"

interface Supplier {
  id: string
  name: string
  website?: string | null
}

interface LocationNode {
  id: string
  name: string
  full_path: string
  can_store_items?: boolean
  children?: LocationNode[]
}

type SelectOption = { value: string; label: string }

interface PurchaseDelivery {
  id: number
  delivery_date: string
  delivered_quantity: number
  note?: string | null
  stock_location_id?: string | null
  stock_location_name?: string | null
  packet_id?: string | null
  is_stocked?: boolean
  labels_queued_at?: string | null
  stocked_at?: string | null
  received_by_name?: string | null
  stocked_by_name?: string | null
}

interface PurchaseItem {
  id: number
  item_type: PurchaseItemType
  component_id?: string | null
  component_name?: string | null
  supplier_relation_id?: string | null
  supplier_relation_symbol?: string | null
  symbol?: string | null
  name?: string | null
  description?: string | null
  requested_quantity: number
  quantity: number
  package_size: number
  unit_price_original?: string | number | null
  unit_price_converted?: string | number | null
  delivered_quantity: number
  stocked_quantity: number
  is_fully_delivered: boolean
  stock_location_id?: string | null
  stock_location_name?: string | null
  deliveries?: PurchaseDelivery[]
}

interface Purchase {
  id: string
  supplier: Supplier
  status: PurchaseStatus
  currency?: string | null
  total_price_original?: string | number | null
  total_price_original_vat?: string | number | null
  total_price_converted?: string | number | null
  export_mode: PurchaseExportMode
  note?: string | null
  delivery_date?: string | null
  stocked_date?: string | null
  closed_at?: string | null
  exported_at?: string | null
  receiving_started_at?: string | null
  stocking_started_at?: string | null
  completed_at?: string | null
  created_at: string
  created_by_name?: string | null
  items_count: number
  items?: PurchaseItem[]
}

interface PurchaseRequest {
  id: string
  component_id?: string | null
  component_name?: string | null
  quantity: number
  description?: string | null
  mfpn?: string | null
  matching_supplier_relation_id?: string | null
}

interface PrintQueueOption {
  id: string
  name: string
  is_default?: boolean
}

interface ComponentSummary {
  id: string
  name: string
}

interface PaginatedComponents {
  results: ComponentSummary[]
}

interface ComponentSupplierRelation {
  id: string
  supplier?: Supplier | null
  symbol?: string | null
}

interface ComponentWithSuppliers {
  id: string
  name: string
  suppliers?: ComponentSupplierRelation[]
}

interface PaginatedResponse<T> {
  results: T[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

interface ItemDraft {
  requestedQuantity: string
  quantity: string
  packageSize: string
  unitPriceOriginal: string
  unitPriceConverted: string
  description: string
  name: string
  symbol: string
}

const statusLabel: Record<PurchaseStatus, string> = {
  draft: "Draft",
  items_defined: "Items defined",
  priced: "Priced",
  closed: "Closed",
  exported: "Exported",
  receiving: "Receiving",
  stocking: "Stocking",
  completed: "Completed",
}

const statusBadgeClass: Record<PurchaseStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  items_defined: "bg-sky-100 text-sky-700",
  priced: "bg-indigo-100 text-indigo-700",
  closed: "bg-amber-100 text-amber-700",
  exported: "bg-violet-100 text-violet-700",
  receiving: "bg-emerald-100 text-emerald-700",
  stocking: "bg-teal-100 text-teal-700",
  completed: "bg-green-100 text-green-700",
}

const transitionByStatus: Partial<Record<PurchaseStatus, { target: PurchaseStatus; label: string }>> = {
  draft: { target: "items_defined", label: "Mark items defined" },
  items_defined: { target: "priced", label: "Mark priced" },
  priced: { target: "closed", label: "Close order" },
  closed: { target: "exported", label: "Mark exported" },
  exported: { target: "receiving", label: "Start receiving" },
}

/** Keep only nodes that can store items or have storable descendants (preserves tree for display). */
function filterTreeToStorable(nodes: LocationNode[]): LocationNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children?.length ? filterTreeToStorable(node.children) : undefined,
    }))
    .filter((node) => node.can_store_items === true || (node.children && node.children.length > 0))
}

const asList = <T,>(data: T[] | PaginatedResponse<T> | undefined): T[] => {
  if (!data) {
    return []
  }
  return Array.isArray(data) ? data : data.results || []
}

const toText = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return ""
  }
  return String(value)
}

const toInteger = (value: string, fallback = 0): number => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const toDecimalOrNull = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return trimmed
}

const formatAmount = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined || value === "") {
    return "-"
  }
  const num = Number(value)
  if (!Number.isFinite(num)) {
    return String(value)
  }
  return num.toFixed(2)
}

const shortId = (id: string): string => id.slice(0, 8)

/** Extract user-facing message from API or generic error for toast. */
function errorMessage(error: unknown, fallback: string): string {
  const api = error as ApiError
  if (api?.data != null) {
    if (typeof api.data === "string") {
      const s = api.data.trim()
      if (s) return s
    }
    if (typeof api.data === "object" && "detail" in api.data) {
      const d = (api.data as { detail?: string | string[] }).detail
      if (Array.isArray(d) && d[0]) return String(d[0])
      if (typeof d === "string") return d
    }
    const obj = api.data as Record<string, unknown>
    for (const v of Object.values(obj)) {
      if (typeof v === "string") return v
      if (Array.isArray(v) && v[0] != null && typeof v[0] === "string") return v[0]
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

const createItemDraft = (item: PurchaseItem): ItemDraft => ({
  requestedQuantity: String(item.requested_quantity ?? 0),
  quantity: String(item.quantity ?? 0),
  packageSize: String(item.package_size ?? 1),
  unitPriceOriginal: toText(item.unit_price_original),
  unitPriceConverted: toText(item.unit_price_converted),
  description: item.description || "",
  name: item.name || "",
  symbol: item.symbol || "",
})

const compactCellInput =
  "h-7 w-full border-0 border-b border-transparent bg-transparent px-0 text-xs " +
  "focus:border-border focus:ring-0 focus-visible:outline-none";

interface ReceiveActionResponse extends Purchase {
  created_packets?: Array<{
    id: string
    component_id: string
    location_id?: string | null
  }>
  queued_labels?: number
  print_list_id?: string | null
}

interface StockActionResponse extends Purchase {
  stocked_deliveries?: number
}

export function PurchaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [metaForm, setMetaForm] = useState({
    currency: "",
    note: "",
    exportMode: "list" as PurchaseExportMode,
  })

  const [itemDrafts, setItemDrafts] = useState<Record<number, ItemDraft>>({})
  const [receiveQtyByItem, setReceiveQtyByItem] = useState<Record<number, string>>({})
  const [receiveLocationByItem, setReceiveLocationByItem] = useState<Record<number, string>>({})
  const [receiveNote, setReceiveNote] = useState("")
  const [receiveQueueLabels, setReceiveQueueLabels] = useState(false)
  const [selectedPrintListId, setSelectedPrintListId] = useState("")
  const [stockConfirmByDelivery, setStockConfirmByDelivery] = useState<Record<number, boolean>>({})

  const [addComponentOpen, setAddComponentOpen] = useState(false)
  const [addComponentTab, setAddComponentTab] = useState<"request" | "stock" | "non_stock">("request")
  const [selectedRequestId, setSelectedRequestId] = useState("")
  const [stockComponentId, setStockComponentId] = useState("")
  const [stockRelationId, setStockRelationId] = useState("")
  const [manualItemForm, setManualItemForm] = useState({
    name: "",
    symbol: "",
    quantity: "1",
    unitPrice: "",
    description: "",
  })

  const { data: me } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: purchaseDetail, isLoading: purchaseDetailLoading } = useQuery<Purchase>({
    queryKey: ["purchase", id],
    queryFn: () => apiFetch<Purchase>(`/api/v1/store/purchase/${id}/`),
    enabled: Boolean(id),
  })

  const { data: requestData } = useQuery<PurchaseRequest[] | PaginatedResponse<PurchaseRequest>>({
    queryKey: ["purchase-requests", "unassigned", purchaseDetail?.supplier?.id],
    queryFn: () =>
      apiFetch<PurchaseRequest[] | PaginatedResponse<PurchaseRequest>>(
        `/api/v1/store/purchase-requests/?page_size=1000&assigned=0&supplier=${purchaseDetail?.supplier?.id}`,
      ),
    enabled: Boolean(purchaseDetail?.supplier?.id),
  })

  const { data: locationsTreeData } = useQuery<LocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
    enabled: Boolean(id),
  })

  const { data: printQueuesData } = useQuery<PrintQueueOption[] | PaginatedResponse<PrintQueueOption>>({
    queryKey: ["print-queues"],
    queryFn: () => apiFetch<PrintQueueOption[] | PaginatedResponse<PrintQueueOption>>("/api/v1/print/list/"),
    enabled: Boolean(id),
  })

  const availableRequests = asList(requestData)
  const locationsTreeForReceive = useMemo(
    () => filterTreeToStorable(locationsTreeData || []),
    [locationsTreeData],
  )
  const printQueues = asList(printQueuesData)

  const loadComponentOptions = useCallback(
    async (inputValue: string): Promise<SelectOption[]> => {
      const search = inputValue.trim()
      const params = new URLSearchParams()
      params.set("page_size", search ? "25" : "20")
      if (search) {
        params.set("search", search)
      }
      const data = await apiFetch<ComponentSummary[] | PaginatedComponents>(
        `/api/v1/store/components/?${params.toString()}`,
      )
      const list = Array.isArray(data) ? data : data?.results || []
      return list.map((c) => ({ value: c.id, label: c.name }))
    },
    [],
  )

  const loadComponentOptionsRequestIdRef = useRef(0)
  const loadComponentOptionsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadComponentOptionsAsync = useCallback(
    (inputValue: string): Promise<SelectOption[]> =>
      new Promise((resolve) => {
        if (loadComponentOptionsTimeoutRef.current) {
          clearTimeout(loadComponentOptionsTimeoutRef.current)
        }
        const requestId = ++loadComponentOptionsRequestIdRef.current
        loadComponentOptionsTimeoutRef.current = setTimeout(() => {
          loadComponentOptionsTimeoutRef.current = null
          loadComponentOptions(inputValue).then((options) => {
            if (requestId === loadComponentOptionsRequestIdRef.current) {
              resolve(options)
            }
          })
        }, 300)
      }),
    [loadComponentOptions],
  )

  const { data: stockComponentDetail } = useQuery<ComponentWithSuppliers>({
    queryKey: ["component-suppliers", stockComponentId],
    queryFn: () => apiFetch<ComponentWithSuppliers>(`/api/v1/store/component/${stockComponentId}/`),
    enabled: Boolean(stockComponentId),
  })

  const supplierRelationOptions = useMemo(
    () =>
      (stockComponentDetail?.suppliers || []).map((relation) => ({
        value: relation.id,
        label: `${relation.supplier?.name || "Supplier"} · ${relation.symbol || "no symbol"}`,
        symbol: relation.symbol,
      })),
    [stockComponentDetail?.suppliers],
  )

  const canEdit =
    Boolean(me?.is_superuser)
    || Boolean(
      me?.access_permissions?.some(
        (permission) =>
          permission.area === "warehouse-operations"
          && ["write", "admin"].includes(permission.level),
      ),
    )

  useEffect(() => {
    if (!purchaseDetail) {
      return
    }

    setMetaForm({
      currency: purchaseDetail.currency || "",
      note: purchaseDetail.note || "",
      exportMode: purchaseDetail.export_mode || "list",
    })

    const nextDrafts: Record<number, ItemDraft> = {}
    purchaseDetail.items?.forEach((item) => {
      nextDrafts[item.id] = createItemDraft(item)
    })
    setItemDrafts(nextDrafts)

    const nextLocation: Record<number, string> = {}
    const nextQty: Record<number, string> = {}
    purchaseDetail.items?.forEach((item) => {
      if (item.stock_location_id) {
        nextLocation[item.id] = item.stock_location_id
      }
      const remaining = Math.max(0, item.quantity - item.delivered_quantity)
      if (remaining > 0) {
        nextQty[item.id] = String(remaining)
      }
    })
    setReceiveLocationByItem(nextLocation)
    setReceiveQtyByItem(nextQty)
    setStockConfirmByDelivery({})
  }, [purchaseDetail?.id])

  useEffect(() => {
    if (!printQueues.length) {
      return
    }
    if (selectedPrintListId && printQueues.some((queue) => queue.id === selectedPrintListId)) {
      return
    }
    const defaultQueue = printQueues.find((queue) => queue.is_default) || printQueues[0]
    if (defaultQueue) {
      setSelectedPrintListId(defaultQueue.id)
    }
  }, [printQueues, selectedPrintListId])

  const invalidatePurchaseQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["purchases"] }),
      queryClient.invalidateQueries({ queryKey: ["purchase", id] }),
      queryClient.invalidateQueries({ queryKey: ["purchase-requests"] }),
    ])
  }

  const patchPurchaseMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (!id) {
        throw new Error("Purchase ID is missing.")
      }
      return apiFetch<Purchase>(`/api/v1/store/purchase/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
    },
  })

  const receiveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (!id) {
        throw new Error("Purchase ID is missing.")
      }
      return apiFetch<ReceiveActionResponse>(`/api/v1/store/purchase/${id}/receive/`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
  })

  const stockMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => {
      if (!id) {
        throw new Error("Purchase ID is missing.")
      }
      return apiFetch<StockActionResponse>(`/api/v1/store/purchase/${id}/stock/`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
  })

  const mutationBusy =
    patchPurchaseMutation.isPending
    || receiveMutation.isPending
    || stockMutation.isPending

  const handleSaveMeta = async () => {
    if (!id) {
      return
    }

    try {
      await patchPurchaseMutation.mutateAsync({
        currency: metaForm.currency.trim() || null,
        note: metaForm.note,
        export_mode: metaForm.exportMode,
      })
      await invalidatePurchaseQueries()
      toast.success("Purchase details updated.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update purchase details."))
    }
  }

  const setDraftValue = (itemId: number, patch: Partial<ItemDraft>) => {
    setItemDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {
          requestedQuantity: "0",
          quantity: "0",
          packageSize: "1",
          unitPriceOriginal: "",
          unitPriceConverted: "",
          description: "",
          name: "",
          symbol: "",
        }),
        ...patch,
      },
    }))
  }

  const getDraft = (item: PurchaseItem): ItemDraft => {
    return itemDrafts[item.id] || createItemDraft(item)
  }

  const handleSaveItem = async (item: PurchaseItem) => {
    if (!id) {
      return
    }

    const draft = getDraft(item)
    const requestedQty = toInteger(draft.requestedQuantity)
    const quantity = toInteger(draft.quantity)
    const packageSize = toInteger(draft.packageSize, 1)

    if (quantity <= 0) {
      toast.error("Quantity must be greater than zero.")
      return
    }

    if (packageSize <= 0) {
      toast.error("Package size must be greater than zero.")
      return
    }

    const payloadItem: Record<string, unknown> = {
      id: item.id,
      item_type: item.item_type,
      requested_quantity: requestedQty,
      quantity,
      package_size: packageSize,
      unit_price_original: toDecimalOrNull(draft.unitPriceOriginal),
      unit_price_converted: toDecimalOrNull(draft.unitPriceConverted),
      description: draft.description,
      symbol: draft.symbol.trim() || null,
    }

    if (item.item_type === "non_stock") {
      const itemName = draft.name.trim()
      if (!itemName) {
        toast.error("Non-stock item requires a name.")
        return
      }
      payloadItem.name = itemName
    }

    try {
      await patchPurchaseMutation.mutateAsync({ items: [payloadItem] })
      await invalidatePurchaseQueries()
      toast.success("Item updated.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update item."))
    }
  }

  const handleRemoveItem = async (itemId: number) => {
    if (!id) {
      return
    }

    try {
      await patchPurchaseMutation.mutateAsync({ remove_item_ids: [itemId] })
      await invalidatePurchaseQueries()
      toast.success("Item removed.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to remove item."))
    }
  }

  const handleAddFromRequest = async () => {
    if (!id) {
      return
    }
    if (!selectedRequestId) {
      toast.error("Select a request first.")
      return
    }

    const request = availableRequests.find((item) => item.id === selectedRequestId)
    if (!request) {
      toast.error("Selected request is not available.")
      return
    }
    if (!request.component_id || !request.matching_supplier_relation_id) {
      toast.error("Request has no matching supplier relation for this supplier.")
      return
    }

    try {
      await patchPurchaseMutation.mutateAsync({
        items: [
          {
            item_type: "component",
            component_id: request.component_id,
            supplier_relation_id: request.matching_supplier_relation_id,
            requested_quantity: request.quantity,
            quantity: request.quantity,
            package_size: 1,
            symbol: request.mfpn || request.component_name || "",
            description: request.description || "",
          },
        ],
        purchase_request_ids: [request.id],
      })
      await invalidatePurchaseQueries()
      setSelectedRequestId("")
      setAddComponentOpen(false)
      toast.success("Request added to purchase order.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add request item."))
    }
  }

  const handleAddManualItem = async () => {
    if (!id) {
      return
    }

    const name = manualItemForm.name.trim()
    const quantity = toInteger(manualItemForm.quantity, 0)
    if (!name) {
      toast.error("Item name is required.")
      return
    }
    if (quantity <= 0) {
      toast.error("Quantity must be greater than zero.")
      return
    }

    try {
      await patchPurchaseMutation.mutateAsync({
        items: [
          {
            item_type: "non_stock",
            name,
            quantity,
            requested_quantity: 0,
            package_size: 1,
            unit_price_original: toDecimalOrNull(manualItemForm.unitPrice),
            unit_price_converted: toDecimalOrNull(manualItemForm.unitPrice),
            description: manualItemForm.description,
            symbol: manualItemForm.symbol.trim() || name,
          },
        ],
      })
      await invalidatePurchaseQueries()
      setManualItemForm({ name: "", symbol: "", quantity: "1", unitPrice: "", description: "" })
      setAddComponentOpen(false)
      toast.success("Non-stock item added.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add non-stock item."))
    }
  }

  const handleAddStockComponent = async () => {
    if (!id || !stockComponentId || !stockRelationId) {
      return
    }

    const selectedRelation = supplierRelationOptions.find((option) => option.value === stockRelationId)

    try {
      await patchPurchaseMutation.mutateAsync({
        items: [
          {
            item_type: "component",
            component_id: stockComponentId,
            supplier_relation_id: stockRelationId,
            requested_quantity: 0,
            quantity: 1,
            package_size: 1,
            symbol: selectedRelation?.symbol || stockComponentDetail?.name || "",
            description: "",
          },
        ],
      })
      await invalidatePurchaseQueries()
      setStockComponentId("")
      setStockRelationId("")
      setAddComponentOpen(false)
      toast.success("Stock component added to purchase order.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add stock component."))
    }
  }

  const handleTransition = async (target: PurchaseStatus, successMessage: string) => {
    if (!id) {
      return
    }

    try {
      await patchPurchaseMutation.mutateAsync({ transition_to: target })
      await invalidatePurchaseQueries()
      toast.success(successMessage)
    } catch (error) {
      toast.error(errorMessage(error, "Failed to change purchase status."))
    }
  }

  const handleReceive = async () => {
    if (!id || !purchaseDetail?.items?.length) {
      return
    }

    const lines: Array<{
      purchase_item_id: number
      delivered_quantity: number
      note: string
      stock_location_id?: string
    }> = []

    for (const item of purchaseDetail.items) {
      const qty = toInteger(receiveQtyByItem[item.id] || "0", 0)
      if (qty <= 0) {
        continue
      }

      const line: {
        purchase_item_id: number
        delivered_quantity: number
        note: string
        stock_location_id?: string
      } = {
        purchase_item_id: item.id,
        delivered_quantity: qty,
        note: receiveNote.trim(),
      }

      if (item.item_type === "component") {
        const stockLocationId = receiveLocationByItem[item.id] || item.stock_location_id || ""
        if (!stockLocationId) {
          toast.error(`Select stock location for item ${item.component_name || item.symbol || item.id}.`)
          return
        }
        line.stock_location_id = stockLocationId
      }

      lines.push(line)
    }

    if (!lines.length) {
      toast.error("Enter delivered quantity for at least one item.")
      return
    }

    try {
      const response = await receiveMutation.mutateAsync({
        lines,
        queue_labels: receiveQueueLabels,
        print_list: receiveQueueLabels ? (selectedPrintListId || null) : null,
      })
      await invalidatePurchaseQueries()
      setReceiveQtyByItem({})
      setReceiveNote("")
      const packetCount = response.created_packets?.length || 0
      const labelsCount = response.queued_labels || 0
      toast.success(
        `Delivery received. ${packetCount} packets prepared${receiveQueueLabels ? ` and ${labelsCount} labels queued` : ""}.`,
      )
    } catch (error) {
      toast.error(errorMessage(error, "Failed to register delivery."))
    }
  }

  const handleStock = async () => {
    if (!id || !stockCandidates.length) {
      return
    }

    const lines = stockCandidates
      .filter(({ delivery }) => Boolean(stockConfirmByDelivery[delivery.id]))
      .map(({ delivery }) => ({
        purchase_delivery_id: delivery.id,
        confirm_stocked: true,
      }))

    if (!lines.length) {
      toast.error("Select at least one received line to confirm stocking.")
      return
    }

    try {
      const response = await stockMutation.mutateAsync({ lines })
      await invalidatePurchaseQueries()
      setStockConfirmByDelivery({})
      const confirmedCount = response.stocked_deliveries || lines.length
      toast.success(`Stocking confirmed for ${confirmedCount} delivery lines.`)
    } catch (error) {
      toast.error(errorMessage(error, "Failed to stock items."))
    }
  }

  const selectedTransition = purchaseDetail ? transitionByStatus[purchaseDetail.status] : null

  const receiveCandidates = useMemo(
    () =>
      (purchaseDetail?.items || []).filter(
        (item) => Math.max(0, item.quantity - item.delivered_quantity) > 0,
      ),
    [purchaseDetail?.items],
  )

  const stockCandidates = useMemo(
    () => {
      const rows: Array<{ item: PurchaseItem; delivery: PurchaseDelivery }> = []
      for (const item of purchaseDetail?.items || []) {
        if (item.item_type !== "component") {
          continue
        }
        for (const delivery of item.deliveries || []) {
          if (!delivery.is_stocked) {
            rows.push({ item, delivery })
          }
        }
      }
      return rows
    },
    [purchaseDetail?.items],
  )

  const openRequestOptions = useMemo(() => {
    const existingRequestKeys = new Set(
      (purchaseDetail?.items || [])
        .filter((item) => item.component_id && item.supplier_relation_id)
        .map((item) => `${item.component_id}:${item.supplier_relation_id}`),
    )

    return availableRequests.filter((request) => {
      if (!request.component_id || !request.matching_supplier_relation_id) {
        return true
      }
      return !existingRequestKeys.has(`${request.component_id}:${request.matching_supplier_relation_id}`)
    })
  }, [availableRequests, purchaseDetail?.items])

  const requestSelectOptions = useMemo<SelectOption[]>(
    () =>
      openRequestOptions.map((request) => ({
        value: request.id,
        label: `${request.component_name || "Unknown item"} · qty ${request.quantity}`,
      })),
    [openRequestOptions],
  )

  const missingQueueSelection = receiveQueueLabels && !selectedPrintListId
  const selectedStockConfirmCount = stockCandidates.filter(
    ({ delivery }) => Boolean(stockConfirmByDelivery[delivery.id]),
  ).length

  if (!id) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <p className="text-sm text-muted-foreground">Purchase ID is missing.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate("/store/purchase")}
            className="mb-1 text-xs font-medium text-primary hover:underline"
          >
            ← Back to purchases
          </button>
          <h1 className="text-2xl font-semibold text-foreground">
            {purchaseDetail ? `Purchase #${shortId(purchaseDetail.id)}` : "Purchase details"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Full purchase workflow with items, receiving and stocking.
          </p>
        </div>
      </div>

      {purchaseDetailLoading ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : purchaseDetail ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-border/70 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{purchaseDetail.supplier?.name}</span>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass[purchaseDetail.status]}`}
              >
                {statusLabel[purchaseDetail.status]}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Created {new Date(purchaseDetail.created_at).toLocaleString()}
              {purchaseDetail.created_by_name ? ` by ${purchaseDetail.created_by_name}` : ""}
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Total without VAT</p>
                <p className="text-sm text-foreground">
                  {formatAmount(purchaseDetail.total_price_original)} {purchaseDetail.currency || ""}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Total with VAT</p>
                <p className="text-sm text-foreground">
                  {formatAmount(purchaseDetail.total_price_original_vat)} {purchaseDetail.currency || ""}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Converted total</p>
                <p className="text-sm text-foreground">{formatAmount(purchaseDetail.total_price_converted)}</p>
              </div>
            </div>

            {canEdit && (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedTransition && (
                  <Button
                    size="sm"
                    onClick={() =>
                      handleTransition(
                        selectedTransition.target,
                        `Status changed to ${statusLabel[selectedTransition.target]}.`,
                      )
                    }
                    disabled={mutationBusy}
                  >
                    {selectedTransition.label}
                  </Button>
                )}
                {(purchaseDetail.status === "receiving" || purchaseDetail.status === "stocking") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTransition("completed", "Purchase order completed.")}
                    disabled={mutationBusy}
                  >
                    Complete order
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/70 p-4">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Purchase settings</h3>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Currency</label>
                <Input
                  value={metaForm.currency}
                  onChange={(event) =>
                    setMetaForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                  disabled={!canEdit || mutationBusy}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Export mode</label>
                <select
                  value={metaForm.exportMode}
                  onChange={(event) =>
                    setMetaForm((prev) => ({ ...prev, exportMode: event.target.value as PurchaseExportMode }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={!canEdit || mutationBusy}
                >
                  <option value="list">Generic list</option>
                  <option value="supplier_csv">Supplier CSV</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Items count</label>
                <Input value={String(purchaseDetail.items_count || purchaseDetail.items?.length || 0)} disabled />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <label className="text-xs font-semibold uppercase text-muted-foreground">Note</label>
              <textarea
                value={metaForm.note}
                onChange={(event) => setMetaForm((prev) => ({ ...prev, note: event.target.value }))}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={!canEdit || mutationBusy}
              />
            </div>

            {canEdit && (
              <div className="mt-3">
                <Button size="sm" onClick={handleSaveMeta} disabled={mutationBusy}>
                  Save settings
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Items</h3>
              {purchaseDetail.items?.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    if (!id) return
                    try {
                      const cfg = getApiConfig()
                      const url = `${cfg.baseUrl}/api/v1/store/purchase/${id}/export-csv/`
                      const res = await fetch(url, {
                        headers: { Authorization: `Bearer ${cfg.getToken()}` },
                      })
                      if (!res.ok) throw new Error(res.statusText)
                      const blob = await res.blob()
                      const disp = res.headers.get("Content-Disposition")
                      const match = disp?.match(/filename="?([^";]+)"?/)
                      const filename = match?.[1] ?? `purchase-${id}-supplier.csv`
                      const a = document.createElement("a")
                      a.href = URL.createObjectURL(blob)
                      a.download = filename
                      a.click()
                      URL.revokeObjectURL(a.href)
                      toast.success("CSV downloaded.")
                    } catch (e) {
                      toast.error(errorMessage(e, "Failed to download CSV."))
                    }
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download CSV for supplier
                </Button>
              ) : null}
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
              <TooltipProvider>
              <Table className="w-full table-fixed">
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-border/50">
                    <TableHead className="h-9 w-[14%] min-w-0 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Item</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Item</p>
                          <p className="text-xs text-muted-foreground">Component or non-stock line: name, symbol, description and link to component.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[8%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Type</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Type</p>
                          <p className="text-xs text-muted-foreground">Component (from warehouse) or Non-stock (manual line).</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[7%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Req</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Requested quantity</p>
                          <p className="text-xs text-muted-foreground">Quantity originally requested for this order.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[7%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Qty</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Quantity</p>
                          <p className="text-xs text-muted-foreground">Ordered quantity (units) for this line.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[6%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Pkg</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Package size</p>
                          <p className="text-xs text-muted-foreground">Units per package (e.g. reel, box).</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Price</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Price</p>
                          <p className="text-xs text-muted-foreground">Unit price in original currency.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Conv.</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Converted price</p>
                          <p className="text-xs text-muted-foreground">Unit price converted to base currency.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[14%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Delivered / Stocked</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Delivered &amp; Stocked</p>
                          <p className="text-xs text-muted-foreground">Progress: red = not delivered, orange = delivered, green = stocked in warehouse.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="h-9 w-[6%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60">Actions</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold">Actions</p>
                          <p className="text-xs text-muted-foreground">Save row changes or remove this line.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseDetail.items?.length ? (
                    purchaseDetail.items.map((item) => {
                      const draft = getDraft(item)
                      return (
                        <TableRow key={item.id} className="border-border/40 align-top">
                          <TableCell className="min-w-0 px-3 py-2 align-top">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex min-w-0 items-baseline gap-1.5">
                                {item.item_type === "non_stock" ? (
                                  <input
                                    value={draft.name}
                                    onChange={(event) =>
                                      setDraftValue(item.id, { name: event.target.value })
                                    }
                                    placeholder="Item name"
                                    className="min-w-0 flex-1 truncate border-0 border-b border-transparent bg-transparent px-0 py-0 text-sm font-medium focus:border-border focus:outline-none disabled:border-transparent"
                                    disabled={!canEdit || mutationBusy}
                                  />
                                ) : (
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {item.component_name || `Item #${item.id}`}
                                  </span>
                                )}
                                {item.component_id && (
                                  <Link
                                    to={`/store/component/${item.component_id}${purchaseDetail?.supplier?.id ? `?supplier=${purchaseDetail.supplier.id}` : ""}`}
                                    className="shrink-0 inline-flex text-primary hover:opacity-80"
                                    aria-label="Open component"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Link>
                                )}
                              </div>
                              <input
                                value={draft.symbol}
                                onChange={(event) =>
                                  setDraftValue(item.id, { symbol: event.target.value })
                                }
                                placeholder="Supplier symbol"
                                className="w-full border-0 border-b border-transparent bg-transparent px-0 py-0 text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:border-border focus:outline-none disabled:border-transparent"
                                disabled={!canEdit || mutationBusy}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-3 text-xs text-muted-foreground">
                            {item.item_type === "component" ? "Component" : "Non-stock"}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              value={draft.requestedQuantity}
                              onChange={(event) =>
                                setDraftValue(item.id, { requestedQuantity: event.target.value })
                              }
                              className={`${compactCellInput} text-right`}
                              disabled={!canEdit || mutationBusy}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              value={draft.quantity}
                              onChange={(event) =>
                                setDraftValue(item.id, { quantity: event.target.value })
                              }
                              className={`${compactCellInput} text-right`}
                              disabled={!canEdit || mutationBusy}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              value={draft.packageSize}
                              onChange={(event) =>
                                setDraftValue(item.id, { packageSize: event.target.value })
                              }
                              className={`${compactCellInput} text-right`}
                              disabled={!canEdit || mutationBusy}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={draft.unitPriceOriginal}
                              onChange={(event) =>
                                setDraftValue(item.id, { unitPriceOriginal: event.target.value })
                              }
                              className={`${compactCellInput} text-right`}
                              disabled={!canEdit || mutationBusy}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={draft.unitPriceConverted}
                              onChange={(event) =>
                                setDraftValue(item.id, { unitPriceConverted: event.target.value })
                              }
                              className={`${compactCellInput} text-right`}
                              disabled={!canEdit || mutationBusy}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-2 text-xs">
                            <div className="space-y-1.5">
                              <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                                <span>Delivered {item.delivered_quantity} / {item.quantity}</span>
                                <span>Stocked {item.stocked_quantity} / {item.delivered_quantity}</span>
                              </div>
                              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                                {(() => {
                                  const q = Math.max(1, item.quantity)
                                  const notDelivered = (q - item.delivered_quantity) / q
                                  const deliveredNotStocked = (item.delivered_quantity - item.stocked_quantity) / q
                                  const stocked = item.stocked_quantity / q
                                  return (
                                    <>
                                      {notDelivered > 0 && (
                                        <div
                                          className="h-full bg-red-500"
                                          style={{ width: `${notDelivered * 100}%` }}
                                        />
                                      )}
                                      {deliveredNotStocked > 0 && (
                                        <div
                                          className="h-full bg-amber-500"
                                          style={{ width: `${deliveredNotStocked * 100}%` }}
                                        />
                                      )}
                                      {stocked > 0 && (
                                        <div
                                          className="h-full bg-emerald-500"
                                          style={{ width: `${stocked * 100}%` }}
                                        />
                                      )}
                                    </>
                                  )
                                })()}
                              </div>
                              {item.stock_location_name ? (
                                <p className="text-[11px] text-muted-foreground">{item.stock_location_name}</p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            {canEdit && (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleSaveItem(item)}
                                  disabled={mutationBusy}
                                  aria-label="Save row"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveItem(item.id)}
                                  disabled={mutationBusy}
                                  aria-label="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow className="border-border/40">
                      <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                        No items in this purchase order.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </TooltipProvider>
            </div>

                {canEdit && (
                  <div className="mt-4">
                    <Dialog open={addComponentOpen} onOpenChange={setAddComponentOpen}>
                      <DialogTrigger asChild>
                        <Button>Add component</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add component</DialogTitle>
                        </DialogHeader>
                        <div className="border-b border-border">
                          <nav className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setAddComponentTab("request")}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${
                                addComponentTab === "request"
                                  ? "border-b-2 border-primary text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Request
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddComponentTab("stock")}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${
                                addComponentTab === "stock"
                                  ? "border-b-2 border-primary text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Stock
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddComponentTab("non_stock")}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${
                                addComponentTab === "non_stock"
                                  ? "border-b-2 border-primary text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Non-stock
                            </button>
                          </nav>
                        </div>
                        <div className="min-h-[200px]">
                          {addComponentTab === "request" && (
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Only unassigned requests matching this supplier are listed.
                              </p>
                              <div className="mt-3 space-y-2">
                                <Select<SelectOption>
                                  options={requestSelectOptions}
                                  value={
                                    requestSelectOptions.find((opt) => opt.value === selectedRequestId) || null
                                  }
                                  onChange={(option: SingleValue<SelectOption>) =>
                                    setSelectedRequestId(option?.value ?? "")
                                  }
                                  placeholder="Select request"
                                  classNamePrefix="rs"
                                  isSearchable
                                  styles={addComponentSelectStyles}
                                  isDisabled={mutationBusy}
                                  menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                                  menuPosition="fixed"
                                />
                                {(() => {
                                  const selectedRequest = openRequestOptions.find(
                                    (request) => request.id === selectedRequestId,
                                  )
                                  if (!selectedRequest) return null
                                  return (
                                    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-semibold text-foreground">
                                          {selectedRequest.component_name || "Unknown component"}
                                        </span>
                                        <span className="text-muted-foreground">
                                          MFPN: {selectedRequest.mfpn || "—"}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                })()}
                                <Button
                                  size="sm"
                                  className="mt-2"
                                  onClick={handleAddFromRequest}
                                  disabled={mutationBusy}
                                >
                                  Add request item
                                </Button>
                              </div>
                            </div>
                          )}
                          {addComponentTab === "stock" && (
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Select NexIntranet component and supplier relation (symbol).
                              </p>
                              <div className="mt-3 space-y-2">
                                <label className="text-xs font-semibold uppercase text-muted-foreground">
                                  Component *
                                </label>
                                <AsyncSelect<SelectOption>
                                  loadOptions={loadComponentOptionsAsync}
                                  defaultOptions={true}
                                  value={
                                    stockComponentId
                                      ? {
                                          value: stockComponentId,
                                          label:
                                            stockComponentDetail?.name ?? stockComponentId,
                                        }
                                      : null
                                  }
                                  onChange={(option: SingleValue<SelectOption>) => {
                                    setStockComponentId(option?.value || "")
                                    setStockRelationId("")
                                  }}
                                  placeholder="Search by name or paste component ID"
                                  classNamePrefix="rs"
                                  isSearchable
                                  styles={addComponentSelectStyles}
                                  isDisabled={mutationBusy}
                                  menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                                  menuPosition="fixed"
                                />
                              </div>
                              {stockComponentId && (
                                <div className="mt-3 space-y-2">
                                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                                    Supplier &amp; symbol *
                                  </label>
                                  <Select<SelectOption>
                                    options={supplierRelationOptions}
                                    value={
                                      supplierRelationOptions.find(
                                        (option) => option.value === stockRelationId,
                                      ) || null
                                    }
                                    onChange={(option) => setStockRelationId(option?.value || "")}
                                    placeholder="Select supplier with symbol"
                                    classNamePrefix="rs"
                                    isSearchable
                                    styles={addComponentSelectStyles}
                                    isDisabled={mutationBusy}
                                    menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                                    menuPosition="fixed"
                                  />
                                </div>
                              )}
                              {stockComponentId && stockRelationId && (
                                <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold text-foreground">
                                      {stockComponentDetail?.name || "Selected component"}
                                    </span>
                                    {(() => {
                                      const selectedRelation = supplierRelationOptions.find(
                                        (option) => option.value === stockRelationId,
                                      )
                                      return (
                                        <span className="text-muted-foreground">
                                          MFPN: {selectedRelation?.symbol || "—"}
                                        </span>
                                      )
                                    })()}
                                  </div>
                                </div>
                              )}
                              <Button
                                size="sm"
                                className="mt-3"
                                onClick={handleAddStockComponent}
                                disabled={!stockComponentId || !stockRelationId || mutationBusy}
                              >
                                Add stock item
                              </Button>
                            </div>
                          )}
                          {addComponentTab === "non_stock" && (
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Use for shipping, fees, or other non-stock costs.
                              </p>
                              <div className="mt-3 space-y-2">
                                <label className="text-xs font-semibold uppercase text-muted-foreground">
                                  NexIntranet name *
                                </label>
                                <Input
                                  value={manualItemForm.name}
                                  onChange={(event) =>
                                    setManualItemForm((prev) => ({ ...prev, name: event.target.value }))
                                  }
                                  placeholder="Internal component name"
                                  disabled={mutationBusy}
                                />
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                                    MFPN / symbol
                                  </label>
                                  <Input
                                    value={manualItemForm.symbol}
                                    onChange={(event) =>
                                      setManualItemForm((prev) => ({ ...prev, symbol: event.target.value }))
                                    }
                                    placeholder="Manufacturer part number"
                                    disabled={mutationBusy}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                                    Quantity
                                  </label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={manualItemForm.quantity}
                                    onChange={(event) =>
                                      setManualItemForm((prev) => ({ ...prev, quantity: event.target.value }))
                                    }
                                    placeholder="1"
                                    disabled={mutationBusy}
                                  />
                                </div>
                              </div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                                    Unit price
                                  </label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={manualItemForm.unitPrice}
                                    onChange={(event) =>
                                      setManualItemForm((prev) => ({ ...prev, unitPrice: event.target.value }))
                                    }
                                    placeholder="0.00"
                                    disabled={mutationBusy}
                                  />
                                </div>
                              </div>
                              <div className="mt-2 space-y-1">
                                <label className="text-xs font-semibold uppercase text-muted-foreground">
                                  Description
                                </label>
                                <textarea
                                  value={manualItemForm.description}
                                  onChange={(event) =>
                                    setManualItemForm((prev) => ({ ...prev, description: event.target.value }))
                                  }
                                  className="min-h-[56px] w-full border-0 border-b border-input/60 bg-transparent px-0 py-1 text-xs focus:border-border focus:outline-none"
                                  placeholder="Optional short note"
                                  disabled={mutationBusy}
                                />
                              </div>
                              <Button
                                size="sm"
                                className="mt-3"
                                onClick={handleAddManualItem}
                                disabled={mutationBusy}
                              >
                                Add non-stock item
                              </Button>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
          </div>

          {(purchaseDetail.status === "exported"
            || purchaseDetail.status === "receiving"
            || purchaseDetail.status === "stocking") && (
            <div className="rounded-lg border border-border/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">Receive goods</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Verify delivered quantities, assign stock location, and optionally queue labels.
              </p>

              <div className="mt-3 space-y-2">
                {receiveCandidates.length ? (
                  receiveCandidates.map((item) => {
                    const remaining = Math.max(0, item.quantity - item.delivered_quantity)
                    const selectedLocation = receiveLocationByItem[item.id] || item.stock_location_id || ""
                    return (
                      <div
                        key={`receive-${item.id}`}
                        className="rounded-md border border-border/60 p-2"
                      >
                        <div className="grid items-center gap-2 md:grid-cols-[1fr_110px]">
                          <div>
                            <p className="text-sm text-foreground">
                              {item.component_name || item.name || item.symbol || `Item #${item.id}`}
                            </p>
                            <p className="text-xs text-muted-foreground">Remaining to receive: {remaining}</p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={remaining}
                            value={receiveQtyByItem[item.id] || ""}
                            onChange={(event) =>
                              setReceiveQtyByItem((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            placeholder="0"
                            disabled={mutationBusy}
                          />
                        </div>
                        {item.item_type === "component" && (
                          <div className="mt-2">
                            <LocationParentSelect
                              locations={locationsTreeForReceive}
                              value={selectedLocation || null}
                              onChange={(value) =>
                                setReceiveLocationByItem((prev) => ({ ...prev, [item.id]: value ?? "" }))
                              }
                              placeholder="Select stock location"
                              emptyLabel="Select stock location"
                              isDisabled={mutationBusy}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Everything is fully received.</p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={receiveQueueLabels}
                    onChange={(event) => setReceiveQueueLabels(event.target.checked)}
                    disabled={mutationBusy}
                  />
                  Queue labels for received component lines
                </label>
                {receiveQueueLabels && (
                  <select
                    value={selectedPrintListId}
                    onChange={(event) => setSelectedPrintListId(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={mutationBusy}
                  >
                    <option value="">Select print queue</option>
                    {printQueues.map((queue) => (
                      <option key={queue.id} value={queue.id}>
                        {queue.name}
                        {queue.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {missingQueueSelection && (
                  <p className="text-xs text-amber-600">Select print queue for label generation.</p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Receive note</label>
                <textarea
                  value={receiveNote}
                  onChange={(event) => setReceiveNote(event.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  placeholder="Optional note"
                  disabled={mutationBusy}
                />
              </div>

              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={handleReceive}
                  disabled={mutationBusy || !receiveCandidates.length || missingQueueSelection}
                >
                  Receive selected lines
                </Button>
              </div>
            </div>
          )}

          {(purchaseDetail.status === "receiving" || purchaseDetail.status === "stocking") && (
            <div className="rounded-lg border border-border/70 p-4">
              <h3 className="text-sm font-semibold text-foreground">Confirm stocking</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Check deliveries that are physically placed in warehouse and confirm completion.
              </p>

              <div className="mt-3 space-y-2">
                {stockCandidates.length ? (
                  stockCandidates.map(({ item, delivery }) => {
                    const isChecked = Boolean(stockConfirmByDelivery[delivery.id])

                    return (
                      <label
                        key={`stock-${delivery.id}`}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 p-2"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={isChecked}
                          onChange={(event) =>
                            setStockConfirmByDelivery((prev) => ({ ...prev, [delivery.id]: event.target.checked }))
                          }
                          disabled={mutationBusy}
                        />
                        <div>
                          <p className="text-sm text-foreground">
                            {item.component_name || item.symbol || `Item #${item.id}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Qty {delivery.delivered_quantity} received on{" "}
                            {new Date(delivery.delivery_date).toLocaleDateString()}
                          </p>
                          {delivery.stock_location_name && (
                            <p className="text-xs text-muted-foreground">Location: {delivery.stock_location_name}</p>
                          )}
                        </div>
                      </label>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">No received component deliveries pending confirmation.</p>
                )}
              </div>

              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={handleStock}
                  disabled={mutationBusy || !stockCandidates.length || selectedStockConfirmCount === 0}
                >
                  Confirm selected as stocked
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Purchase details are not available.</p>
      )}

      <Sheet open={false}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle />
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </div>
  )
}

