import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type ColumnDef,
  type Row as TanstackRow,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from "recharts"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"
import { setScannerCapture } from "@/lib/scannerCapture"
import { IDENTIFIER_SCHEME_OPTIONS } from "@/lib/identifierSchemes"
import {
  Image as ImageIcon,
  Building2,
  Home,
  Layers,
  Link2,
  AlertTriangle,
  Copy,
  CopyPlus,
  Check,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import Select, {
  type StylesConfig,
  type SingleValue,
  type MultiValue,
} from "react-select"
import CreatableSelect from "react-select/creatable"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ExtensionPoint } from "@/plugins/ExtensionPoint"
import { ActionButtonGroup, ActionIconButton } from "@/components/ActionButtonGroup"
import { DocumentActionsMenu } from "@/components/DocumentActionsMenu"
import { PrintActions } from "@/components/PrintActions"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { PriceLabel } from "@/components/PriceLabel"
import { PacketOperationSheet } from "@/components/PacketOperationSheet"

interface Category {
  id: string
  name: string
}

interface TagType {
  id: string
  name: string
}

interface ComponentPacket {
  id: string
  count: number
  itemValue?: number | null
  totalValue?: number | null
  price_source?: "fifo" | "internal" | "internal_missing" | "unknown" | null
  description: string
  created_at: string
  last_used_at?: string | null
  is_active?: boolean
  location?: {
    id: string
    full_path: string
  } | null
}

interface Location {
  id: string
  full_path: string
  can_store_items?: boolean
  name?: string
}

interface Supplier {
  id: string
  name: string
  website?: string | null
  api_plugin_instance?: string | null
}

interface SupplierRelation {
  id: string
  supplier?: Supplier | null
  symbol?: string | null
  description?: string | null
  custom_url?: string | null
  url?: string | null
  api_fetched_at?: string | null
  api_applied_at?: string | null
}

interface Document {
  id: string
  name?: string | null
  doc_type: string
  file_url?: string
  url?: string
  is_primary: boolean
  access_level: string
  created_at?: string
}

interface ParameterType {
  id: string
  name: string
  description?: string | null
  unit?: string | null
  value_type?: "text" | "number" | "bool"
  format_with_si_prefix?: boolean
}

interface ComponentParameter {
  id: string
  parameter_type?: ParameterType | string | null
  value?: string | null
  value_number?: string | null
  display_value?: string | null
  is_inherited?: boolean
}

interface ExternalIdentifier {
  id: string
  scheme: string
  identifier: string
}

interface Component {
  id: string
  name: string
  description: string
  primary_image_url?: string
  category?: Category
  tags?: TagType[]
  inventory_summary: {
    total_quantity: number
    home_quantity?: number | null
    reserved_quantity: number
    purchase_quantity: number
    purchase_requested_quantity?: number
    purchase_ordered_quantity?: number
  }
  internal_price?: number
  selling_price?: number
  currency?: string
  created_at: string
  last_modified_at?: string
  packets?: ComponentPacket[]
  documents?: Document[]
  suppliers?: SupplierRelation[]
  external_identifiers?: ExternalIdentifier[]
}

interface ComponentHistoryEntry {
  timestamp: string
  levels: Record<string, number>
  total: number
}

interface ComponentHistoryResponse {
  packets: Array<{ id: string; label: string }>
  history: ComponentHistoryEntry[]
}

interface UsedInManufacturing {
  bom_id: string
  bom_name: string
  product_id: string
  product_name: string
  status: string
  planned_date?: string | null
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type OptionType = { value: string; label: string }

type PaginatedResult<T> = { results: T[] }

interface ComponentUpdatePayload {
  name?: string
  description?: string
  internal_price?: number
  selling_price?: number
  category?: string
  tags?: string[]
}

const selectStyles: StylesConfig<OptionType, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "hsl(var(--background))",
    borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
    boxShadow: state.isFocused ? "0 0 0 2px hsl(var(--ring))" : base.boxShadow,
    ":hover": {
      borderColor: "hsl(var(--ring))",
    },
  }),
  menu: (base) => ({
    ...base,
    zIndex: 30,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "hsl(var(--accent))"
      : state.isFocused
        ? "hsl(var(--muted))"
        : "transparent",
    color: "hsl(var(--foreground))",
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: "hsl(var(--muted))",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
    ":hover": {
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--accent-foreground))",
    },
  }),
  placeholder: (base) => ({
    ...base,
    color: "hsl(var(--muted-foreground))",
  }),
  singleValue: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
  }),
}

export function ComponentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [editMode, setEditMode] = useState(false)
  const [editedData, setEditedData] = useState<Partial<Component>>({})
  const [isStackedHistory, setIsStackedHistory] = useState(true)
  const [packetSheetOpen, setPacketSheetOpen] = useState(false)
  const [operationSheetOpen, setOperationSheetOpen] = useState(false)
  const [operationPacketId, setOperationPacketId] = useState<string | null>(null)
  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false)
  const [documentSheetOpen, setDocumentSheetOpen] = useState(false)
  const [parameterSheetOpen, setParameterSheetOpen] = useState(false)
  const [supplierEditId, setSupplierEditId] = useState<string | null>(null)
  const [documentEditId, setDocumentEditId] = useState<string | null>(null)
  const [parameterEditId, setParameterEditId] = useState<string | null>(null)
  const [packetForm, setPacketForm] = useState({
    locationId: "",
    count: "",
    description: "",
    isActive: true,
  })
  const [supplierForm, setSupplierForm] = useState({
    supplierId: "",
    symbol: "",
    description: "",
    customUrl: "",
  })
  const [documentForm, setDocumentForm] = useState({
    name: "",
    docType: "undefined",
    accessLevel: "public",
    isPrimary: false,
    sourceType: "file",
    file: null as File | null,
    url: "",
  })
  const [parameterForm, setParameterForm] = useState({
    parameterTypeId: "",
    value: "",
  })
  const [identifierSheetOpen, setIdentifierSheetOpen] = useState(false)
  const [identifierForm, setIdentifierForm] = useState({
    scheme: "",
    identifier: "",
  })
  const identifierInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!identifierSheetOpen) return
    setScannerCapture((text) => {
      setIdentifierForm((prev) => ({ ...prev, identifier: text }))
    })
    return () => setScannerCapture(null)
  }, [identifierSheetOpen])

  useEffect(() => {
    if (!identifierSheetOpen) return
    const t = setTimeout(() => identifierInputRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [identifierSheetOpen])

  const normalizeBooleanValue = (value?: string | null): "true" | "false" | "" => {
    if (value == null) {
      return ""
    }
    const normalized = String(value).trim().toLowerCase()
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return "true"
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return "false"
    }
    return ""
  }
  const queryClient = useQueryClient()
  const highlightPacketId = searchParams.get("packet")
  const highlightSupplierId = searchParams.get("supplier")

  const { data: availableCategories } = useQuery<Category[] | { results: Category[] }>({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/api/v1/store/category/?page_size=1000"),
    enabled: editMode,
  })

  const { data: availableTags } = useQuery<TagType[] | { results: TagType[] }>({
    queryKey: ["tags"],
    queryFn: () => apiFetch<TagType[]>("/api/v1/store/tags/"),
    enabled: editMode,
  })

  const { data: availableLocations } = useQuery<Location[] | PaginatedResult<Location>>({
    queryKey: ["locations"],
    queryFn: () => apiFetch<Location[]>("/api/v1/store/locations/?page_size=1000"),
    enabled: packetSheetOpen,
  })

  const { data: componentParametersData } = useQuery<
    ComponentParameter[] | PaginatedResult<ComponentParameter>
  >({
    queryKey: ["component-parameters", id],
    queryFn: () =>
      apiFetch<ComponentParameter[] | PaginatedResult<ComponentParameter>>(
        `/api/v1/store/component/${id}/parameters/`,
      ),
    enabled: !!id,
  })

  const { data: parameterTypesData } = useQuery<
    ParameterType[] | PaginatedResult<ParameterType>
  >({
    queryKey: ["parameter-types"],
    queryFn: () =>
      apiFetch<ParameterType[] | PaginatedResult<ParameterType>>(
        "/api/v1/store/parameterTypes/?page_size=1000",
      ),
    enabled: parameterSheetOpen,
  })

  const { data: availableSuppliers } = useQuery<Supplier[] | PaginatedResult<Supplier>>({
    queryKey: ["suppliers"],
    queryFn: () => apiFetch<Supplier[]>("/api/v1/store/supplier/?page_size=1000"),
    enabled: supplierSheetOpen,
  })

  const { data: user } = useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/api/v1/me/"),
  })

  const { data: component, isLoading, error } = useQuery<Component>({
    queryKey: ["component", id],
    queryFn: () => apiFetch<Component>(`/api/v1/store/component/${id}/`),
    enabled: !!id,
  })

  const { data: historyData, isLoading: isHistoryLoading } = useQuery<ComponentHistoryResponse>({
    queryKey: ["component-history", id],
    queryFn: () => apiFetch<ComponentHistoryResponse>(`/api/v1/store/component/${id}/history/`),
    enabled: !!id,
  })

  const { data: usedInManufacturing = [] } = useQuery<UsedInManufacturing[]>({
    queryKey: ["component-used-in-manufacturing", id],
    queryFn: () =>
      apiFetch<UsedInManufacturing[]>(`/api/v1/production/productions/used-in/?component=${id}`),
    enabled: !!id,
  })

  type PurchaseRequestRow = {
    id: string
    component_id?: string | null
    component_name?: string | null
    quantity: number
    description?: string | null
    requested_by_name?: string | null
    purchase_id?: string | null
    created_at?: string | null
  }
  const { data: purchaseRequestsData } = useQuery<
    PurchaseRequestRow[] | { results: PurchaseRequestRow[] }
  >({
    queryKey: ["purchase-requests", "component", id],
    queryFn: () =>
      apiFetch<PurchaseRequestRow[] | { results: PurchaseRequestRow[] }>(
        `/api/v1/store/purchase-requests/?page_size=500&component=${id}`,
      ),
    enabled: !!id,
  })
  const purchaseRequestsList = useMemo(() => {
    const d = purchaseRequestsData
    if (!d) return []
    return Array.isArray(d) ? d : d.results || []
  }, [purchaseRequestsData])

  type ReservationRow = {
    id: string
    component_id: string
    quantity: number
    reserved_by?: string | null
    reservation_date?: string | null
  }
  const { data: reservationsData } = useQuery<
    ReservationRow[] | { results: ReservationRow[] }
  >({
    queryKey: ["reservations", "component", id],
    queryFn: () =>
      apiFetch<ReservationRow[] | { results: ReservationRow[] }>(
        `/api/v1/store/reservations/?page_size=500&component=${id}`,
      ),
    enabled: !!id,
  })
  const reservationsList = useMemo(() => {
    const d = reservationsData
    if (!d) return []
    return Array.isArray(d) ? d : d.results || []
  }, [reservationsData])

  const updateMutation = useMutation({
    mutationFn: (data: ComponentUpdatePayload) =>
      apiFetch(`/api/v1/store/component/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setEditMode(false)
      toast.success("Component saved.")
    },
    onError: () => {
      toast.error("Failed to save component.")
    },
  })

  const duplicateComponentMutation = useMutation({
    mutationFn: () =>
      apiFetch<Component>(`/api/v1/store/component/${id}/duplicate/`, {
        method: "POST",
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["components"] })
      toast.success("Component duplicated.")
      navigate(`/store/component/${created.id}`)
    },
    onError: () => {
      toast.error("Failed to duplicate component.")
    },
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<TagType>("/api/v1/store/tags/", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (newTag) => {
      queryClient.invalidateQueries({ queryKey: ["tags"] })
      const currentTags = editedData.tags || []
      setEditedData({ ...editedData, tags: [...currentTags, newTag] })
      toast.success("Tag created.")
    },
    onError: () => {
      toast.error("Failed to create tag.")
    },
  })

  const createPacketMutation = useMutation({
    mutationFn: (payload: {
      component: string
      location: string
      count: number
      description?: string
      is_active?: boolean
    }) =>
      apiFetch(`/api/v1/store/component/${id}/packet/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setPacketSheetOpen(false)
      setPacketForm({ locationId: "", count: "", description: "", isActive: true })
      toast.success("Packet created.")
    },
    onError: () => {
      toast.error("Failed to create packet.")
    },
  })

  const createSupplierRelationMutation = useMutation({
    mutationFn: (payload: {
      component: string
      supplier: string
      symbol?: string
      description?: string
      custom_url?: string
    }) =>
      apiFetch(`/api/v1/store/component/${id}/supplier/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setSupplierSheetOpen(false)
      setSupplierForm({ supplierId: "", symbol: "", description: "", customUrl: "" })
      toast.success("Supplier assigned.")
    },
    onError: () => {
      toast.error("Failed to assign supplier.")
    },
  })

  const updateSupplierRelationMutation = useMutation({
    mutationFn: (payload: {
      id: string
      supplier: string
      symbol?: string
      description?: string
      custom_url?: string
    }) =>
      apiFetch(`/api/v1/store/supplier/relation/${payload.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          supplier: payload.supplier,
          symbol: payload.symbol,
          description: payload.description,
          custom_url: payload.custom_url,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setSupplierSheetOpen(false)
      setSupplierEditId(null)
      setSupplierForm({ supplierId: "", symbol: "", description: "", customUrl: "" })
      toast.success("Supplier relation updated.")
    },
    onError: () => {
      toast.error("Failed to update supplier relation.")
    },
  })

  const syncSupplierRelationMutation = useMutation({
    mutationFn: (payload: { id: string }) =>
      apiFetch(`/api/v1/store/supplier/relation/${payload.id}/sync/`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      toast.success("Supplier data synced.")
    },
    onError: () => {
      toast.error("Failed to sync supplier data.")
    },
  })

  const applySupplierRelationMutation = useMutation({
    mutationFn: (payload: { id: string }) =>
      apiFetch(`/api/v1/store/supplier/relation/${payload.id}/apply/`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      queryClient.invalidateQueries({ queryKey: ["component-parameters", id] })
      toast.success("Supplier data applied.")
    },
    onError: () => {
      toast.error("Failed to apply supplier data.")
    },
  })

  const deleteSupplierRelationMutation = useMutation({
    mutationFn: (relationId: string) =>
      apiFetch(`/api/v1/store/supplier/relation/${relationId}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      toast.success("Supplier removed from component.")
    },
    onError: () => {
      toast.error("Failed to remove supplier.")
    },
  })

  const createIdentifierMutation = useMutation({
    mutationFn: (payload: { scheme: string; identifier: string }) =>
      apiFetch<ExternalIdentifier>(`/api/v1/store/component/${id}/identifiers/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setIdentifierSheetOpen(false)
      setIdentifierForm({ scheme: "", identifier: "" })
      toast.success("External identifier added.")
    },
    onError: () => {
      toast.error("Failed to add external identifier.")
    },
  })

  const deleteIdentifierMutation = useMutation({
    mutationFn: (identifierId: string) =>
      apiFetch(`/api/v1/store/component/${id}/identifiers/${identifierId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      toast.success("External identifier removed.")
    },
    onError: () => {
      toast.error("Failed to remove external identifier.")
    },
  })

  const createDocumentMutation = useMutation({
    mutationFn: (payload: FormData) =>
      apiFetch(`/api/v1/store/component/${id}/documents/`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setDocumentSheetOpen(false)
      setDocumentForm({
        name: "",
        docType: "undefined",
        accessLevel: "public",
        isPrimary: false,
        sourceType: "file",
        file: null,
        url: "",
      })
      toast.success("Document added.")
    },
    onError: () => {
      toast.error("Failed to add document.")
    },
  })

  const updateDocumentMutation = useMutation({
    mutationFn: (payload: { id: string; data: FormData }) => {
      const endpoint = component?.id
        ? `/api/v1/store/component/${component.id}/documents/${payload.id}/`
        : `/api/v1/store/documents/${payload.id}/`
      return apiFetch(endpoint, {
        method: "PATCH",
        body: payload.data,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setDocumentSheetOpen(false)
      setDocumentEditId(null)
      setDocumentForm({
        name: "",
        docType: "undefined",
        accessLevel: "public",
        isPrimary: false,
        sourceType: "file",
        file: null,
        url: "",
      })
      toast.success("Document updated.")
    },
    onError: () => {
      toast.error("Failed to update document.")
    },
  })

  const removeDocumentMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiFetch(`/api/v1/store/component/${id}/documents/${documentId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      toast.success("Document removed from component.")
    },
    onError: () => {
      toast.error("Failed to remove document from component.")
    },
  })

  const deleteDocumentCompletelyMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiFetch(`/api/v1/store/component/${id}/documents/${documentId}/?purge_file=1`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      toast.success("Document deleted completely.")
    },
    onError: () => {
      toast.error("Failed to delete document completely.")
    },
  })

  const createParameterMutation = useMutation({
    mutationFn: (payload: { component: string; parameter_type: string; value: string }) =>
      apiFetch("/api/v1/store/parameter/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component-parameters", id] })
      setParameterSheetOpen(false)
      setParameterForm({ parameterTypeId: "", value: "" })
      toast.success("Parameter added.")
    },
    onError: () => {
      toast.error("Failed to add parameter.")
    },
  })


  const updateParameterMutation = useMutation({
    mutationFn: (payload: { id: string; data: { parameter_type: string; value: string } }) =>
      apiFetch(`/api/v1/store/parameter/${payload.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component-parameters", id] })
      setParameterSheetOpen(false)
      setParameterEditId(null)
      setParameterForm({ parameterTypeId: "", value: "" })
      toast.success("Parameter updated.")
    },
    onError: () => {
      toast.error("Failed to update parameter.")
    },
  })

  const deleteParameterMutation = useMutation({
    mutationFn: (parameterId: string) =>
      apiFetch(`/api/v1/store/parameter/${parameterId}/`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component-parameters", id] })
      toast.success("Parameter removed.")
    },
    onError: () => {
      toast.error("Failed to remove parameter.")
    },
  })

  const canEdit =
    user?.is_superuser ||
    user?.access_permissions?.find(
      (p) => p.area === "warehouse" && ["write", "admin"].includes(p.level),
    )

  const handleEdit = () => {
    setEditedData({
      name: component?.name,
      description: component?.description,
      internal_price: component?.internal_price,
      selling_price: component?.selling_price,
      category: component?.category,
      tags: component?.tags,
    })
    setEditMode(true)
  }

  const handleSave = () => {
    const payload: ComponentUpdatePayload = {
      name: editedData.name,
      description: editedData.description,
      internal_price: editedData.internal_price,
      selling_price: editedData.selling_price,
      category: editedData.category?.id,
      tags: editedData.tags?.map((tag) => tag.id),
    }
    updateMutation.mutate(payload)
  }

  const handleCancel = () => {
    setEditMode(false)
    setEditedData({})
  }

  const openNewPacketSheet = () => {
    setPacketForm({
      locationId: defaultPacketLocationId,
      count: "",
      description: "",
      isActive: true,
    })
    setPacketSheetOpen(true)
  }

  const handleCreatePacket = () => {
    const countValue = packetForm.count.trim() === "" ? 0 : Number(packetForm.count)
    if (!id || !packetForm.locationId || Number.isNaN(countValue)) {
      return
    }
    createPacketMutation.mutate({
      component: id,
      location: packetForm.locationId,
      count: countValue,
      description: packetForm.description || undefined,
      is_active: packetForm.isActive,
    })
  }

  const handleCreateSupplierRelation = () => {
    if (!id || !supplierForm.supplierId) {
      return
    }
    createSupplierRelationMutation.mutate({
      component: id,
      supplier: supplierForm.supplierId,
      symbol: supplierForm.symbol || undefined,
      description: supplierForm.description || undefined,
      custom_url: supplierForm.customUrl || undefined,
    })
  }

  const handleSupplierEdit = (relation: SupplierRelation) => {
    setSupplierEditId(relation.id)
    setSupplierForm({
      supplierId: relation.supplier?.id || "",
      symbol: relation.symbol || "",
      description: relation.description || "",
      customUrl: relation.custom_url || "",
    })
    setSupplierSheetOpen(true)
  }

  const handleSaveSupplierRelation = () => {
    if (!supplierEditId || !supplierForm.supplierId) {
      return
    }
    updateSupplierRelationMutation.mutate({
      id: supplierEditId,
      supplier: supplierForm.supplierId,
      symbol: supplierForm.symbol || undefined,
      description: supplierForm.description || undefined,
      custom_url: supplierForm.customUrl || undefined,
    })
  }

  const handleRemoveSupplierRelation = (relation: SupplierRelation) => {
    const supplierName = relation.supplier?.name || "this supplier"
    if (!window.confirm(`Remove ${supplierName} from this component?`)) {
      return
    }
    deleteSupplierRelationMutation.mutate(relation.id)
  }

  const handleCreateDocument = () => {
    const hasFile = documentForm.sourceType === "file" && documentForm.file
    const hasUrl = documentForm.sourceType === "url" && documentForm.url.trim()
    if (!documentEditId && !hasFile && !hasUrl) {
      return
    }
    const payload = new FormData()
    if (documentForm.name.trim()) {
      payload.append("name", documentForm.name.trim())
    }
    payload.append("doc_type", documentForm.docType)
    payload.append("access_level", documentForm.accessLevel)
    const isPrimaryImage =
      documentForm.docType === "image" && documentForm.isPrimary
    if (documentEditId) {
      payload.append("is_primary", isPrimaryImage ? "true" : "false")
    } else if (isPrimaryImage) {
      payload.append("is_primary", "true")
    }
    if (component?.id) {
      payload.append("component", component.id)
    }
    if (documentForm.sourceType === "file" && documentForm.file) {
      payload.append("file", documentForm.file)
    }
    if (documentForm.sourceType === "url" && documentForm.url.trim()) {
      payload.append("url", documentForm.url.trim())
    }
    if (documentEditId) {
      updateDocumentMutation.mutate({ id: documentEditId, data: payload })
    } else {
      createDocumentMutation.mutate(payload)
    }
  }

  const handleDocumentEdit = (doc: Document) => {
    setDocumentEditId(doc.id)
    setDocumentForm({
      name: doc.name || "",
      docType: doc.doc_type,
      accessLevel: doc.access_level,
      isPrimary: doc.is_primary,
      sourceType: doc.url ? "url" : "file",
      file: null,
      url: doc.url || "",
    })
    setDocumentSheetOpen(true)
  }

  const documentActionsPending =
    removeDocumentMutation.isPending || deleteDocumentCompletelyMutation.isPending

  const handleRemoveDocument = (doc: Document) => {
    const label = doc.name || "this document"
    if (!window.confirm(`Remove "${label}" from this component?`)) {
      return
    }
    removeDocumentMutation.mutate(doc.id)
  }

  const handleDeleteDocumentCompletely = (doc: Document) => {
    const label = doc.name || "this document"
    if (
      !window.confirm(
        `Delete "${label}" completely? This removes the document and any stored file.`,
      )
    ) {
      return
    }
    deleteDocumentCompletelyMutation.mutate(doc.id)
  }

  const handleCreateParameter = () => {
    if (!id || !parameterForm.parameterTypeId.trim()) {
      return
    }
    const value = normalizeParameterValueForSubmit(
      parameterForm.parameterTypeId,
      parameterForm.value,
    )
    const payload = {
      component: id,
      parameter_type: parameterForm.parameterTypeId,
      value,
    }
    createParameterMutation.mutate(payload)
  }

  const handleParameterEdit = (parameter: ComponentParameter) => {
    const parameterTypeId =
      typeof parameter.parameter_type === "string"
        ? parameter.parameter_type
        : parameter.parameter_type?.id || ""
    setParameterEditId(parameter.id)
    const parameterType =
      typeof parameter.parameter_type === "string" ? null : parameter.parameter_type
    setParameterForm({
      parameterTypeId,
      value:
        parameterType?.value_type === "bool"
          ? normalizeBooleanValue(parameter.value) || "false"
          : parameter.value || "",
    })
    setParameterSheetOpen(true)
  }

  const handleSaveParameter = () => {
    if (!parameterEditId || !parameterForm.parameterTypeId.trim()) {
      return
    }
    const value = normalizeParameterValueForSubmit(
      parameterForm.parameterTypeId,
      parameterForm.value,
    )
    updateParameterMutation.mutate({
      id: parameterEditId,
      data: {
        parameter_type: parameterForm.parameterTypeId,
        value,
      },
    })
  }

  const handleDeleteParameter = (parameter: ComponentParameter) => {
    const parameterName =
      typeof parameter.parameter_type === "string"
        ? parameter.parameter_type
        : parameter.parameter_type?.name || "this parameter"
    if (!window.confirm(`Remove ${parameterName}?`)) {
      return
    }
    deleteParameterMutation.mutate(parameter.id)
  }

  const categoriesList = Array.isArray(availableCategories)
    ? availableCategories
    : availableCategories?.results || []
  const tagsList = Array.isArray(availableTags) ? availableTags : availableTags?.results || []
  const locationsList = Array.isArray(availableLocations)
    ? availableLocations
    : availableLocations?.results || []
  const parametersList = Array.isArray(componentParametersData)
    ? componentParametersData
    : componentParametersData?.results || []
  const parameterTypesList = Array.isArray(parameterTypesData)
    ? parameterTypesData
    : parameterTypesData?.results || []
  const suppliersList = Array.isArray(availableSuppliers)
    ? availableSuppliers
    : availableSuppliers?.results || []
  const selectedTags = editedData.tags || []
  const categoryOptions: OptionType[] = categoriesList.map((cat) => ({
    value: cat.id,
    label: cat.name,
  }))
  const categoryValue: SingleValue<OptionType> = editedData.category
    ? { value: editedData.category.id, label: editedData.category.name }
    : null
  const tagOptions: OptionType[] = tagsList.map((tag) => ({ value: tag.id, label: tag.name }))
  const selectedTagOptions: OptionType[] = selectedTags.map((tag) => ({
    value: tag.id,
    label: tag.name,
  }))
  const tagOptionsWithSelected = [
    ...tagOptions,
    ...selectedTagOptions.filter((opt) => !tagOptions.some((t) => t.value === opt.value)),
  ]
  const locationOptions: OptionType[] = locationsList
    .filter((location) => location.can_store_items !== false)
    .map((location) => ({
      value: location.id,
      label: location.full_path || location.name || location.id,
    }))
  const supplierOptions: OptionType[] = suppliersList.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
  }))
  const parameterTypeOptions: OptionType[] = parameterTypesList.map((type) => ({
    value: type.id,
    label: type.name,
  }))
  const selectedLocationOption = locationOptions.find(
    (option) => option.value === packetForm.locationId,
  )
  const selectedSupplierOption = supplierOptions.find(
    (option) => option.value === supplierForm.supplierId,
  )
  const selectedParameterTypeOption = parameterTypeOptions.find(
    (option) => option.value === parameterForm.parameterTypeId,
  )
  const selectedParameterType = parameterTypesList.find(
    (type) => type.id === parameterForm.parameterTypeId,
  )
  const isBooleanParameterType = selectedParameterType?.value_type === "bool"
  const normalizeParameterValueForSubmit = (parameterTypeId: string, rawValue: string) => {
    const parameterType = parameterTypesList.find((type) => type.id === parameterTypeId)
    if (parameterType?.value_type === "bool") {
      return normalizeBooleanValue(rawValue) || "false"
    }
    return rawValue.trim()
  }
  const sortedPackets = useMemo(() => {
    const packets = component?.packets ?? []
    return [...packets].sort((a, b) => {
      const aActive = a.is_active !== false
      const bActive = b.is_active !== false
      if (aActive !== bActive) {
        return aActive ? -1 : 1
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [component?.packets])

  const defaultPacketLocationId = useMemo(() => {
    const packetsWithLocation = sortedPackets.filter((packet) => packet.location?.id)
    if (!packetsWithLocation.length) {
      return ""
    }
    const mostRecentlyUsed = [...packetsWithLocation].sort((a, b) => {
      const aTime = a.last_used_at
        ? new Date(a.last_used_at).getTime()
        : new Date(a.created_at).getTime()
      const bTime = b.last_used_at
        ? new Date(b.last_used_at).getTime()
        : new Date(b.created_at).getTime()
      return bTime - aTime
    })[0]
    return mostRecentlyUsed.location?.id ?? ""
  }, [sortedPackets])

  const packetOptions = useMemo(
    () =>
      sortedPackets.map((packet) => ({
        id: packet.id,
        label: packet.location?.full_path || packet.id,
        locationId: packet.location?.id || null,
        count: packet.count ?? null,
      })),
    [sortedPackets],
  )

  const inactivePacketClass = (packet: ComponentPacket) =>
    packet.is_active === false ? "text-muted-foreground line-through" : ""

  const priceSourceLabel = (source?: ComponentPacket["price_source"]) => {
    switch (source) {
      case "fifo":
        return "Purchase price (FIFO)"
      case "internal":
        return "Estimated from internal price — no purchase price recorded for this packet"
      case "internal_missing":
        return "No price available — internal price is not set on this component"
      default:
        return "Unit price (FIFO or internal price fallback)"
    }
  }

  const documentTypeOptions = [
    { value: "datasheet", label: "Datasheet" },
    { value: "manual", label: "Manual" },
    { value: "specification", label: "Specification" },
    { value: "application_note", label: "Application note" },
    { value: "drawing", label: "Drawing" },
    { value: "certificate", label: "Certificate" },
    { value: "image", label: "Image" },
    { value: "product_page", label: "Product page" },
    { value: "other", label: "Other" },
    { value: "undefined", label: "Undefined" },
  ]

  const accessLevelOptions = [
    { value: "public", label: "Public" },
    { value: "signed", label: "Signed (temporary)" },
  ]

  const shortenUrl = (value: string, maxLength = 28) => {
    try {
      const parsed = new URL(value)
      const path = parsed.pathname === "/" ? "" : parsed.pathname
      const raw = `${parsed.hostname}${path}`
      return raw.length > maxLength ? `${raw.slice(0, maxLength)}…` : raw
    } catch {
      return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
    }
  }

  const handleCopyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error("Unable to copy to clipboard.")
    }
  }

  const handleCopyLink = async (value: string) => {
    await handleCopyText(value, "Link copied.")
  }

  const renderTruncatedText = (text: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full truncate">{text}</span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )

  const packetColumns = useMemo<ColumnDef<ComponentPacket>[]>(() => {
    return [
      {
        accessorKey: "id",
        header: "Packet",
        cell: ({ row }) => (
          <div className={`flex min-w-0 items-center gap-2 ${inactivePacketClass(row.original)}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`/store/packet/${row.original.id}`}
                  className={`min-w-0 truncate hover:underline ${
                    row.original.is_active === false
                      ? "text-muted-foreground line-through"
                      : "text-primary"
                  }`}
                >
                  {row.original.id}
                </Link>
              </TooltipTrigger>
              <TooltipContent>{row.original.id}</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopyLink(row.original.id)}
              aria-label="Copy packet id"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
      {
        id: "location",
        header: "Location",
        cell: ({ row }) =>
          row.original.location ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`/store/location/${row.original.location.id}`}
                  className={`block truncate hover:underline ${
                    row.original.is_active === false
                      ? "text-muted-foreground line-through"
                      : "text-primary"
                  }`}
                >
                  {row.original.location.full_path}
                </Link>
              </TooltipTrigger>
              <TooltipContent>{row.original.location.full_path}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "count",
        header: "Count",
        cell: ({ row }) => (
          <span className={inactivePacketClass(row.original)}>{row.original.count}</span>
        ),
      },
      {
        id: "unit_price",
        header: "Unit price",
        cell: ({ row }) => {
          const v = row.original.itemValue
          const isInternal =
            row.original.price_source === "internal" || row.original.price_source === "internal_missing"
          return v != null && v > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`cursor-default ${isInternal ? "text-muted-foreground" : ""} ${inactivePacketClass(row.original)}`}
                  >
                    {Number(v).toFixed(2)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{priceSourceLabel(row.original.price_source)}</TooltipContent>
              </Tooltip>
              {isInternal && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                  </TooltipTrigger>
                  <TooltipContent>{priceSourceLabel(row.original.price_source)}</TooltipContent>
                </Tooltip>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        id: "total_value",
        header: "Total value",
        cell: ({ row }) => {
          const v = row.original.totalValue
          const isInternal =
            row.original.price_source === "internal" || row.original.price_source === "internal_missing"
          return v != null && v > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`cursor-default font-medium ${isInternal ? "text-muted-foreground" : ""} ${inactivePacketClass(row.original)}`}
                  >
                    {Number(v).toFixed(2)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Total value = unit price × count ({priceSourceLabel(row.original.price_source)})</TooltipContent>
              </Tooltip>
              {isInternal && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3 w-3 text-orange-500" />
                  </TooltipTrigger>
                  <TooltipContent>{priceSourceLabel(row.original.price_source)}</TooltipContent>
                </Tooltip>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <span className={inactivePacketClass(row.original) || "text-foreground"}>
            {row.original.is_active === false ? "Inactive" : "Active"}
          </span>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Created / Last used",
        cell: ({ row }) => {
          const created = new Date(row.original.created_at).toLocaleDateString()
          const lastUsed = row.original.last_used_at
            ? new Date(row.original.last_used_at).toLocaleDateString()
            : "—"
          return (
            <span className={`whitespace-nowrap ${inactivePacketClass(row.original) || "text-muted-foreground"}`}>
              {created}
              <span className="text-foreground/40"> / </span>
              {lastUsed}
            </span>
          )
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <ActionButtonGroup>
            <ActionIconButton
              onClick={() => {
                setOperationPacketId(row.original.id)
                setOperationSheetOpen(true)
              }}
              aria-label="Packet actions"
            >
              <Settings className="h-4 w-4" />
            </ActionIconButton>
            <PrintActions
              targetType="packet"
              targetId={row.original.id}
              label={row.original.location?.full_path || row.original.id}
              compact
            />
          </ActionButtonGroup>
        ),
      },
    ]
  }, [component?.id, handleCopyLink, id, packetOptions, queryClient])

  const supplierColumns = useMemo<ColumnDef<SupplierRelation>[]>(() => {
    const columns: ColumnDef<SupplierRelation>[] = [
      {
        id: "supplier",
        header: "Supplier",
        cell: ({ row }) =>
          row.original.supplier ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`/store/supplier/${row.original.supplier.id}`}
                  className="block truncate text-primary hover:underline"
                >
                  {row.original.supplier.name}
                </Link>
              </TooltipTrigger>
              <TooltipContent>{row.original.supplier.name}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => {
          const description = row.original.description || "-"
          const short = description.length > 40 ? `${description.slice(0, 40)}…` : description
          return description !== "-" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block truncate text-sm text-muted-foreground">{short}</span>
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
      },
      {
        accessorKey: "symbol",
        header: "Symbol",
        cell: ({ row }) =>
          row.original.symbol ? (
            renderTruncatedText(row.original.symbol)
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "product",
        header: "Product link",
        cell: ({ row }) =>
          row.original.url ? (
            <div className="flex min-w-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={row.original.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-primary hover:underline"
                  >
                    {shortenUrl(row.original.url)}
                  </a>
                </TooltipTrigger>
                <TooltipContent>{row.original.url}</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopyLink(row.original.url as string)}
                aria-label="Copy link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const hasPlugin = Boolean(row.original.supplier?.api_plugin_instance)
          const hasSymbol = Boolean(row.original.symbol)
          const canSync = hasPlugin && hasSymbol
          const syncTitle = !canSync
            ? "Supplier symbol and API plugin are required."
            : row.original.api_fetched_at
              ? `Last sync: ${new Date(row.original.api_fetched_at).toLocaleString()}`
              : "Sync supplier data"
          const applyTitle = !canSync
            ? "Supplier symbol and API plugin are required."
            : row.original.api_applied_at
              ? `Last apply: ${new Date(row.original.api_applied_at).toLocaleString()}`
              : "Apply supplier data"
          return (
            <ActionButtonGroup>
              <ActionIconButton asChild aria-label="Open relation">
                <Link to={`/store/supplier-relation/${row.original.id}`}>
                  <Link2 className="h-4 w-4" />
                </Link>
              </ActionIconButton>
              {canEdit ? (
                <>
                  <ActionIconButton
                    onClick={() => syncSupplierRelationMutation.mutate({ id: row.original.id })}
                    disabled={!canSync || syncSupplierRelationMutation.isPending}
                    aria-label="Sync supplier data"
                    title={syncTitle}
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </ActionIconButton>
                  <ActionIconButton
                    onClick={() => applySupplierRelationMutation.mutate({ id: row.original.id })}
                    disabled={!canSync || applySupplierRelationMutation.isPending}
                    aria-label="Apply supplier data"
                    title={applyTitle}
                  >
                    <Check className="h-4 w-4" />
                  </ActionIconButton>
                  <ActionIconButton
                    onClick={() => handleSupplierEdit(row.original)}
                    aria-label="Edit supplier relation"
                  >
                    <Pencil className="h-4 w-4" />
                  </ActionIconButton>
                  <ActionIconButton
                    onClick={() => handleRemoveSupplierRelation(row.original)}
                    disabled={deleteSupplierRelationMutation.isPending}
                    aria-label="Remove supplier from component"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </ActionIconButton>
                </>
              ) : null}
            </ActionButtonGroup>
          )
        },
      },
    ]

    return columns
  }, [
    applySupplierRelationMutation,
    canEdit,
    deleteSupplierRelationMutation,
    handleCopyLink,
    handleRemoveSupplierRelation,
    handleSupplierEdit,
    shortenUrl,
    syncSupplierRelationMutation,
  ])

  const documentColumns = useMemo<ColumnDef<Document>[]>(() => {
    const columns: ColumnDef<Document>[] = [
      {
        accessorKey: "name",
        header: "Document",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`/store/document/${row.original.id}`}
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {row.original.name || "Untitled"}
                </Link>
              </TooltipTrigger>
              <TooltipContent>{row.original.name || "Untitled"}</TooltipContent>
            </Tooltip>
            {row.original.is_primary && row.original.doc_type === "image" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 items-center justify-center rounded text-primary" aria-label="Default image">
                    <ImageIcon className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Default image</TooltipContent>
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        id: "default",
        header: "Default image",
        cell: ({ row }) =>
          row.original.is_primary && row.original.doc_type === "image" ? "Yes" : "-",
      },
      {
        accessorKey: "doc_type",
        header: "Type",
      },
      {
        id: "file",
        header: "File",
        cell: ({ row }) =>
          row.original.file_url || row.original.url ? (
            <div className="flex items-center gap-2">
              <a
                href={row.original.file_url || row.original.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open
              </a>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  handleCopyLink((row.original.file_url || row.original.url) as string)
                }
                aria-label="Copy document link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <ActionButtonGroup>
            {canEdit ? (
              <ActionIconButton
                onClick={() => handleDocumentEdit(row.original)}
                aria-label="Edit document"
              >
                <Pencil className="h-4 w-4" />
              </ActionIconButton>
            ) : null}
            <PrintActions
              targetType="component"
              targetId={component?.id ?? row.original.id}
              kind="document"
              fileUrl={row.original.file_url || row.original.url || null}
              label={row.original.name || row.original.doc_type || "Document"}
              compact
            />
            {canEdit ? (
              <DocumentActionsMenu
                compact
                pending={documentActionsPending}
                onRemove={() => handleRemoveDocument(row.original)}
                onDeleteCompletely={() => handleDeleteDocumentCompletely(row.original)}
              />
            ) : null}
          </ActionButtonGroup>
        ),
      },
    ]

    return columns
  }, [
    canEdit,
    component?.id,
    documentActionsPending,
    handleCopyLink,
    handleDeleteDocumentCompletely,
    handleDocumentEdit,
    handleRemoveDocument,
  ])

  const packetsTable = useReactTable({
    data: sortedPackets,
    columns: packetColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const suppliersTable = useReactTable({
    data: component?.suppliers ?? [],
    columns: supplierColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const documentsTable = useReactTable({
    data: component?.documents ?? [],
    columns: documentColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const parameterColumns = useMemo<ColumnDef<ComponentParameter>[]>(() => {
    const columns: ColumnDef<ComponentParameter>[] = [
      {
        id: "parameter",
        header: "Parameter",
        cell: ({ row }) => {
          const value = row.original.parameter_type
          const label =
            typeof value === "string" ? value : value?.name || "Unknown parameter"
          return (
            <span className="text-sm text-foreground">
              {label}
              {row.original.is_inherited && (
                <span className="ml-1.5 text-xs text-muted-foreground italic">(inherited)</span>
              )}
            </span>
          )
        },
      },
      {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) => {
          const value = row.original.display_value || row.original.value
          const isInherited = row.original.is_inherited
          return value ? (
            <span className={isInherited ? "text-muted-foreground italic" : ""}>
              {renderTruncatedText(value)}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )
        },
      },
    ]

    if (canEdit) {
      columns.push({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <ActionButtonGroup>
            <ActionIconButton
              onClick={() => handleParameterEdit(row.original)}
              aria-label="Edit parameter"
            >
              <Pencil className="h-4 w-4" />
            </ActionIconButton>
            {row.original.is_inherited ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-xs text-muted-foreground">
                    auto
                  </span>
                </TooltipTrigger>
                <TooltipContent>Inherited from category rule</TooltipContent>
              </Tooltip>
            ) : (
              <ActionIconButton
                onClick={() => handleDeleteParameter(row.original)}
                aria-label="Remove parameter"
              >
                <Trash2 className="h-4 w-4" />
              </ActionIconButton>
            )}
          </ActionButtonGroup>
        ),
      })
    }

    return columns
  }, [canEdit, handleDeleteParameter, handleParameterEdit, renderTruncatedText])

  const parametersTable = useReactTable({
    data: parametersList,
    columns: parameterColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const identifierColumns = useMemo<ColumnDef<ExternalIdentifier>[]>(() => {
    const columns: ColumnDef<ExternalIdentifier>[] = [
      {
        id: "scheme",
        header: "Scheme",
        cell: ({ row }) => {
          const scheme = row.original.scheme || ""
          const label = (IDENTIFIER_SCHEME_OPTIONS.find((o) => o.value === scheme)?.label ?? scheme) || "Internal"
          return <span className="text-sm text-foreground">{label}</span>
        },
      },
      {
        accessorKey: "identifier",
        header: "Identifier",
        cell: ({ row }) => (
          <span className="font-mono text-sm text-foreground">{row.original.identifier}</span>
        ),
      },
    ]
    if (canEdit) {
      columns.push({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <ActionButtonGroup>
            <ActionIconButton
              onClick={() => deleteIdentifierMutation.mutate(row.original.id)}
              aria-label="Remove external identifier"
            >
              <Trash2 className="h-4 w-4" />
            </ActionIconButton>
          </ActionButtonGroup>
        ),
      })
    }
    return columns
  }, [canEdit, deleteIdentifierMutation])

  const identifiersTable = useReactTable({
    data: component?.external_identifiers ?? [],
    columns: identifierColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const historyPackets = historyData?.packets ?? []
  const historyConfig = useMemo(() => {
    const config: ChartConfig = {}
    historyPackets.forEach((packet, index) => {
      const key = `packet_${index}`
      const prefix = packet.id?.split("-")[0] || `packet-${index + 1}`
      const position = index + 1
      const baseLabel = packet.label || `Packet ${index + 1}`
      config[key] = {
        label: `${baseLabel} (${prefix} #${position})`,
        color: `var(--chart-${(index % 5) + 1})`,
      }
    })
    return config
  }, [historyPackets])

  const historyDataPoints = useMemo(() => {
    if (!historyData?.history) {
      return []
    }
    const rows = historyData.history.map((entry) => {
      const parsedTimestamp = new Date(entry.timestamp).getTime()
      const timestampValue = Number.isNaN(parsedTimestamp) ? entry.timestamp : parsedTimestamp
      const row: Record<string, number | string> = {
        timestamp: timestampValue,
      }
      historyPackets.forEach((packet, index) => {
        const key = `packet_${index}`
        row[key] = entry.levels?.[packet.id] ?? 0
      })
      return row
    })
    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1]
      const nowTimestamp = Date.now()
      rows.push({
        ...lastRow,
        timestamp: nowTimestamp,
      })
    }
    return rows
  }, [historyData?.history, historyPackets])

  const formatHistoryDate = (value: string | number) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return String(value)
    }
    return parsed.toLocaleDateString()
  }

  const formatHistoryDateTime = (value: string | number) => {
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return String(value)
    }
    return parsed.toLocaleString()
  }

  const renderTable = <T,>({
    table,
    emptyMessage,
    getRowClassName,
  }: {
    table: TanstackTable<T>
    emptyMessage: string
    getRowClassName?: (row: TanstackRow<T>) => string | undefined
  }) => (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table className="w-full table-fixed">
        <TableHeader className="bg-muted/40">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-border/50">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn("border-border/40", getRowClassName?.(row))}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="h-9 px-3 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow className="border-border/40">
              <TableCell
                colSpan={table.getAllColumns().length}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

  const packetFormValid =
    packetForm.locationId.trim() !== "" &&
    (packetForm.count.trim() === "" || !Number.isNaN(Number(packetForm.count)))
  const supplierFormValid = supplierForm.supplierId.trim() !== ""
  const parameterFormValid = parameterForm.parameterTypeId.trim() !== ""
  const documentFormHasFile = documentForm.sourceType === "file" && !!documentForm.file
  const documentFormHasUrl = documentForm.sourceType === "url" && documentForm.url.trim() !== ""
  const documentFormValid = documentEditId ? true : documentFormHasFile || documentFormHasUrl

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <div className="grid gap-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <Skeleton className="aspect-video w-full rounded-lg" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !component) {
    return (
      <Card className="mx-auto max-w-3xl border-destructive/60 bg-destructive/10 text-destructive">
        <CardHeader>
          <CardTitle>Unable to load component</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-destructive/80">
          Please refresh the page or try again later.
        </CardContent>
      </Card>
    )
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          {editMode ? (
            <div className="flex items-center gap-1">
              <Input
                value={editedData.name || ""}
                onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                className="h-11 text-xl font-semibold"
                placeholder="Component name"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  handleCopyText(editedData.name || component.name, "Name copied.")
                }
                aria-label="Copy component name"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <h1 className="text-2xl font-semibold text-foreground">{component.name}</h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleCopyText(component.name, "Name copied.")}
                aria-label="Copy component name"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span>ID:</span>
              <span className="select-all font-mono text-foreground">{component.id}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => handleCopyText(component.id, "ID copied.")}
                aria-label="Copy component ID"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </span>
            <span className="hidden sm:inline">•</span>
            <span>Created {new Date(component.created_at).toLocaleDateString()}</span>
            {!editMode && component.category && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                {component.category.name}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExtensionPoint name="component.actions" context={{ componentId: component.id }} />
          {canEdit && (
            <>
              {editMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={updateMutation.isPending}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateComponentMutation.mutate()}
                    disabled={duplicateComponentMutation.isPending}
                    className="gap-2"
                  >
                    <CopyPlus className="h-4 w-4" />
                    {duplicateComponentMutation.isPending ? "Duplicating..." : "Duplicate"}
                  </Button>
                  <Button size="sm" onClick={handleEdit} className="gap-2">
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-6 p-4 sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                  {component.primary_image_url ? (
                    <img
                      src={component.primary_image_url}
                      alt={component.name}
                      className="h-52 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                      No image available
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Category</p>
                    {editMode ? (
                      <Select
                        classNamePrefix="rs"
                        isSearchable
                        isClearable
                        options={categoryOptions}
                        value={categoryValue}
                        placeholder="Select category"
                        styles={selectStyles}
                        onChange={(option: SingleValue<OptionType>) => {
                          const found = categoriesList.find((c) => c.id === option?.value)
                          setEditedData({ ...editedData, category: found })
                        }}
                      />
                    ) : component.category ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" />
                        {component.category.name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No category</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Tags</p>
                    {editMode ? (
                      <CreatableSelect
                        classNamePrefix="rs"
                        isMulti
                        isSearchable
                        options={tagOptionsWithSelected}
                        value={selectedTagOptions}
                        placeholder="Search or create tags"
                        styles={selectStyles as unknown as StylesConfig<OptionType, true>}
                        isDisabled={createTagMutation.isPending}
                        onChange={(options: MultiValue<OptionType>) => {
                          const selectedIds = options.map((opt) => opt.value)
                          const mergedFromList = tagsList.filter((tag) =>
                            selectedIds.includes(tag.id),
                          )
                          const preserved = selectedTags.filter(
                            (tag) =>
                              selectedIds.includes(tag.id) &&
                              !mergedFromList.some((t) => t.id === tag.id),
                          )
                          const merged = [...mergedFromList, ...preserved]
                          setEditedData({ ...editedData, tags: merged })
                        }}
                        onCreateOption={(inputValue) => {
                          if (inputValue.trim()) {
                            createTagMutation.mutate(inputValue.trim())
                          }
                        }}
                      />
                    ) : component.tags && component.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {component.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                          >
                            <Tag className="h-3.5 w-3.5" />
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No tags</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Summary</p>
                <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/70 bg-muted/40 p-3 shadow-sm">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Stock
                        </p>
                        <dl className="mt-2 space-y-1.5 text-sm">
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Total</dt>
                            <dd className="font-semibold text-foreground">
                              {component.inventory_summary?.home_quantity != null ? (
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-xs font-semibold text-foreground">
                                        <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                        {component.inventory_summary.home_quantity}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Home location</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-xs font-semibold text-foreground">
                                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                        {component.inventory_summary?.total_quantity ?? 0}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>All locations (company)</TooltipContent>
                                  </Tooltip>
                                </div>
                              ) : (
                                component.inventory_summary?.total_quantity ?? 0
                              )}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Reserved</dt>
                            <dd className="font-semibold text-foreground">
                              {component.inventory_summary?.reserved_quantity ?? 0}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2 border-t border-border/70 pt-1.5">
                            <dt className="text-muted-foreground">Available</dt>
                            <dd className="font-semibold text-foreground">
                              {Math.max(
                                0,
                                (component.inventory_summary?.total_quantity ?? 0) -
                                  (component.inventory_summary?.reserved_quantity ?? 0),
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/40 p-3 shadow-sm">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Purchase
                        </p>
                        <p className="text-xl font-semibold text-foreground">
                          {component.inventory_summary?.purchase_ordered_quantity ?? 0} /{" "}
                          {component.inventory_summary?.purchase_requested_quantity ??
                            component.inventory_summary?.purchase_quantity ??
                            0}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ordered / Requested
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Internal price
                        </p>
                        {editMode ? (
                          <Input
                            type="number"
                            value={editedData.internal_price ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              setEditedData({
                                ...editedData,
                                internal_price: value === "" ? undefined : Number(value),
                              })
                            }}
                            className="mt-2"
                          />
                        ) : (
                          <p className="mt-1 text-sm font-medium text-foreground">
                            <PriceLabel value={component.internal_price} currency={component.currency} />
                          </p>
                        )}
                      </div>
                      <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Selling price
                        </p>
                        {editMode ? (
                          <Input
                            type="number"
                            value={editedData.selling_price ?? ""}
                            onChange={(e) => {
                              const value = e.target.value
                              setEditedData({
                                ...editedData,
                                selling_price: value === "" ? undefined : Number(value),
                              })
                            }}
                            className="mt-2"
                          />
                        ) : (
                          <p className="mt-1 text-sm font-medium text-foreground">
                            <PriceLabel value={component.selling_price} currency={component.currency} />
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                      <div className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Created</span>
                          <span className="font-medium text-foreground">
                            {new Date(component.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Last modified</span>
                          <span className="font-medium text-foreground">
                            {component.last_modified_at
                              ? new Date(component.last_modified_at).toLocaleDateString()
                              : new Date(component.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Packets</span>
                          <span className="font-medium text-foreground">
                            {component.packets?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span>Documents</span>
                          <span className="font-medium text-foreground">
                            {component.documents?.length || 0}
                          </span>
                        </div>
                      </div>
                    </div>

              </div>
              </div>

              <div className="min-w-0 space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Description</h3>
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  {editMode ? (
                    <textarea
                      value={editedData.description || ""}
                      onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                      className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                      {component.description || "No description provided."}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <PrintActions
              targetType="component"
              targetId={component.id}
              label={component.name}
              compact
            />
          </div>

          <div className="space-y-10">
          <section className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Packets</h2>
                <p className="text-sm text-muted-foreground">
                  {component?.packets?.length || 0} packets
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={openNewPacketSheet}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New packet
                  </Button>
                </div>
              )}
            </div>
            {(component?.packets?.length ?? 0) > 0 ? (
              renderTable({
                table: packetsTable,
                emptyMessage: "No packets available.",
                getRowClassName: (row) =>
                  cn(
                    row.original.is_active === false && "bg-muted/20 opacity-70",
                    highlightPacketId &&
                      row.original.id === highlightPacketId &&
                      "bg-amber-100/90 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.85)]",
                  ) || undefined,
              })
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No packets. Add a packet to track stock for this component.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Parameters</h2>
                <p className="text-sm text-muted-foreground">
                  {parametersList.length || 0} parameters
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setParameterSheetOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add parameter
                </Button>
              )}
            </div>
            {parametersList.length > 0 ? (
              renderTable({
                table: parametersTable,
                emptyMessage: "No parameters available.",
              })
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No parameters. Add parameters to describe this component.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Documents</h2>
                <p className="text-sm text-muted-foreground">
                  {component?.documents?.length || 0} documents
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDocumentSheetOpen(true)}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add document
                  </Button>
                )}
                <ExtensionPoint
                  name="documents.actions"
                  context={{ componentId: component.id, activeTab: "documents" }}
                />
              </div>
            </div>
            {(component?.documents?.length ?? 0) > 0 ? (
              renderTable({
                table: documentsTable,
                emptyMessage: "No documents attached.",
              })
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No documents attached.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Suppliers</h2>
                <p className="text-sm text-muted-foreground">
                  {component?.suppliers?.length || 0} suppliers
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSupplierSheetOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Assign supplier
                </Button>
              )}
            </div>
            {(component?.suppliers?.length ?? 0) > 0 ? (
              renderTable({
                table: suppliersTable,
                emptyMessage: "No suppliers available.",
                getRowClassName: (row) =>
                  highlightSupplierId && row.original.supplier?.id === highlightSupplierId
                    ? "bg-amber-100/90 shadow-[inset_0_0_0_2px_rgba(251,191,36,0.85)]"
                    : undefined,
              })
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No suppliers assigned.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Used in manufacturing</h2>
              <p className="text-sm text-muted-foreground">
                BOMs where this component is linked.
              </p>
            </div>
            {usedInManufacturing.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border/50">
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        BOM
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Product
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usedInManufacturing.map((row) => (
                      <TableRow key={row.bom_id} className="border-border/40">
                        <TableCell className="h-9 px-3 text-sm">
                          <Link
                            to={`/production/${row.product_id}/bom/${row.bom_id}`}
                            className="text-primary hover:underline"
                          >
                            {row.bom_name}
                          </Link>
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-foreground">
                          {row.product_name}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm">
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {row.planned_date ? new Date(row.planned_date).toLocaleDateString() : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                This component is not used in any manufacturing BOM.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">On purchase list or requests</h2>
              <p className="text-sm text-muted-foreground">
                Purchase requests or purchase orders that include this component.
              </p>
            </div>
            {purchaseRequestsList.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border/50">
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Quantity
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Requested by
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Purchase
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Created
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseRequestsList.map((row) => (
                      <TableRow key={row.id} className="border-border/40">
                        <TableCell className="h-9 px-3 text-sm font-medium text-foreground">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {row.requested_by_name ?? "—"}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm">
                          {row.purchase_id ? (
                            <Link
                              to={`/store/purchase/${row.purchase_id}`}
                              className="text-primary hover:underline"
                            >
                              View purchase
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm">
                          <ActionButtonGroup>
                            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                              <Link to={`/store/purchase-requests/${row.id}`}>View request</Link>
                            </Button>
                          </ActionButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                This component is not on any purchase list or request.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">On reservation list</h2>
              <p className="text-sm text-muted-foreground">
                Reservations that include this component.
              </p>
            </div>
            {reservationsList.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border/70">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="border-border/50">
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Quantity
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Reserved by
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Date
                      </TableHead>
                      <TableHead className="h-9 px-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reservationsList.map((row) => (
                      <TableRow key={row.id} className="border-border/40">
                        <TableCell className="h-9 px-3 text-sm font-medium text-foreground">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {row.reserved_by ?? "—"}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm text-muted-foreground">
                          {row.reservation_date
                            ? new Date(row.reservation_date).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="h-9 px-3 text-sm">
                          <ActionButtonGroup>
                            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                              <Link to={`/store/reservations/${row.id}`}>View</Link>
                            </Button>
                          </ActionButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                This component is not on any reservation list.
              </p>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">External identifiers</h2>
                <p className="text-sm text-muted-foreground">
                  EAN, SKU, supplier codes and other barcodes for scanning and search.
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIdentifierSheetOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add identifier
                </Button>
              )}
            </div>
            {(component?.external_identifiers?.length ?? 0) > 0 ? (
              renderTable({
                table: identifiersTable,
                emptyMessage: "No external identifiers.",
              })
            ) : (
              <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                No external identifiers.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">History levels</h2>
                <p className="text-sm text-muted-foreground">
                  Inventory timeline across all packets.
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>Stacked view</span>
                <Switch
                  checked={isStackedHistory}
                  onCheckedChange={(checked) => setIsStackedHistory(checked)}
                />
              </div>
            </div>
            <Card className="shadow-none">
            <CardContent className="p-2">
              {isHistoryLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : historyDataPoints.length ? (
                <ChartContainer config={historyConfig} className="h-[320px] w-full">
                  <AreaChart data={historyDataPoints} margin={{ left: 12, right: 12 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={formatHistoryDate}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => Number(value).toLocaleString()}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelKey="timestamp"
                          labelFormatter={(_, payload) =>
                            formatHistoryDateTime(payload?.[0]?.payload?.timestamp ?? "")
                          }
                        />
                      }
                    />
                    <Legend
                      formatter={(value) =>
                        historyConfig[value as keyof ChartConfig]?.label || value
                      }
                    />
                    {historyPackets.map((_packet, index) => {
                      const key = `packet_${index}`
                      return (
                        <Area
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={`var(--color-${key})`}
                          fill={`var(--color-${key})`}
                          fillOpacity={0.3}
                          dot={{ r: 3, strokeWidth: 2, fill: "var(--background)" }}
                          activeDot={{ r: 5 }}
                          stackId={isStackedHistory ? "levels" : undefined}
                        />
                      )
                    })}
                  </AreaChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No history data is available yet.
                </p>
              )}
            </CardContent>
          </Card>
          </section>
          </div>
        </div>
      </div>

      <Sheet open={packetSheetOpen} onOpenChange={setPacketSheetOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>New packet</SheetTitle>
            <SheetDescription>Add a new packet with a warehouse location.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Location</label>
              <Select
                classNamePrefix="rs"
                isSearchable
                options={locationOptions}
                value={selectedLocationOption || null}
                placeholder="Select location"
                styles={selectStyles}
                onChange={(option: SingleValue<OptionType>) =>
                  setPacketForm({ ...packetForm, locationId: option?.value || "" })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Count</label>
              <Input
                type="number"
                value={packetForm.count}
                onChange={(e) => setPacketForm({ ...packetForm, count: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive packets are hidden from default workflows.
                </p>
              </div>
              <Switch
                checked={packetForm.isActive}
                onCheckedChange={(checked) =>
                  setPacketForm({ ...packetForm, isActive: checked })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={packetForm.description}
                onChange={(e) => setPacketForm({ ...packetForm, description: e.target.value })}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional packet notes"
              />
            </div>
          </div>
          {createPacketMutation.error && (
            <p className="mt-4 text-sm text-destructive">Failed to create packet.</p>
          )}
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setPacketSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePacket}
              disabled={!packetFormValid || createPacketMutation.isPending}
            >
              {createPacketMutation.isPending ? "Creating..." : "Create packet"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={identifierSheetOpen} onOpenChange={setIdentifierSheetOpen}>
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>Add external identifier</SheetTitle>
            <SheetDescription>
              Add an EAN, SKU, supplier code or other barcode. When this sheet is open, scanner and RFID input are locked to the Code field—scan to fill it.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Scheme</label>
              <Select
                classNamePrefix="rs"
                options={IDENTIFIER_SCHEME_OPTIONS}
                value={IDENTIFIER_SCHEME_OPTIONS.find((o) => o.value === identifierForm.scheme) ?? null}
                placeholder="Select type"
                styles={selectStyles}
                onChange={(option: SingleValue<OptionType>) => {
                  setIdentifierForm({ ...identifierForm, scheme: option?.value ?? "" })
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Code</label>
              <Input
                ref={identifierInputRef}
                value={identifierForm.identifier}
                onChange={(e) =>
                  setIdentifierForm({ ...identifierForm, identifier: e.target.value.trim() })
                }
                placeholder="Scan or type e.g. 8591234567890 or SUP-CODE-001"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setIdentifierSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createIdentifierMutation.mutate({
                  scheme: identifierForm.scheme,
                  identifier: identifierForm.identifier,
                })
              }
              disabled={
                !identifierForm.identifier.trim() || createIdentifierMutation.isPending
              }
            >
              {createIdentifierMutation.isPending ? "Adding..." : "Add identifier"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PacketOperationSheet
        open={operationSheetOpen}
        onOpenChange={(open) => {
          setOperationSheetOpen(open)
          if (!open) {
            setOperationPacketId(null)
          }
        }}
        packetOptions={packetOptions}
        initialPacketId={operationPacketId ?? undefined}
        showPacketSelect={!operationPacketId}
        componentId={component?.id}
        onOperationCreated={() => {
          queryClient.invalidateQueries({ queryKey: ["component", id] })
          queryClient.invalidateQueries({ queryKey: ["component-history", id] })
        }}
      />

      <Sheet
        open={supplierSheetOpen}
        onOpenChange={(open) => {
          setSupplierSheetOpen(open)
          if (!open) {
            setSupplierEditId(null)
            setSupplierForm({ supplierId: "", symbol: "", description: "", customUrl: "" })
          }
        }}
      >
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>{supplierEditId ? "Edit supplier link" : "Assign supplier"}</SheetTitle>
            <SheetDescription>
              {supplierEditId
                ? "Update the supplier relation details."
                : "Link this component to a supplier profile."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Supplier</label>
              <Select
                classNamePrefix="rs"
                isSearchable
                options={supplierOptions}
                value={selectedSupplierOption || null}
                placeholder="Select supplier"
                styles={selectStyles}
                onChange={(option: SingleValue<OptionType>) =>
                  setSupplierForm({ ...supplierForm, supplierId: option?.value || "" })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Supplier symbol</label>
              <Input
                value={supplierForm.symbol}
                onChange={(e) => setSupplierForm({ ...supplierForm, symbol: e.target.value })}
                placeholder="Order code"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Product URL</label>
              <Input
                value={supplierForm.customUrl}
                onChange={(e) => setSupplierForm({ ...supplierForm, customUrl: e.target.value })}
                placeholder="https://"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <textarea
                value={supplierForm.description}
                onChange={(e) => setSupplierForm({ ...supplierForm, description: e.target.value })}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional supplier notes"
              />
            </div>
          </div>
          {(createSupplierRelationMutation.error || updateSupplierRelationMutation.error) && (
            <p className="mt-4 text-sm text-destructive">
              {supplierEditId ? "Failed to update supplier relation." : "Failed to assign supplier."}
            </p>
          )}
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSupplierSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={supplierEditId ? handleSaveSupplierRelation : handleCreateSupplierRelation}
              disabled={
                !supplierFormValid ||
                createSupplierRelationMutation.isPending ||
                updateSupplierRelationMutation.isPending
              }
            >
              {supplierEditId
                ? updateSupplierRelationMutation.isPending
                  ? "Saving..."
                  : "Save changes"
                : createSupplierRelationMutation.isPending
                  ? "Assigning..."
                  : "Assign supplier"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={parameterSheetOpen}
        onOpenChange={(open) => {
          setParameterSheetOpen(open)
          if (!open) {
            setParameterEditId(null)
            setParameterForm({ parameterTypeId: "", value: "" })
          }
        }}
      >
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>{parameterEditId ? "Edit parameter" : "Add parameter"}</SheetTitle>
            <SheetDescription>
              {parameterEditId
                ? "Update the parameter type or value."
                : "Add a new parameter to this component."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Parameter type</label>
              <Select
                classNamePrefix="rs"
                isSearchable
                options={parameterTypeOptions}
                value={selectedParameterTypeOption || null}
                placeholder="Select parameter type"
                styles={selectStyles}
                onChange={(option: SingleValue<OptionType>) => {
                  const parameterTypeId = option?.value || ""
                  const selectedType = parameterTypesList.find(
                    (type) => type.id === parameterTypeId,
                  )
                  setParameterForm({
                    ...parameterForm,
                    parameterTypeId,
                    value:
                      selectedType?.value_type === "bool"
                        ? normalizeBooleanValue(parameterForm.value) || "false"
                        : parameterForm.value,
                  })
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Value</label>
              {isBooleanParameterType ? (
                <select
                  value={normalizeBooleanValue(parameterForm.value) || "false"}
                  onChange={(e) =>
                    setParameterForm({ ...parameterForm, value: e.target.value })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              ) : (
                <Input
                  value={parameterForm.value}
                  onChange={(e) => setParameterForm({ ...parameterForm, value: e.target.value })}
                  placeholder="Parameter value"
                />
              )}
            </div>
          </div>
          {(createParameterMutation.error || updateParameterMutation.error) && (
            <p className="mt-4 text-sm text-destructive">
              {parameterEditId ? "Failed to update parameter." : "Failed to add parameter."}
            </p>
          )}
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setParameterSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={parameterEditId ? handleSaveParameter : handleCreateParameter}
              disabled={
                !parameterFormValid ||
                createParameterMutation.isPending ||
                updateParameterMutation.isPending
              }
            >
              {parameterEditId
                ? updateParameterMutation.isPending
                  ? "Saving..."
                  : "Save changes"
                : createParameterMutation.isPending
                  ? "Adding..."
                  : "Add parameter"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={documentSheetOpen}
        onOpenChange={(open) => {
          setDocumentSheetOpen(open)
          if (!open) {
            setDocumentEditId(null)
            setDocumentForm({
              name: "",
              docType: "undefined",
              accessLevel: "public",
              isPrimary: false,
              sourceType: "file",
              file: null,
              url: "",
            })
          }
        }}
      >
        <SheetContent side="right" className="w-full max-w-lg">
          <SheetHeader>
            <SheetTitle>{documentEditId ? "Edit document" : "Add document"}</SheetTitle>
            <SheetDescription>
              {documentEditId
                ? "Update document metadata or replace the file/URL."
                : "Upload a file or attach an external URL."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Name</label>
              <Input
                value={documentForm.name}
                onChange={(e) => setDocumentForm({ ...documentForm, name: e.target.value })}
                placeholder="Document name"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Type</label>
                <select
                  value={documentForm.docType}
                  onChange={(e) => {
                    const docType = e.target.value
                    setDocumentForm({
                      ...documentForm,
                      docType,
                      isPrimary: docType === "image" ? documentForm.isPrimary : false,
                    })
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {documentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Access level</label>
                <select
                  value={documentForm.accessLevel}
                  onChange={(e) =>
                    setDocumentForm({ ...documentForm, accessLevel: e.target.value })
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {accessLevelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {documentForm.docType === "image" ? (
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={documentForm.isPrimary}
                  onChange={(e) =>
                    setDocumentForm({ ...documentForm, isPrimary: e.target.checked })
                  }
                  className="h-4 w-4 rounded border border-input"
                />
                Set as default image
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only image documents can be set as the default image.
              </p>
            )}
            <div className="flex items-center gap-4 text-sm font-medium text-foreground">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="documentSource"
                  value="file"
                  checked={documentForm.sourceType === "file"}
                  onChange={() => setDocumentForm({ ...documentForm, sourceType: "file" })}
                />
                File upload
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="documentSource"
                  value="url"
                  checked={documentForm.sourceType === "url"}
                  onChange={() => setDocumentForm({ ...documentForm, sourceType: "url" })}
                />
                URL
              </label>
            </div>
            {documentForm.sourceType === "file" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {documentEditId ? "Replace file (optional)" : "File"}
                </label>
                <input
                  type="file"
                  onChange={(e) =>
                    setDocumentForm({ ...documentForm, file: e.target.files?.[0] || null })
                  }
                  className="block w-full text-sm text-foreground"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {documentEditId ? "Replace URL (optional)" : "URL"}
                </label>
                <Input
                  value={documentForm.url}
                  onChange={(e) => setDocumentForm({ ...documentForm, url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            )}
          </div>
          {(createDocumentMutation.error || updateDocumentMutation.error) && (
            <p className="mt-4 text-sm text-destructive">
              {documentEditId ? "Failed to update document." : "Failed to add document."}
            </p>
          )}
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setDocumentSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDocument}
              disabled={
                !documentFormValid ||
                createDocumentMutation.isPending ||
                updateDocumentMutation.isPending
              }
            >
              {documentEditId
                ? updateDocumentMutation.isPending
                  ? "Saving..."
                  : "Save changes"
                : createDocumentMutation.isPending
                  ? "Adding..."
                  : "Add document"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      </div>
    </TooltipProvider>
  )
}
