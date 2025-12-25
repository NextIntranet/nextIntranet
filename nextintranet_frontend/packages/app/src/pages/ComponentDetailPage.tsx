import { useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type ColumnDef,
  type Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { apiFetch } from "@nextintranet/core"
import { toast } from "sonner"
import {
  ClipboardList,
  FileText,
  Layers,
  Link2,
  Copy,
  MapPin,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  ShoppingCart,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react"
import Select, {
  type StylesConfig,
  type SingleValue,
  type MultiValue,
} from "react-select"
import CreatableSelect from "react-select/creatable"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  description: string
  created_at: string
  location: {
    id: string
    full_path: string
  }
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
}

interface SupplierRelation {
  id: string
  supplier?: Supplier | null
  symbol?: string | null
  description?: string | null
  custom_url?: string | null
  url?: string | null
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
}

interface ComponentParameter {
  id: string
  parameter_type?: ParameterType | string | null
  value?: string | null
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
    reserved_quantity: number
    purchase_quantity: number
  }
  internal_price?: number
  selling_price?: number
  currency?: string
  created_at: string
  packets?: ComponentPacket[]
  documents?: Document[]
  suppliers?: SupplierRelation[]
}

interface User {
  is_superuser: boolean
  access_permissions: Array<{
    area: string
    level: string
  }>
}

type TabKey = "packets" | "suppliers" | "documents" | "parameters"

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

const selectStyles: StylesConfig<OptionType, boolean> = {
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
  const [editMode, setEditMode] = useState(false)
  const [editedData, setEditedData] = useState<Partial<Component>>({})
  const [activeTab, setActiveTab] = useState<TabKey>("packets")
  const [packetSheetOpen, setPacketSheetOpen] = useState(false)
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
  const queryClient = useQueryClient()

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
    }) =>
      apiFetch(`/api/v1/store/component/${id}/packet/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["component", id] })
      setPacketSheetOpen(false)
      setPacketForm({ locationId: "", count: "", description: "" })
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
    mutationFn: (payload: { id: string; data: FormData }) =>
      apiFetch(`/api/v1/store/documents/${payload.id}/`, {
        method: "PATCH",
        body: payload.data,
      }),
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
    if (documentForm.isPrimary) {
      payload.append("is_primary", "true")
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

  const handleCreateParameter = () => {
    if (!id || !parameterForm.parameterTypeId.trim()) {
      return
    }
    const payload = {
      component: id,
      parameter_type: parameterForm.parameterTypeId,
      value: parameterForm.value.trim(),
    }
    createParameterMutation.mutate(payload)
  }

  const handleParameterEdit = (parameter: ComponentParameter) => {
    const parameterTypeId =
      typeof parameter.parameter_type === "string"
        ? parameter.parameter_type
        : parameter.parameter_type?.id || ""
    setParameterEditId(parameter.id)
    setParameterForm({
      parameterTypeId,
      value: parameter.value || "",
    })
    setParameterSheetOpen(true)
  }

  const handleSaveParameter = () => {
    if (!parameterEditId || !parameterForm.parameterTypeId.trim()) {
      return
    }
    updateParameterMutation.mutate({
      id: parameterEditId,
      data: {
        parameter_type: parameterForm.parameterTypeId,
        value: parameterForm.value.trim(),
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

  const tabItems: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
    {
      key: "packets",
      label: `Locations (${component?.packets?.length || 0})`,
      icon: MapPin,
    },
    {
      key: "parameters",
      label: `Parameters (${parametersList.length || 0})`,
      icon: ClipboardList,
    },
    {
      key: "suppliers",
      label: `Suppliers (${component?.suppliers?.length || 0})`,
      icon: Package,
    },
    {
      key: "documents",
      label: `Documents (${component?.documents?.length || 0})`,
      icon: FileText,
    },
  ]

  const activeAction = (() => {
    if (!canEdit) {
      return null
    }
    if (activeTab === "packets") {
      return { label: "New packet", onClick: () => setPacketSheetOpen(true) }
    }
    if (activeTab === "suppliers") {
      return { label: "Assign supplier", onClick: () => setSupplierSheetOpen(true) }
    }
    if (activeTab === "parameters") {
      return { label: "Add parameter", onClick: () => setParameterSheetOpen(true) }
    }
    return { label: "Add document", onClick: () => setDocumentSheetOpen(true) }
  })()

  const documentTypeOptions = [
    { value: "datasheet", label: "Datasheet" },
    { value: "manual", label: "Manual" },
    { value: "specification", label: "Specification" },
    { value: "application_note", label: "Application note" },
    { value: "drawing", label: "Drawing" },
    { value: "certificate", label: "Certificate" },
    { value: "image", label: "Image" },
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

  const handleCopyLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success("Link copied.")
    } catch {
      toast.error("Unable to copy link.")
    }
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
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={`/store/packet/${row.original.id}`}
                  className="min-w-0 truncate text-primary hover:underline"
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
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={`/store/location/${row.original.location.id}`}
                className="block truncate text-primary hover:underline"
              >
                {row.original.location.full_path}
              </Link>
            </TooltipTrigger>
            <TooltipContent>{row.original.location.full_path}</TooltipContent>
          </Tooltip>
        ),
      },
      {
        accessorKey: "count",
        header: "Count",
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
      },
    ]
  }, [handleCopyLink])

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
        id: "relation",
        header: "Relation",
        cell: ({ row }) => (
          <Link
            to={`/store/supplier-relation/${row.original.id}`}
            className="text-primary hover:underline"
            aria-label="Open relation"
          >
            <Link2 className="h-4 w-4" />
          </Link>
        ),
      },
    ]

    if (canEdit) {
      columns.push({
        id: "edit",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSupplierEdit(row.original)}
            aria-label="Edit supplier relation"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ),
      })
    }

    return columns
  }, [canEdit, handleCopyLink, handleSupplierEdit, shortenUrl])

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
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                Default image
              </span>
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
    ]

    if (canEdit) {
      columns.push({
        id: "edit",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDocumentEdit(row.original)}
            aria-label="Edit document"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ),
      })
    }

    return columns
  }, [canEdit, handleCopyLink, handleDocumentEdit])

  const packetsTable = useReactTable({
    data: component?.packets ?? [],
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
            <span className="text-sm text-foreground">{label}</span>
          )
        },
      },
      {
        accessorKey: "value",
        header: "Value",
        cell: ({ row }) =>
          row.original.value ? (
            renderTruncatedText(row.original.value)
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
    ]

    if (canEdit) {
      columns.push(
        {
          id: "edit",
          header: "",
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleParameterEdit(row.original)}
              aria-label="Edit parameter"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ),
        },
        {
          id: "delete",
          header: "",
          cell: ({ row }) => (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteParameter(row.original)}
              aria-label="Remove parameter"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ),
        },
      )
    }

    return columns
  }, [canEdit, handleDeleteParameter, handleParameterEdit, renderTruncatedText])

  const parametersTable = useReactTable({
    data: parametersList,
    columns: parameterColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const renderTable = <T,>({
    table,
    emptyMessage,
  }: {
    table: TanstackTable<T>
    emptyMessage: string
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
              <TableRow key={row.id} className="border-border/40">
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
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
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
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 rounded-md" />
                <Skeleton className="h-10 rounded-md" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24 w-full rounded-md" />
            </CardContent>
          </Card>
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
            <Input
              value={editedData.name || ""}
              onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
              className="h-11 text-xl font-semibold"
              placeholder="Component name"
            />
          ) : (
            <h1 className="text-2xl font-semibold text-foreground">{component.name}</h1>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>ID: {component.id}</span>
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
        {canEdit && (
          <div className="flex items-center gap-2">
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
              <Button size="sm" onClick={handleEdit} className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[260px_1fr]">
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
                        styles={selectStyles}
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
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Total", value: component.inventory_summary.total_quantity },
                    { label: "Reserved", value: component.inventory_summary.reserved_quantity },
                    { label: "Purchase", value: component.inventory_summary.purchase_quantity },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-lg border border-border/70 bg-muted/40 p-3 shadow-sm"
                    >
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="text-xl font-semibold text-foreground">{stat.value}</p>
                    </div>
                  ))}
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
                      <span>ID</span>
                      <span className="font-medium text-foreground">{component.id}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Created</span>
                      <span className="font-medium text-foreground">
                        {new Date(component.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Locations</span>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle>Description</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {editMode ? (
                <textarea
                  value={editedData.description || ""}
                  onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                  className="min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              ) : (
                <p className="text-sm text-foreground">
                  {component.description || "No description provided."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Details</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {tabItems.map((tab) => (
                  <Button
                    key={tab.key}
                    variant={activeTab === tab.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab(tab.key)}
                    className="gap-2"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </Button>
                ))}
                {activeAction && (
                  <Button size="sm" variant="secondary" onClick={activeAction.onClick} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {activeAction.label}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-5">
              {activeTab === "packets" && (
                renderTable({
                  table: packetsTable,
                  emptyMessage: "No locations available.",
                })
              )}

              {activeTab === "parameters" && (
                renderTable({
                  table: parametersTable,
                  emptyMessage: "No parameters available.",
                })
              )}

              {activeTab === "suppliers" && (
                renderTable({
                  table: suppliersTable,
                  emptyMessage: "No suppliers available.",
                })
              )}

              {activeTab === "documents" && (
                renderTable({
                  table: documentsTable,
                  emptyMessage: "No documents attached.",
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="secondary" className="justify-start gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Reorder
                </Button>
                <Button variant="secondary" className="justify-start gap-2">
                  <Package className="h-4 w-4" />
                  New packet
                </Button>
                <Button variant="secondary" className="justify-start gap-2">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button variant="secondary" className="justify-start gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Inventory
                </Button>
              </CardContent>
            </Card>
          )}
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
                onChange={(option: SingleValue<OptionType>) =>
                  setParameterForm({
                    ...parameterForm,
                    parameterTypeId: option?.value || "",
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Value</label>
              <Input
                value={parameterForm.value}
                onChange={(e) => setParameterForm({ ...parameterForm, value: e.target.value })}
                placeholder="Parameter value"
              />
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
                  onChange={(e) => setDocumentForm({ ...documentForm, docType: e.target.value })}
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
