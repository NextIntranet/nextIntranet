import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import Select, { type SingleValue } from "react-select"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

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

interface LocationOption {
  id: string
  label: string
}

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

type SelectOption = {
  value: string
  label: string
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

const flattenLocationOptions = (nodes: LocationNode[]): LocationOption[] => {
  const out: LocationOption[] = []
  const walk = (items: LocationNode[]) => {
    items.forEach((item) => {
      if (item.can_store_items) {
        out.push({ id: item.id, label: item.full_path })
      }
      if (item.children?.length) {
        walk(item.children)
      }
    })
  }
  walk(nodes)
  return out
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

const errorMessage = (error: unknown, fallback: string): string => {
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

const getProgressBarColor = (ratio: number): string => {
  if (ratio >= 1) return "bg-emerald-500"
  if (ratio > 0) return "bg-amber-500"
  return "bg-muted-foreground/30"
}

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

export function PurchasesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [selectedRequestId, setSelectedRequestId] = useState("")

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

  const [createForm, setCreateForm] = useState({
    supplierId: "",
    currency: "",
    note: "",
    exportMode: "list" as PurchaseExportMode,
  })

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

  const { data: purchasesData, isLoading: purchasesLoading } = useQuery<
    Purchase[] | PaginatedResponse<Purchase>
  >({
    queryKey: ["purchases"],
    queryFn: () => apiFetch<Purchase[] | PaginatedResponse<Purchase>>("/api/v1/store/purchases/?page_size=1000"),
  })

  const { data: suppliersData } = useQuery<Supplier[] | PaginatedResponse<Supplier>>({
    queryKey: ["suppliers"],
    queryFn: () => apiFetch<Supplier[] | PaginatedResponse<Supplier>>("/api/v1/store/supplier/?page_size=1000"),
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

  const purchases = asList(purchasesData)
  const suppliers = asList(suppliersData)
  const availableRequests = asList(requestData)
  const locationOptions = useMemo(
    () => flattenLocationOptions(locationsTreeData || []),
    [locationsTreeData],
  )
  const printQueues = asList(printQueuesData)

  const { data: componentsData } = useQuery<ComponentSummary[] | PaginatedComponents>({
    queryKey: ["components"],
    queryFn: () => apiFetch<ComponentSummary[] | PaginatedComponents>("/api/v1/store/components/?page_size=1000"),
  })

  const components = useMemo(
    () => (Array.isArray(componentsData) ? componentsData : componentsData?.results || []),
    [componentsData],
  )

  const componentOptions = useMemo(
    () => components.map((component) => ({ value: component.id, label: component.name })),
    [components],
  )

  const supplierOptions = useMemo<SelectOption[]>(
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    [suppliers],
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
    purchaseDetail.items?.forEach((item) => {
      if (item.stock_location_id) {
        nextLocation[item.id] = item.stock_location_id
      }
    })
    setReceiveLocationByItem(nextLocation)

    setReceiveQtyByItem({})
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

  const createPurchaseMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<Purchase>("/api/v1/store/purchases/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  })

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
    createPurchaseMutation.isPending
    || patchPurchaseMutation.isPending
    || receiveMutation.isPending
    || stockMutation.isPending

  const handleOpenPurchase = (purchaseId: string) => {
    navigate(`/store/purchase/${purchaseId}`)
  }

  const handleCloseDetail = () => {
    navigate("/store/purchase", { replace: true })
  }

  const handleCreatePurchase = async () => {
    if (!createForm.supplierId) {
      toast.error("Select a supplier.")
      return
    }

    try {
      const created = await createPurchaseMutation.mutateAsync({
        supplier_id: createForm.supplierId,
        currency: createForm.currency.trim() || null,
        note: createForm.note.trim() || "",
        export_mode: createForm.exportMode,
      })
      await queryClient.invalidateQueries({ queryKey: ["purchases"] })
      setCreateSheetOpen(false)
      setCreateForm({ supplierId: "", currency: "", note: "", exportMode: "list" })
      navigate(`/store/purchase/${created.id}`)
      toast.success("Purchase order created.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to create purchase order."))
    }
  }

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
      toast.success("Non-stock item added.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add non-stock item."))
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
  const missingQueueSelection = receiveQueueLabels && !selectedPrintListId
  const selectedStockConfirmCount = stockCandidates.filter(
    ({ delivery }) => Boolean(stockConfirmByDelivery[delivery.id]),
  ).length

  const [stockComponentId, setStockComponentId] = useState("")
  const [stockRelationId, setStockRelationId] = useState("")

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

  const handleAddStockComponent = async () => {
    if (!id || !stockComponentId || !stockRelationId) {
      return
    }

    const selectedRelation = supplierRelationOptions.find((option) => option.value === stockRelationId)
    const selectedComponent = components.find((component) => component.id === stockComponentId)

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
            symbol: selectedRelation?.symbol || selectedComponent?.name || "",
            description: "",
          },
        ],
      })
      await invalidatePurchaseQueries()
      setStockComponentId("")
      setStockRelationId("")
      toast.success("Stock component added to purchase order.")
    } catch (error) {
      toast.error(errorMessage(error, "Failed to add stock component."))
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Purchase orders</h1>
          <p className="text-sm text-muted-foreground">
            Manage supplier purchase workflow from request to receiving and stocking.
          </p>
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={() => setCreateSheetOpen(true)}>
            <Plus className="h-4 w-4" />
            New Purchase
          </Button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
        <Table className="w-full table-fixed">
          <TableHeader className="bg-muted/40">
            <TableRow className="border-border/50">
              <TableHead className="h-9 w-[16%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Order
              </TableHead>
              <TableHead className="h-9 w-[22%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Supplier
              </TableHead>
              <TableHead className="h-9 w-[14%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Items
              </TableHead>
              <TableHead className="h-9 w-[18%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Total
              </TableHead>
              <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Created
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchasesLoading ? (
              <TableRow className="border-border/40">
                <TableCell colSpan={6} className="py-8">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                </TableCell>
              </TableRow>
            ) : purchases.length ? (
              purchases.map((purchase) => (
                <TableRow key={purchase.id} className="border-border/40">
                  <TableCell className="h-9 px-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-start px-2 font-normal text-primary hover:underline"
                      onClick={() => handleOpenPurchase(purchase.id)}
                    >
                      #{shortId(purchase.id)}
                    </Button>
                  </TableCell>
                  <TableCell className="h-9 px-3 text-sm text-foreground">
                    {purchase.supplier?.name || "-"}
                  </TableCell>
                  <TableCell className="h-9 px-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass[purchase.status]}`}
                    >
                      {statusLabel[purchase.status]}
                    </span>
                  </TableCell>
                  <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                    {purchase.items_count}
                  </TableCell>
                  <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                    {formatAmount(purchase.total_price_original_vat)} {purchase.currency || ""}
                  </TableCell>
                  <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                    {new Date(purchase.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className="border-border/40">
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No purchase orders found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>Create purchase order</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Supplier *</label>
              <Select
                options={supplierOptions}
                value={supplierOptions.find((option) => option.value === createForm.supplierId) || null}
                onChange={(option: SingleValue<SelectOption>) =>
                  setCreateForm((prev) => ({ ...prev, supplierId: option?.value || "" }))
                }
                placeholder="Select supplier"
                classNamePrefix="rs"
                isSearchable
                styles={{
                  control: (base) => ({
                    ...base,
                    backgroundColor: "hsl(var(--background))",
                    borderColor: "hsl(var(--border))",
                    "&:hover": { borderColor: "hsl(var(--border))" },
                  }),
                  menu: (base) => ({
                    ...base,
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                  }),
                  option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isFocused
                      ? "hsl(var(--muted))"
                      : "hsl(var(--background))",
                    color: "hsl(var(--foreground))",
                  }),
                  singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
                  input: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Currency</label>
                <Input
                  value={createForm.currency}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, currency: event.target.value }))
                  }
                  placeholder="EUR"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Export mode</label>
                <select
                  value={createForm.exportMode}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, exportMode: event.target.value as PurchaseExportMode }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="list">Generic list</option>
                  <option value="supplier_csv">Supplier CSV</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Note</label>
              <textarea
                value={createForm.note}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, note: event.target.value }))
                }
                className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Internal purchase note"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setCreateSheetOpen(false)}
                disabled={mutationBusy}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreatePurchase}
                disabled={mutationBusy}
              >
                {createPurchaseMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(id)} onOpenChange={(open) => (!open ? handleCloseDetail() : null)}>
        <SheetContent side="right" className="w-full max-w-[980px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {purchaseDetail ? `Purchase #${shortId(purchaseDetail.id)}` : "Purchase details"}
            </SheetTitle>
          </SheetHeader>

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
                          handleTransition(selectedTransition.target, `Status changed to ${statusLabel[selectedTransition.target]}.`)
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
                <h3 className="text-sm font-semibold text-foreground">Items</h3>

                <div className="mt-3 overflow-hidden rounded-lg border border-border/70">
                  <Table className="w-full table-fixed">
                    <TableHeader className="bg-muted/40">
                      <TableRow className="border-border/50">
                        <TableHead className="h-9 w-[20%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Item
                        </TableHead>
                        <TableHead className="h-9 w-[10%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Type
                        </TableHead>
                        <TableHead className="h-9 w-[8%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Req
                        </TableHead>
                        <TableHead className="h-9 w-[8%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Qty
                        </TableHead>
                        <TableHead className="h-9 w-[8%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Pkg
                        </TableHead>
                        <TableHead className="h-9 w-[11%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Price
                        </TableHead>
                        <TableHead className="h-9 w-[11%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Conv.
                        </TableHead>
                        <TableHead className="h-9 w-[12%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Delivered
                        </TableHead>
                        <TableHead className="h-9 w-[12%] px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Stocked
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseDetail.items?.length ? (
                        purchaseDetail.items.map((item) => {
                          const draft = getDraft(item)
                          const deliveredRatio = item.quantity > 0 ? item.delivered_quantity / item.quantity : 0
                          const deliveredPercent = Math.min(100, Math.max(0, deliveredRatio * 100))
                          const stockedBase = Math.max(1, item.delivered_quantity)
                          const stockedRatio = stockedBase > 0 ? item.stocked_quantity / stockedBase : 0
                          const stockedPercent = Math.min(100, Math.max(0, stockedRatio * 100))
                          return (
                            <TableRow key={item.id} className="border-border/40 align-top">
                              <TableCell className="px-3 py-3">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium text-foreground">
                                    {item.component_name || item.name || item.symbol || `Item #${item.id}`}
                                  </p>
                                  {item.component_id && (
                                    <Link
                                      to={`/store/component/${item.component_id}`}
                                      className="text-xs text-primary hover:underline"
                                    >
                                      Open component
                                    </Link>
                                  )}
                                  <input
                                    value={draft.symbol}
                                    onChange={(event) =>
                                      setDraftValue(item.id, { symbol: event.target.value })
                                    }
                                    placeholder="Symbol"
                                    className={compactCellInput}
                                    disabled={!canEdit || mutationBusy}
                                  />
                                  {item.item_type === "non_stock" && (
                                    <input
                                      value={draft.name}
                                      onChange={(event) =>
                                        setDraftValue(item.id, { name: event.target.value })
                                      }
                                      placeholder="Item name"
                                      className={compactCellInput}
                                      disabled={!canEdit || mutationBusy}
                                    />
                                  )}
                                  <textarea
                                    value={draft.description}
                                    onChange={(event) =>
                                      setDraftValue(item.id, { description: event.target.value })
                                    }
                                    className="min-h-[48px] w-full border-0 border-b border-input/60 bg-transparent px-0 py-1 text-xs focus:border-border focus:outline-none"
                                    placeholder="Description"
                                    disabled={!canEdit || mutationBusy}
                                  />
                                  {canEdit && (
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => handleSaveItem(item)}
                                        disabled={mutationBusy}
                                      >
                                        Save row
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRemoveItem(item.id)}
                                        disabled={mutationBusy}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  )}
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
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>Delivered</span>
                                    <span>
                                      {item.delivered_quantity} / {item.quantity}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-muted/70">
                                    <div
                                      className={`h-1.5 rounded-full ${getProgressBarColor(deliveredRatio)}`}
                                      style={{ width: `${deliveredPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-2 text-xs">
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>Stocked</span>
                                    <span>
                                      {item.stocked_quantity} / {item.delivered_quantity}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-muted/70">
                                    <div
                                      className={`h-1.5 rounded-full ${getProgressBarColor(stockedRatio)}`}
                                      style={{ width: `${stockedPercent}%` }}
                                    />
                                  </div>
                                  {item.stock_location_name ? (
                                    <p className="text-[11px] text-muted-foreground">{item.stock_location_name}</p>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow className="border-border/40">
                          <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                            No items in this purchase order.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {canEdit && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-md border border-border/70 p-3">
                      <h4 className="text-sm font-medium text-foreground">Add from request</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Only unassigned requests matching this supplier are listed.
                      </p>
                      <div className="mt-3 space-y-2">
                        <select
                          value={selectedRequestId}
                          onChange={(event) => setSelectedRequestId(event.target.value)}
                          className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                          disabled={mutationBusy}
                        >
                          <option value="">Select request</option>
                          {openRequestOptions.map((request) => (
                            <option key={request.id} value={request.id}>
                              {request.component_name || "Unknown item"} · qty {request.quantity}
                            </option>
                          ))}
                        </select>
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
                        <Button size="sm" className="mt-2" onClick={handleAddFromRequest} disabled={mutationBusy}>
                          Add request item
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-md border border-border/70 p-3">
                      <h4 className="text-sm font-medium text-foreground">Add stock component</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Select NexIntranet component and supplier relation (symbol).
                      </p>
                      <div className="mt-3 space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">
                          Component *
                        </label>
                        <Select
                          options={componentOptions}
                          value={componentOptions.find((option) => option.value === stockComponentId) || null}
                          onChange={(option: SingleValue<SelectOption>) => {
                            setStockComponentId(option?.value || "")
                            setStockRelationId("")
                          }}
                          placeholder="Select component"
                          classNamePrefix="rs"
                          isSearchable
                          styles={{
                            control: (base) => ({
                              ...base,
                              minHeight: 32,
                              backgroundColor: "hsl(var(--background))",
                              borderColor: "hsl(var(--border))",
                              "&:hover": { borderColor: "hsl(var(--border))" },
                            }),
                            menu: (base) => ({
                              ...base,
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                            }),
                            option: (base, state) => ({
                              ...base,
                              backgroundColor: state.isFocused
                                ? "hsl(var(--muted))"
                                : "hsl(var(--background))",
                              color: "hsl(var(--foreground))",
                            }),
                            singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
                            input: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
                          }}
                          isDisabled={mutationBusy}
                        />
                      </div>
                      {stockComponentId && (
                        <div className="mt-3 space-y-2">
                          <label className="text-xs font-semibold uppercase text-muted-foreground">
                            Supplier &amp; symbol *
                          </label>
                          <Select
                            options={supplierRelationOptions}
                            value={
                              supplierRelationOptions.find((option) => option.value === stockRelationId) || null
                            }
                            onChange={(option) => setStockRelationId(option?.value || "")}
                            placeholder="Select supplier with symbol"
                            classNamePrefix="rs"
                            isSearchable
                            styles={{
                              control: (base) => ({
                                ...base,
                                minHeight: 32,
                                backgroundColor: "hsl(var(--background))",
                                borderColor: "hsl(var(--border))",
                                "&:hover": { borderColor: "hsl(var(--border))" },
                              }),
                              menu: (base) => ({
                                ...base,
                                backgroundColor: "hsl(var(--background))",
                                border: "1px solid hsl(var(--border))",
                              }),
                              option: (base, state) => ({
                                ...base,
                                backgroundColor: state.isFocused
                                  ? "hsl(var(--muted))"
                                  : "hsl(var(--background))",
                                color: "hsl(var(--foreground))",
                              }),
                              singleValue: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
                              input: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
                            }}
                            isDisabled={mutationBusy}
                          />
                        </div>
                      )}
                      {stockComponentId && stockRelationId && (
                        <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-foreground">
                              {stockComponentDetail?.name
                                || components.find((component) => component.id === stockComponentId)?.name
                                || "Selected component"}
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

                    <div className="rounded-md border border-border/70 p-3">
                      <h4 className="text-sm font-medium text-foreground">Add non-stock item</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
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
                                <select
                                  value={selectedLocation}
                                  onChange={(event) =>
                                    setReceiveLocationByItem((prev) => ({ ...prev, [item.id]: event.target.value }))
                                  }
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  disabled={mutationBusy}
                                >
                                  <option value="">Select stock location</option>
                                  {locationOptions.map((location) => (
                                    <option key={location.id} value={location.id}>
                                      {location.label}
                                    </option>
                                  ))}
                                </select>
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
                                Qty {delivery.delivered_quantity} received on {new Date(delivery.delivery_date).toLocaleDateString()}
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
        </SheetContent>
      </Sheet>
    </div>
  )
}
