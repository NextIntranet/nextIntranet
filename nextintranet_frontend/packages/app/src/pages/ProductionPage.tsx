import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { IBOM_EVENT_TYPES, apiFetch, getRealtimeClient, nextIO, tokenStorage, useIbomBridge } from "@nextintranet/core"
import { ChevronDown, ChevronUp, CornerDownRight, FilePlus2, FileText, FolderPlus, Link2, Lock, MapPin, Package, ScanLine } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ComponentInfoPopover } from "@/components/ComponentInfoPopover"
import { ComponentSearchSheet, type SearchComponentItem } from "@/components/ComponentSearchSheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PacketSelectSheet, type PacketLineProgress, type PacketSelectItem } from "@/components/PacketSelectSheet"
import { ScanActionDialog, type ScanActionTarget } from "@/components/ScanActionDialog"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type Paginated<T> = {
  results: T[]
}

type FolderNode = {
  id: string
  name: string
  description?: string | null
  full_path: string
  children?: FolderNode[]
}

type ProductListItem = {
  id: string
  name: string
  description?: string | null
  folder?: string | null
  folder_name?: string | null
}

type ProductCreatePayload = {
  name: string
  description?: string | null
  folder: string
}

type FolderCreatePayload = {
  name: string
  parent?: string | null
}

type BomRow = {
  id: string
  template?: string
  component?: string | null
  component_name?: string | null
  component_kicad_footprint?: string | null
  component_detail?: {
    id: string
    name: string
    description?: string | null
    primary_image_url?: string | null
    category?: {
      id: string
      name: string
    } | null
  } | null
  source_type: "imported" | "manual"
  ref_group?: string | null
  refs: string[]
  qty_per_board: number
  qty_override_total?: string | number | null
  value?: string | null
  footprint?: string | null
  datasheet?: string | null
  bom_description?: string | null
  dnp: boolean
  exclude_from_bom: boolean
  needs_review: boolean
  import_snapshot?: Record<string, unknown> | null
  sourced_total?: string | number | null
  placed_total?: string | number | null
  scans?: BomRowScan[]
  _grouped?: boolean
  _valueMismatch?: boolean
  _footprintMismatch?: boolean
  _bomDescriptionMismatch?: boolean
  _groupedLineIds?: string[]
}

type BomRowScan = {
  id: string
  mode: "sourced" | "placed"
  barcode: string
  resolved_component?: string | null
  resolved_packet_id?: string | null
  qty?: string | number | null
  created_at: string
}

type ScanMode = "FIND" | "SOURCED" | "PLACED"

type ScanRequestPayload = {
  mode: ScanMode
  barcode: string
  decision?: string
  line_id?: string
  qty?: number
}

type ScanResponse = {
  result?: string
  line_id?: string
  message?: string
  scan_id?: string
  sourced_total?: number
  placed_total?: number
  mode?: ScanMode
  resolved_component?: {
    id: string
    name: string
  }
}

type BomItem = {
  id: string
  production: string
  name: string
  description?: string | null
  series_kind?: "template" | "working"
  source_template?: string | null
  status: "draft" | "in_progress" | "locked"
  qty_planned: number
  planned_date?: string | null
  source_url?: string | null
  source_hash?: string | null
  source_file_url?: string | null
  source_imported_at?: string | null
  ibom_url?: string | null
  ibom_file_url?: string | null
  ibom_updated_at?: string | null
  components_count?: number
  components?: BomRow[]
  created_at: string
}

type ProductDetail = {
  id: string
  name: string
  description?: string | null
  folder?: string | null
  templates: BomItem[]
}

type AvailabilityRow = {
  id: string
  ref_group?: string | null
  value?: string | null
  footprint?: string | null
  dnp: boolean
  exclude_from_bom: boolean
  linked_component?: string | null
  linked_component_name?: string | null
  needed_total: number
  in_stock: number
  total_quantity?: number
  total_in_home?: number
  locations: Array<{
    packet_id: string
    location: string
    quantity: number
    in_home?: boolean
  }>
  shortage: boolean
  unlinked: boolean
}

type AvailabilityResponse = {
  bom_id: string
  qty_planned: number
  home_location_full_path?: string | null
  rows: AvailabilityRow[]
}

type TabKey = "bom" | "production" | "finalize"

type LinkSheetTarget = {
  lineId: string
  value: string
  footprint: string
  refs: string[]
}

type RefAssignTarget = {
  title: string
  componentId: string
  componentName: string
  lineId: string
  refs: string[]
  selected: string[]
  // When present, the user may pick which line's refs to reassign (replace flow).
  lineOptions?: { id: string; label: string; refs: string[] }[]
}

type PacketSheetTarget = {
  lineId?: string
  mode: "SOURCED" | "PLACED"
  componentId?: string
  componentName?: string
  lineProgress?: PacketLineProgress | null
  browseMode?: boolean
  initialSearch?: string
}

type ScannerRow = BomRow & {
  needed: number
  sourced: number
  placed: number
  scans: BomRowScan[]
}


type PendingNotInBomConfirmation = {
  mode: ScanMode
  barcode: string
  componentName?: string | null
  componentId?: string | null
}

type ReservationSource = {
  type: string
  bom_id?: string
  line_id?: string
  product_id?: string
}

type Reservation = {
  id: string
  component_id: string
  component_name: string
  quantity: number
  priority?: number | null
  description?: string | null
  sources?: ReservationSource[] | null
  reserved_by?: string | null
  reservation_date: string
  created_at: string
}

const unwrap = <T,>(data: T[] | Paginated<T> | undefined): T[] => {
  if (!data) return []
  return Array.isArray(data) ? data : data.results || []
}

const statusBadgeClass = (status: string) => {
  if (status === "locked") return "bg-rose-100 text-rose-800"
  if (status === "in_progress") return "bg-amber-100 text-amber-800"
  return "bg-emerald-100 text-emerald-800"
}

const seriesKindBadgeClass = (seriesKind?: BomItem["series_kind"]) => {
  if (seriesKind === "template") return "bg-sky-100 text-sky-800"
  return "bg-violet-100 text-violet-800"
}

type SeriesTreeNode = {
  bom: BomItem
  children: SeriesTreeNode[]
}

const sortSeriesBoms = (items: BomItem[]) =>
  items.slice().sort((a, b) => {
    const kindOrder = (bom: BomItem) => (bom.series_kind === "template" ? 0 : 1)
    const kindDiff = kindOrder(a) - kindOrder(b)
    if (kindDiff !== 0) return kindDiff
    return (b.planned_date || b.created_at || "").localeCompare(a.planned_date || a.created_at || "")
  })

const buildSeriesTree = (templates: BomItem[]): SeriesTreeNode[] => {
  const byId = new Map(templates.map((item) => [item.id, item]))
  const childrenByParent = new Map<string, BomItem[]>()
  const roots: BomItem[] = []

  for (const bom of templates) {
    const parentId = bom.source_template
    if (parentId && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) || []
      siblings.push(bom)
      childrenByParent.set(parentId, siblings)
      continue
    }
    roots.push(bom)
  }

  const toNode = (bom: BomItem): SeriesTreeNode => ({
    bom,
    children: sortSeriesBoms(childrenByParent.get(bom.id) || []).map(toNode),
  })

  return sortSeriesBoms(roots).map(toNode)
}

const lineBadge = (line: BomRow) => {
  if (line.source_type === "manual") return "Manual"
  const snapshot = line.import_snapshot || {}
  const changed =
    String((snapshot as Record<string, unknown>).value ?? "") !== String(line.value ?? "") ||
    String((snapshot as Record<string, unknown>).footprint ?? "") !== String(line.footprint ?? "") ||
    String((snapshot as Record<string, unknown>).bom_description ?? "") !== String(line.bom_description ?? "") ||
    String((snapshot as Record<string, unknown>).datasheet ?? "") !== String(line.datasheet ?? "") ||
    Boolean((snapshot as Record<string, unknown>).dnp) !== Boolean(line.dnp) ||
    Boolean((snapshot as Record<string, unknown>).exclude_from_bom) !== Boolean(line.exclude_from_bom)
  return changed ? "Modified" : "Imported"
}

const toNumber = (value: string | number | null | undefined) => {
  if (value == null) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toSameOriginS3Url = (value: string | null | undefined) => {
  if (!value) return null
  if (typeof window === "undefined") return value
  try {
    const parsed = new URL(value, window.location.origin)
    const isLocalMinio =
      (parsed.hostname === "localhost" || parsed.hostname === window.location.hostname) &&
      parsed.port === "9003"
    if (isLocalMinio) {
      return `/s3${parsed.pathname}${parsed.search}${parsed.hash}`
    }
    return value
  } catch {
    return value
  }
}

const formatQty = (value: number) => {
  if (!Number.isFinite(value)) return "0"
  if (Math.abs(value - Math.round(value)) < 0.000001) {
    return String(Math.round(value))
  }
  return value.toFixed(2).replace(/\.?0+$/, "")
}

const serializeBooleanMap = (refs: Record<string, boolean>) =>
  Object.keys(refs)
    .sort()
    .map((ref) => `${ref}:${refs[ref] ? "1" : "0"}`)
    .join("|")

type ProgressSegments = {
  needed: number
  sourcedSegment: number
  placedSegment: number
  emptySegment: number
  sourcedOverflow: number
  placedOverflow: number
  sourcedPct: number
  placedPct: number
  emptyPct: number
}

const buildProgressSegments = (neededRaw: number, sourcedRaw: number, placedRaw: number): ProgressSegments => {
  const needed = Math.max(0, neededRaw)
  if (needed <= 0) {
    return {
      needed: 0,
      sourcedSegment: 0,
      placedSegment: 0,
      emptySegment: 0,
      sourcedOverflow: Math.max(sourcedRaw, 0),
      placedOverflow: Math.max(placedRaw, 0),
      sourcedPct: 0,
      placedPct: 0,
      emptyPct: 0,
    }
  }

  const placedSegment = Math.min(Math.max(placedRaw, 0), needed)
  const sourcedOnly = Math.max(sourcedRaw - placedRaw, 0)
  const sourcedSegment = Math.min(sourcedOnly, Math.max(needed - placedSegment, 0))
  const emptySegment = Math.max(needed - placedSegment - sourcedSegment, 0)
  const sourcedOverflow = Math.max(sourcedRaw - needed, 0)
  const placedOverflow = Math.max(placedRaw - needed, 0)

  return {
    needed,
    sourcedSegment,
    placedSegment,
    emptySegment,
    sourcedOverflow,
    placedOverflow,
    sourcedPct: (sourcedSegment / needed) * 100,
    placedPct: (placedSegment / needed) * 100,
    emptyPct: (emptySegment / needed) * 100,
  }
}

const flattenFolders = (nodes: FolderNode[], depth = 0): Array<{ id: string; label: string }> => {
  const rows: Array<{ id: string; label: string }> = []
  nodes.forEach((node) => {
    rows.push({ id: node.id, label: `${"  ".repeat(depth)}${node.name}` })
    if (node.children?.length) {
      rows.push(...flattenFolders(node.children, depth + 1))
    }
  })
  return rows
}

type ProductionPageProps = {
  mode?: "overview" | "bom"
}

export function ProductionPage({ mode = "overview" }: ProductionPageProps) {
  const { productId, bomId } = useParams<{ productId: string; bomId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isBomView = mode === "bom"

  const [activeTab, setActiveTab] = useState<TabKey>("bom")
  const [hideDnp, setHideDnp] = useState(true)
  const [hideExcluded, setHideExcluded] = useState(true)
  const [groupedView, setGroupedView] = useState(true)
  const [groupByComponent, setGroupByComponent] = useState(false)
  const [autoSyncIbomCompletion, setAutoSyncIbomCompletion] = useState(true)
  const [followIbomHover, setFollowIbomHover] = useState(true)
  const [importMode, setImportMode] = useState<"replace" | "merge">("replace")
  const [sourceUrlInput, setSourceUrlInput] = useState("")
  const [ibomUrlInput, setIbomUrlInput] = useState("")
  const [scannerMode, setScannerMode] = useState<ScanMode>("FIND")
  const [scanInput, setScanInput] = useState("")
  const [highlightedLineId, setHighlightedLineId] = useState<string | null>(null)
  const [newBomName, setNewBomName] = useState("")
  const [newBomQty, setNewBomQty] = useState("1")
  const [newBomDate, setNewBomDate] = useState("")
  const [seriesProductId, setSeriesProductId] = useState("")
  const [newProductName, setNewProductName] = useState("")
  const [newProductDescription, setNewProductDescription] = useState("")
  const [newProductFolder, setNewProductFolder] = useState("")
  const [newFolderName, setNewFolderName] = useState("")
  const [newFolderParent, setNewFolderParent] = useState("")
  const [newLineValue, setNewLineValue] = useState("")
  const [newLineFootprint, setNewLineFootprint] = useState("")
  const [newLineQty, setNewLineQty] = useState("1")
  const [actualUsed, setActualUsed] = useState<Record<string, string>>({})
  const [linkSheetOpen, setLinkSheetOpen] = useState(false)
  const [linkSheetTarget, setLinkSheetTarget] = useState<LinkSheetTarget | null>(null)
  const [refAssignTarget, setRefAssignTarget] = useState<RefAssignTarget | null>(null)
  const [packetSheetOpen, setPacketSheetOpen] = useState(false)
  const [packetSheetTarget, setPacketSheetTarget] = useState<PacketSheetTarget | null>(null)
  const [showBomDetails, setShowBomDetails] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [showCreateProduction, setShowCreateProduction] = useState(false)
  const [showCreateSeries, setShowCreateSeries] = useState(false)
  const [ibomPanelOpen, setIbomPanelOpen] = useState(false)
  const [ibomSectionOpen, setIbomSectionOpen] = useState(false)
  const [quickPlaceQtyByScan, setQuickPlaceQtyByScan] = useState<Record<string, string>>({})
  const [scanActionTarget, setScanActionTarget] = useState<ScanActionTarget | null>(null)
  const [pendingNotInBomConfirmation, setPendingNotInBomConfirmation] = useState<PendingNotInBomConfirmation | null>(null)
  const scanInputRef = useRef<HTMLInputElement>(null)
  const lastScannerEventRef = useRef<{ text: string; ts: number } | null>(null)
  const scannerRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const lastHoveredIbomLineRef = useRef<string | null>(null)
  const lastIbomCompletionSyncRef = useRef<string>("")

  const { data: folders = [], isLoading: foldersLoading } = useQuery<FolderNode[]>({
    queryKey: ["production-folders-tree"],
    queryFn: () => apiFetch<FolderNode[]>("/api/v1/production/folders/tree/"),
  })

  const { data: productsRaw, isLoading: productsLoading } = useQuery<ProductListItem[] | Paginated<ProductListItem>>({
    queryKey: ["production-products"],
    queryFn: () => apiFetch<ProductListItem[] | Paginated<ProductListItem>>("/api/v1/production/productions/?page_size=1000"),
  })

  const products = unwrap(productsRaw)

  useEffect(() => {
    if (!productId && products.length > 0) {
      navigate(`/production/${products[0].id}`, { replace: true })
    }
  }, [productId, products, navigate])

  useEffect(() => {
    if (productId) {
      setSeriesProductId(productId)
      return
    }
    if (!seriesProductId && products.length > 0) {
      setSeriesProductId(products[0].id)
    }
  }, [productId, products, seriesProductId])

  const { data: productDetail, isLoading: productDetailLoading } = useQuery<ProductDetail>({
    queryKey: ["production-product", productId],
    queryFn: () => apiFetch<ProductDetail>(`/api/v1/production/productions/${productId}/`),
    enabled: !!productId,
  })

  const seriesTree = useMemo(() => buildSeriesTree(productDetail?.templates || []), [productDetail?.templates])

  const selectedBomFromProduct = useMemo(() => {
    if (!bomId || !productDetail) return null
    return productDetail.templates.find((item) => item.id === bomId) || null
  }, [bomId, productDetail])

  const { data: bomDetail, isLoading: bomDetailLoading } = useQuery<BomItem>({
    queryKey: ["production-bom", bomId],
    queryFn: () => apiFetch<BomItem>(`/api/v1/production/templates/${bomId}/`),
    enabled: isBomView && !!bomId,
  })

  const selectedBom = bomDetail || selectedBomFromProduct
  const isTemplateSeries = selectedBom?.series_kind === "template"
  const selectedBomComponents = useMemo(() => {
    return Array.isArray(selectedBom?.components) ? selectedBom.components : []
  }, [selectedBom?.components])
  const canImportNetlist = isTemplateSeries || selectedBomComponents.length === 0
  const resolvedSourceUrl = useMemo(() => {
    return (sourceUrlInput.trim() || selectedBom?.source_url?.trim() || "")
  }, [selectedBom?.source_url, sourceUrlInput])
  const canImportNetlistFromUrl = canImportNetlist && !!resolvedSourceUrl
  const ibomViewUrl = useMemo(() => {
    return toSameOriginS3Url(selectedBom?.ibom_file_url || selectedBom?.ibom_url || null)
  }, [selectedBom?.ibom_file_url, selectedBom?.ibom_url])

  const { highlightInIbom, sendBarcodeScan, syncIbomState, ibomConnected, highlightedRefs } = useIbomBridge(
    isBomView && bomId ? bomId : null,
  )

  const ibomIframeSrc = useMemo(() => {
    if (!ibomViewUrl) return null
    const url = new URL(ibomViewUrl, window.location.origin)
    const client = getRealtimeClient()
    const sid = client.getStationId()
    const tok = tokenStorage.getToken()
    if (sid) url.searchParams.set("station_id", sid)
    if (tok) url.searchParams.set("token", tok)
    url.searchParams.set("api_host", window.location.host)
    if (bomId) url.searchParams.set("template_id", bomId)
    return url.toString()
  }, [ibomViewUrl, bomId])
  const openIbomInNewTab = useCallback(() => {
    if (!ibomIframeSrc) return
    // Try PWA-safe handoff first.
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer")
    if (popup) {
      popup.location.replace(ibomIframeSrc)
      return
    }

    // Fallback for stricter popup blockers.
    if (!document.body) {
      window.open(ibomIframeSrc, "_blank", "noopener,noreferrer")
      return
    }
    const link = document.createElement("a")
    link.href = ibomIframeSrc
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [ibomIframeSrc])
  const headerSeriesDate = useMemo(() => {
    if (!selectedBom?.created_at) return null
    const date = new Date(selectedBom.created_at)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString()
  }, [selectedBom?.created_at])

  const { data: availabilityData } = useQuery<AvailabilityResponse>({
    queryKey: ["production-availability", bomId],
    queryFn: () => apiFetch<AvailabilityResponse>(`/api/v1/production/templates/${bomId}/availability/`),
    enabled: isBomView && !!bomId,
  })

  const { data: reservationsData } = useQuery<Reservation[] | { results: Reservation[] }>({
    queryKey: ["reservations", "bom", bomId],
    queryFn: () =>
      apiFetch<Reservation[] | { results: Reservation[] }>(
        `/api/v1/store/reservations/?page_size=500&source_type=production&bom_id=${bomId}`,
      ),
    enabled: isBomView && !!bomId,
  })

  const allReservations = useMemo(() => {
    const raw = reservationsData
    if (!raw) return []
    return Array.isArray(raw) ? raw : raw.results || []
  }, [reservationsData])

  const reservationsForBom = useMemo(() => {
    if (!bomId) return []
    return allReservations.filter((r) =>
      (r.sources || []).some(
        (s) => s && s.type === "production" && s.bom_id === bomId,
      ),
    )
  }, [bomId, allReservations])


  useEffect(() => {
    if (!selectedBom) {
      setSourceUrlInput("")
      setIbomUrlInput("")
      setActualUsed({})
      setQuickPlaceQtyByScan({})
      return
    }
    setSourceUrlInput(selectedBom.source_url || "")
    setIbomUrlInput(selectedBom.ibom_url || "")

    const initialActual: Record<string, string> = {}
    selectedBomComponents.forEach((line) => {
      if (line.dnp) return
      const needed =
        line.qty_override_total != null
          ? toNumber(line.qty_override_total)
          : toNumber(line.qty_per_board) * toNumber(selectedBom.qty_planned)
      const placed = toNumber(line.placed_total)
      const sourced = toNumber(line.sourced_total)
      // Reflect real production progress: deduct what was placed, else what was
      // sourced (pulled from stock), else fall back to the BOM needed total.
      initialActual[line.id] = String(placed > 0 ? placed : sourced > 0 ? sourced : needed)
    })
    setActualUsed(initialActual)
    setQuickPlaceQtyByScan({})
  }, [selectedBom?.id, selectedBomComponents])

  useEffect(() => {
    if (activeTab === "production") {
      const handle = window.setTimeout(() => {
        scanInputRef.current?.focus()
      }, 80)
      return () => window.clearTimeout(handle)
    }
    return undefined
  }, [activeTab, scannerMode, selectedBom?.id])

  useEffect(() => {
    if (isBomView) {
      setShowBomDetails(false)
    }
  }, [isBomView, bomId])

  useEffect(() => {
    if (isTemplateSeries && (activeTab === "production" || activeTab === "finalize")) {
      setActiveTab("bom")
    }
  }, [activeTab, isTemplateSeries])

  const updateProductMutation = useMutation({
    mutationFn: (payload: Partial<ProductDetail>) =>
      apiFetch(`/api/v1/production/productions/${productId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-products"] })
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
      toast.success("Product updated.")
    },
    onError: () => toast.error("Failed to update product."),
  })

  const createProductMutation = useMutation({
    mutationFn: () =>
      apiFetch<ProductDetail>("/api/v1/production/productions/", {
        method: "POST",
        body: JSON.stringify({
          name: newProductName.trim(),
          description: newProductDescription.trim() || null,
          folder: newProductFolder,
        } satisfies ProductCreatePayload),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["production-products"] })
      queryClient.invalidateQueries({ queryKey: ["production-folders-tree"] })
      setNewProductName("")
      setNewProductDescription("")
      toast.success("Production created.")
      navigate(`/production/${created.id}`)
    },
    onError: () => toast.error("Failed to create production."),
  })

  const createFolderMutation = useMutation({
    mutationFn: () =>
      apiFetch<FolderNode>("/api/v1/production/folders/", {
        method: "POST",
        body: JSON.stringify({
          name: newFolderName.trim(),
          parent: newFolderParent || null,
        } satisfies FolderCreatePayload),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["production-folders-tree"] })
      setNewFolderName("")
      setNewFolderParent("")
      setNewProductFolder(created.id)
      toast.success("Folder created.")
    },
    onError: () => toast.error("Failed to create folder."),
  })

  const createBomMutation = useMutation({
    mutationFn: ({ productionId }: { productionId: string }) =>
      apiFetch<BomItem>("/api/v1/production/templates/", {
        method: "POST",
        body: JSON.stringify({
          production: productionId,
          name: newBomName.trim() || "New BOM",
          description: "",
          status: "draft",
          qty_planned: Math.max(1, Number(newBomQty) || 1),
          planned_date: newBomDate || null,
        }),
      }),
    onSuccess: (created, variables) => {
      queryClient.invalidateQueries({ queryKey: ["production-product", variables.productionId] })
      setNewBomName("")
      setNewBomQty("1")
      setNewBomDate("")
      toast.success("BOM created.")
      navigate(`/production/${variables.productionId}/bom/${created.id}`)
    },
    onError: () => toast.error("Failed to create BOM."),
  })

  const duplicateBomMutation = useMutation({
    mutationFn: (targetBomId: string) =>
      apiFetch<BomItem>(`/api/v1/production/templates/${targetBomId}/duplicate/`, {
        method: "POST",
      }),
    onSuccess: (created, targetBomId) => {
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
      const sourceBom = productDetail?.templates.find((item) => item.id === targetBomId)
      toast.success(
        sourceBom?.series_kind === "template" ? "Working series created from template." : "BOM duplicated.",
      )
      if (productId) {
        navigate(`/production/${productId}/bom/${created.id}`)
      }
    },
    onError: () => toast.error("Failed to duplicate BOM."),
  })

  const lockBomMutation = useMutation({
    mutationFn: (targetBomId: string) =>
      apiFetch(`/api/v1/production/templates/${targetBomId}/lock/`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      toast.success("BOM locked.")
    },
    onError: () => toast.error("Failed to lock BOM."),
  })

  const updateBomMutation = useMutation({
    mutationFn: (payload: Partial<BomItem>) =>
      apiFetch(`/api/v1/production/templates/${bomId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
      toast.success("BOM updated.")
    },
    onError: () => toast.error("Failed to update BOM."),
  })

  const updateLineMutation = useMutation({
    mutationFn: ({ lineId, payload }: { lineId: string; payload: Record<string, unknown> }) =>
      apiFetch(`/api/v1/production/template-components/${lineId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
    },
    onError: () => toast.error("Failed to update BOM line."),
  })

  const setComponentMutation = useMutation({
    mutationFn: ({ lineId, component, refs }: { lineId: string; component: string; refs?: string[] }) =>
      apiFetch<{ merged?: boolean }>(`/api/v1/production/template-components/${lineId}/set-component/`, {
        method: "POST",
        body: JSON.stringify({ component, ...(refs ? { refs } : {}) }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
      toast.success(data?.merged ? "Component set and merged with existing line." : "Component updated.")
    },
    onError: () => toast.error("Failed to set component."),
  })

  const deleteLineMutation = useMutation({
    mutationFn: (lineId: string) =>
      apiFetch(`/api/v1/production/template-components/${lineId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
      toast.success("BOM line removed.")
    },
    onError: () => toast.error("Failed to remove BOM line."),
  })

  const invalidateReservations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["reservations"] })
    queryClient.invalidateQueries({ queryKey: ["reservations", "bom", bomId] })
  }, [queryClient, bomId])

  const reserveBomMutation = useMutation({
    mutationFn: async (items: Array<{ component_id: string; quantity: number; lineId: string }>) => {
      await Promise.all(
        items.map(({ component_id, quantity, lineId }) =>
          apiFetch<Reservation>("/api/v1/store/reservations/", {
            method: "POST",
            body: JSON.stringify({
              component_id,
              quantity,
              priority: 3,
              sources: [
                {
                  type: "production",
                  bom_id: bomId,
                  line_id: lineId,
                  product_id: productId || undefined,
                },
              ],
            }),
          }),
        ),
      )
    },
    onSuccess: (_, items) => {
      invalidateReservations()
      toast.success(`BOM reserved (${items.length} item${items.length === 1 ? "" : "s"}).`)
    },
    onError: () => toast.error("Failed to reserve BOM."),
  })

  const unreserveBomMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/v1/store/reservation/${id}/`, { method: "DELETE" }),
        ),
      )
    },
    onSuccess: (_, ids) => {
      invalidateReservations()
      toast.success(`BOM unreserved (${ids.length} item${ids.length === 1 ? "" : "s"} removed).`)
    },
    onError: () => toast.error("Failed to unreserve BOM."),
  })

  const addLineMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/v1/production/template-components/", {
        method: "POST",
        body: JSON.stringify({
          template: bomId,
          source_type: "manual",
          value: newLineValue.trim(),
          footprint: newLineFootprint.trim(),
          qty_per_board: Math.max(1, Number(newLineQty) || 1),
          dnp: false,
          refs: [],
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      toast.success("Manual line added.")
      setNewLineValue("")
      setNewLineFootprint("")
      setNewLineQty("1")
    },
    onError: () => toast.error("Failed to add manual line."),
  })

  const handleImportSuccess = useCallback(
    (response?: { working_copy_id?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
      if (response?.working_copy_id && productId) {
        toast.success("Template series created. Opening working series.")
        navigate(`/production/${productId}/bom/${response.working_copy_id}`)
        return
      }
      toast.success("Netlist imported into template series.")
    },
    [bomId, navigate, productId, queryClient],
  )

  const importFileMutation = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const data = new FormData()
      data.append("file", file)
      data.append("mode", importMode)
      if (sourceUrlInput.trim()) {
        data.append("source_url", sourceUrlInput.trim())
      }
      return apiFetch<{ working_copy_id?: string }>(`/api/v1/production/templates/${bomId}/import-bom/`, {
        method: "POST",
        body: data,
      })
    },
    onSuccess: handleImportSuccess,
    onError: () => toast.error("Netlist import failed."),
  })

  const importUrlMutation = useMutation({
    mutationFn: (sourceUrl?: string) =>
      apiFetch<{ changed?: boolean; message?: string; working_copy_id?: string }>(
        `/api/v1/production/templates/${bomId}/import-url/`,
        {
          method: "POST",
          body: JSON.stringify({ source_url: (sourceUrl || sourceUrlInput).trim(), mode: importMode }),
        },
      ),
    onSuccess: (response) => {
      if (response?.changed === false) {
        toast.success(response.message || "No changes detected")
        return
      }
      handleImportSuccess(response)
    },
    onError: () => toast.error("Import from URL failed."),
  })

  const reImportMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ changed?: boolean; message?: string }>(`/api/v1/production/templates/${bomId}/re-import/`, {
        method: "POST",
        body: JSON.stringify({ mode: importMode }),
      }),
    onSuccess: (response: { changed?: boolean; message?: string }) => {
      if (response?.changed === false) {
        toast.success(response.message || "No changes detected")
      } else {
        toast.success("BOM re-import completed.")
      }
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
    },
    onError: () => toast.error("Re-import failed."),
  })

  const setIbomMutation = useMutation({
    mutationFn: async ({ file }: { file: File | null }) => {
      const data = new FormData()
      if (ibomUrlInput.trim()) {
        data.append("ibom_url", ibomUrlInput.trim())
      }
      if (file) {
        data.append("ibom_file", file)
      }
      return apiFetch(`/api/v1/production/templates/${bomId}/ibom/`, {
        method: "POST",
        body: data,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      toast.success("iBOM updated.")
    },
    onError: () => toast.error("Failed to update iBOM."),
  })

  const scanLookupMutation = useMutation({
    mutationFn: (payload: ScanRequestPayload) =>
      apiFetch<ScanResponse>(`/api/v1/production/templates/${bomId}/scan/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  })

  const scanCommitMutation = useMutation({
    mutationFn: (payload: ScanRequestPayload) =>
      apiFetch<ScanResponse>(`/api/v1/production/templates/${bomId}/scan/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  })

  const manualPacketMutation = useMutation({
    mutationFn: (payload: { mode: "SOURCED" | "PLACED"; barcode: string; line_id: string; qty: number }) =>
      apiFetch<{ result?: string; line_id?: string }>(`/api/v1/production/templates/${bomId}/scan/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (response: { result?: string; line_id?: string }) => {
      if (response.line_id) {
        setHighlightedLineId(response.line_id)
      }
      toast.success("Progress saved.")
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
    },
    onError: () => toast.error("Failed to save progress."),
  })

  const removeScanMutation = useMutation({
    mutationFn: (scanId: string) =>
      apiFetch<{ success?: boolean }>(`/api/v1/production/templates/${bomId}/remove-scan/`, {
        method: "POST",
        body: JSON.stringify({ scan_id: scanId }),
      }),
    onSuccess: () => {
      toast.success("Scan removed.")
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
    },
    onError: () => toast.error("Failed to remove scan."),
  })

  const undoMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/production/templates/${bomId}/undo-last-scan/`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      toast.success("Last scan undone.")
    },
    onError: () => toast.error("Unable to undo scan."),
  })

  const finalizeMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/production/templates/${bomId}/finalize/`, {
        method: "POST",
        body: JSON.stringify({ actual_used: actualUsed }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
      queryClient.invalidateQueries({ queryKey: ["production-product", productId] })
      queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
      toast.success("Finalize completed and BOM locked.")
    },
    onError: (error) => {
      const data = (error as { data?: unknown }).data as { error?: string; details?: string[] } | undefined
      const details = Array.isArray(data?.details) ? data.details.join("; ") : data?.error
      toast.error(details ? `Finalize failed: ${details}` : "Finalize failed.")
    },
  })

  const printMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ print_queue_name?: string }>(`/api/v1/production/templates/${bomId}/print-a4/`, {
        method: "POST",
        body: JSON.stringify({ include_dnp: false }),
      }),
    onSuccess: (response) => {
      toast.success(`A4 document added to print queue${response?.print_queue_name ? `: ${response.print_queue_name}` : ""}.`)
    },
    onError: () => toast.error("Failed to enqueue A4 print document."),
  })

  const productsByFolder = useMemo(() => {
    const grouped = new Map<string, ProductListItem[]>()
    products.forEach((product) => {
      const folderKey = product.folder || "__root__"
      const list = grouped.get(folderKey) || []
      list.push(product)
      grouped.set(folderKey, list)
    })
    grouped.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)))
    return grouped
  }, [products])

  const renderFolderTree = (nodes: FolderNode[], depth = 0): JSX.Element[] => {
    const result: JSX.Element[] = []
    nodes.forEach((folder) => {
      result.push(
        <div key={`folder-${folder.id}`} className="space-y-1">
          <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground" style={{ marginLeft: depth * 12 }}>
            {folder.name}
          </div>
          {(productsByFolder.get(folder.id) || []).map((product) => (
            <button
              key={product.id}
              type="button"
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                productId === product.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
              )}
              style={{ marginLeft: depth * 12 + 8 }}
              onClick={() => navigate(`/production/${product.id}`)}
            >
              {product.name}
            </button>
          ))}
          {folder.children?.length ? renderFolderTree(folder.children, depth + 1) : null}
        </div>,
      )
    })
    return result
  }

  const rootProducts = productsByFolder.get("__root__") || []
  const flatFolderOptions = useMemo(() => flattenFolders(folders), [folders])

  const groupedRows = useMemo(() => {
    if (!selectedBom) return []
    let rows = [...selectedBomComponents]
    if (hideDnp) {
      rows = rows.filter((line) => !line.dnp)
    }
    if (hideExcluded) {
      rows = rows.filter((line) => !line.exclude_from_bom)
    }

    if (groupByComponent) {
      const byComponent = new Map<string | null, BomRow[]>()
      for (const line of rows) {
        const key = line.component || null
        const group = byComponent.get(key) || []
        group.push(line)
        byComponent.set(key, group)
      }

      const aggregated: BomRow[] = []
      for (const [componentId, group] of byComponent.entries()) {
        if (!componentId || group.length === 1) {
          aggregated.push(...group)
          continue
        }

        const allRefs = group.flatMap((line) => line.refs || [])
        const refGroups = group.map((line) => line.ref_group).filter(Boolean) as string[]
        const allValues = new Set(group.map((line) => line.value).filter(Boolean))
        const allFootprints = new Set(group.map((line) => line.footprint).filter(Boolean))
        const allDescriptions = new Set(group.map((line) => line.bom_description).filter(Boolean))
        const allSources = new Set(group.map((line) => line.source_type))

        const qtyPerBoard = group.reduce((sum, line) => sum + toNumber(line.qty_per_board), 0)
        const neededTotal = group.reduce(
          (sum, line) =>
            sum +
            (line.qty_override_total != null
              ? toNumber(line.qty_override_total)
              : toNumber(line.qty_per_board) * toNumber(selectedBom.qty_planned)),
          0,
        )

        const first = group[0]
        aggregated.push({
          ...first,
          id: first.id,
          refs: [...new Set(allRefs)].sort(),
          ref_group: refGroups.join(", ") || null,
          qty_per_board: qtyPerBoard,
          qty_override_total: neededTotal,
          value: allValues.size === 1 ? first.value : `(${allValues.size} values)`,
          footprint: allFootprints.size === 1 ? first.footprint : `(${allFootprints.size} footprints)`,
          bom_description: allDescriptions.size === 1 ? first.bom_description : null,
          dnp: group.some((line) => line.dnp),
          exclude_from_bom: group.some((line) => line.exclude_from_bom),
          needs_review: group.some((line) => line.needs_review),
          source_type: allSources.size === 1 ? first.source_type : "manual",
          import_snapshot: first.import_snapshot,
          component_detail: first.component_detail,
          component_name: first.component_name,
          component_kicad_footprint: first.component_kicad_footprint,
          _grouped: true,
          _valueMismatch: allValues.size > 1,
          _footprintMismatch: allFootprints.size > 1,
          _bomDescriptionMismatch: allDescriptions.size > 1,
          _groupedLineIds: group.map((line) => line.id),
        } as BomRow)
      }

      aggregated.sort((a, b) => {
        const nameA = a.component_name || a.value || ""
        const nameB = b.component_name || b.value || ""
        return nameA.localeCompare(nameB)
      })
      return aggregated
    }

    rows.sort((a, b) => {
      const pa = `${a.footprint || ""}|${a.value || ""}|${a.ref_group || ""}`
      const pb = `${b.footprint || ""}|${b.value || ""}|${b.ref_group || ""}`
      return pa.localeCompare(pb)
    })
    return rows
  }, [selectedBom, selectedBomComponents, hideDnp, hideExcluded, groupByComponent])

  const ungroupedRows = useMemo(() => {
    return groupedRows.flatMap((line) => {
      if (!line.refs || line.refs.length === 0) {
        return [{ ...line, ref_single: line.ref_group || "-" }]
      }
      return [...line.refs].sort().map((ref) => ({ ...line, ref_single: ref }))
    }) as Array<BomRow & { ref_single: string }>
  }, [groupedRows])

  const availabilityByLineId = useMemo(() => {
    const map = new Map<string, AvailabilityRow>()
    ;(availabilityData?.rows || []).forEach((row) => {
      map.set(row.id, row)
    })
    return map
  }, [availabilityData?.rows])


  const scannerRows = useMemo<ScannerRow[]>(() => {
    if (!selectedBom) return []
    return selectedBomComponents
      .filter((line) => !line.dnp)
      .map((line) => {
        const needed =
          line.qty_override_total != null
            ? toNumber(line.qty_override_total)
            : toNumber(line.qty_per_board) * toNumber(selectedBom.qty_planned)
        return {
          ...line,
          needed,
          sourced: toNumber(line.sourced_total),
          placed: toNumber(line.placed_total),
          scans: [...(line.scans || [])].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        }
      })
      .sort((a, b) => `${a.footprint || ""}|${a.value || ""}`.localeCompare(`${b.footprint || ""}|${b.value || ""}`))
  }, [selectedBom, selectedBomComponents])

  const assemblyProgress = useMemo(() => {
    let neededTotal = 0
    let sourcedTotal = 0
    let placedTotal = 0
    let emptyTotal = 0
    let sourcedOverflowTotal = 0
    let placedOverflowTotal = 0

    scannerRows.forEach((row) => {
      const segments = buildProgressSegments(toNumber(row.needed), toNumber(row.sourced), toNumber(row.placed))
      neededTotal += segments.needed
      sourcedTotal += segments.sourcedSegment
      placedTotal += segments.placedSegment
      emptyTotal += segments.emptySegment
      sourcedOverflowTotal += segments.sourcedOverflow
      placedOverflowTotal += segments.placedOverflow
    })

    if (neededTotal <= 0) {
      return {
        needed: 0,
        sourced: 0,
        placed: 0,
        sourcedOverflow: sourcedOverflowTotal,
        placedOverflow: placedOverflowTotal,
        sourcedPct: 0,
        placedPct: 0,
        emptyPct: 0,
      }
    }

    return {
      needed: neededTotal,
      sourced: sourcedTotal,
      placed: placedTotal,
      sourcedOverflow: sourcedOverflowTotal,
      placedOverflow: placedOverflowTotal,
      sourcedPct: (sourcedTotal / neededTotal) * 100,
      placedPct: (placedTotal / neededTotal) * 100,
      emptyPct: (emptyTotal / neededTotal) * 100,
    }
  }, [scannerRows])

  const ibomCompletionRefs = useMemo(() => {
    const sourced: Record<string, boolean> = {}
    const placed: Record<string, boolean> = {}

    scannerRows.forEach((row) => {
      const refs = Array.isArray(row.refs) ? row.refs : []
      if (refs.length === 0) return

      const needed = Math.max(0, toNumber(row.needed))
      const sourcedDone = needed > 0 && toNumber(row.sourced) >= needed
      const placedDone = needed > 0 && toNumber(row.placed) >= needed

      refs.forEach((ref) => {
        if (!ref) return
        sourced[ref] = sourcedDone
        placed[ref] = placedDone
      })
    })

    return { sourced, placed }
  }, [scannerRows])

  useEffect(() => {
    scannerRowRefs.current = {}
    lastHoveredIbomLineRef.current = null
    lastIbomCompletionSyncRef.current = ""
  }, [bomId])

  useEffect(() => {
    if (!ibomConnected) {
      lastIbomCompletionSyncRef.current = ""
    }
  }, [ibomConnected])

  useEffect(() => {
    if (!followIbomHover) {
      lastHoveredIbomLineRef.current = null
      return
    }
    if (!highlightedRefs || highlightedRefs.length === 0) return

    const refsSet = new Set(highlightedRefs)
    const matchedRow = scannerRows.find((row) => (row.refs || []).some((ref) => refsSet.has(ref)))
    if (!matchedRow) return

    setHighlightedLineId(matchedRow.id)
    if (lastHoveredIbomLineRef.current === matchedRow.id) return
    lastHoveredIbomLineRef.current = matchedRow.id

    const element = scannerRowRefs.current[matchedRow.id]
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" })
      element.focus({ preventScroll: true })
    }
  }, [followIbomHover, highlightedRefs, scannerRows])

  useEffect(() => {
    if (!autoSyncIbomCompletion || !ibomConnected || !bomId) return

    const sourcedSignature = serializeBooleanMap(ibomCompletionRefs.sourced)
    const placedSignature = serializeBooleanMap(ibomCompletionRefs.placed)
    const signature = `${bomId}|${sourcedSignature}|${placedSignature}`
    if (signature === lastIbomCompletionSyncRef.current) return

    const timer = window.setTimeout(() => {
      void syncIbomState(ibomCompletionRefs)
      lastIbomCompletionSyncRef.current = signature
    }, 400)
    return () => window.clearTimeout(timer)
  }, [autoSyncIbomCompletion, ibomConnected, bomId, ibomCompletionRefs, syncIbomState])

  const sendIbomHover = useCallback((refs: [string, number][] | null, rowid: string) => {
    getRealtimeClient().emit({
      type: IBOM_EVENT_TYPES.HOVER,
      payload: { refs, rowid, net: null },
    })
  }, [])

  const refreshScannerData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["production-bom", bomId] })
    queryClient.invalidateQueries({ queryKey: ["production-availability", bomId] })
  }, [bomId, queryClient])

  const refocusScanInput = useCallback(() => {
    window.setTimeout(() => scanInputRef.current?.focus(), 10)
  }, [])

  const focusScannedLine = useCallback(
    (lineId: string) => {
      setHighlightedLineId(lineId)
      const matchedRow = scannerRows.find((row) => row.id === lineId)
      const firstRef = matchedRow?.refs?.[0]
      if (firstRef && ibomConnected) {
        highlightInIbom(firstRef)
        sendBarcodeScan(firstRef, false)
      }

      const element = scannerRowRefs.current[lineId]
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" })
        element.focus({ preventScroll: true })
      }
    },
    [highlightInIbom, ibomConnected, scannerRows, sendBarcodeScan],
  )


  const openScanAction = useCallback(
    (lineId: string, barcode: string) => {
      const matchedRow = scannerRows.find((row) => row.id === lineId)
      focusScannedLine(lineId)
      setScanActionTarget({
        barcode,
        lineId,
        componentId: matchedRow?.component || null,
        componentName: matchedRow?.component_name || matchedRow?.value || "Component",
        lineRefLabel: matchedRow?.ref_group || (matchedRow?.refs?.length ? matchedRow.refs.join(", ") : "-"),
        lineValue: matchedRow?.value || matchedRow?.component_name || "-",
        needed: matchedRow ? Math.max(0, toNumber(matchedRow.needed)) : 0,
        sourced: matchedRow ? toNumber(matchedRow.sourced) : 0,
        placed: matchedRow ? toNumber(matchedRow.placed) : 0,
      })
      setScanInput("")
    },
    [focusScannedLine, scannerRows],
  )

  const handleConfirmNotInBom = useCallback(async () => {
    if (!pendingNotInBomConfirmation) return
    const target = pendingNotInBomConfirmation

    try {
      const addResponse = await scanLookupMutation.mutateAsync({
        mode: "FIND",
        barcode: target.barcode,
        decision: "add_to_bom",
      })

      setPendingNotInBomConfirmation(null)

      if (addResponse.result !== "found" || !addResponse.line_id) {
        toast.error("Failed to add component to BOM.")
        return
      }

      refreshScannerData()
      openScanAction(addResponse.line_id, target.barcode)
    } catch {
      toast.error("Scan failed.")
    }
  }, [openScanAction, pendingNotInBomConfirmation, refreshScannerData, scanLookupMutation])

  const executeScan = useCallback(
    async (_mode: ScanMode, rawBarcode: string, options?: { silentBlockedNotice?: boolean }) => {
      const barcode = rawBarcode.trim()
      if (!barcode) return
      if (scanActionTarget || pendingNotInBomConfirmation) {
        if (!options?.silentBlockedNotice) {
          toast.error("Confirm or cancel the current scan popup first.")
        }
        return
      }

      try {
        const lookup = await scanLookupMutation.mutateAsync({ mode: "FIND", barcode })
        if (lookup.result === "unknown_barcode") {
          toast.error("Unknown barcode.")
          return
        }
        if (lookup.result === "not_in_bom") {
          setPendingNotInBomConfirmation({
            mode: _mode,
            barcode,
            componentName: lookup.resolved_component?.name || null,
            componentId: lookup.resolved_component?.id || null,
          })
          return
        }
        if (lookup.result === "found" && lookup.line_id) {
          openScanAction(lookup.line_id, barcode)
          return
        }

        toast.error("Scan failed.")
      } catch {
        toast.error("Scan failed.")
      }
    },
    [openScanAction, pendingNotInBomConfirmation, scanActionTarget, scanLookupMutation],
  )

  const handleScanActionCommit = useCallback(
    async (operation: "SOURCED" | "PLACED", qty: number, barcode: string) => {
      if (!scanActionTarget) return
      try {
        const response = await scanCommitMutation.mutateAsync({
          mode: operation,
          barcode,
          line_id: scanActionTarget.lineId,
          qty,
        })
        setScanActionTarget(null)
        if (response.result === "unknown_barcode") {
          toast.error("Unknown barcode.")
          return
        }
        if (response.result === "not_in_bom") {
          toast.error("Scanned component is not in BOM.")
          return
        }
        if (response.line_id) {
          focusScannedLine(response.line_id)
        }
        toast.success("Scan saved.")
        refreshScannerData()
        refocusScanInput()
      } catch {
        toast.error("Scan failed.")
      }
    },
    [focusScannedLine, refreshScannerData, refocusScanInput, scanActionTarget, scanCommitMutation],
  )

  useEffect(() => {
    const unsubscribe = nextIO.on("scanner.data", (event) => {
      if (!isBomView || activeTab !== "production" || !bomId) {
        return
      }
      const payload = event.payload as { text?: string } | undefined
      const text = payload?.text?.trim()
      if (!text) {
        return
      }

      const now = Date.now()
      const last = lastScannerEventRef.current
      if (last && last.text === text && now - last.ts < 800) {
        return
      }
      lastScannerEventRef.current = { text, ts: now }

      void executeScan(scannerMode, text, { silentBlockedNotice: true })
    })

    return unsubscribe
  }, [activeTab, bomId, executeScan, isBomView, scannerMode])

  const handleImportFile = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    importFileMutation.mutate({ file })
    input.value = ""
  }

  const handleImportNetlistFromUrl = () => {
    if (!resolvedSourceUrl) {
      toast.error("Enter a source URL above or configure one on this BOM.")
      return
    }
    if (!canImportNetlist) {
      toast.error("Netlist import is only available on template series or empty series.")
      return
    }
    importUrlMutation.mutate(resolvedSourceUrl)
  }

  const handleScanSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!scanInput.trim()) return
    void executeScan(scannerMode, scanInput.trim())
  }

  const handleAddManualLine = () => {
    if (!newLineValue.trim()) {
      toast.error("Value is required for manual line.")
      return
    }
    addLineMutation.mutate()
  }

  const openLinkSheet = (line: BomRow) => {
    setLinkSheetTarget({
      lineId: line.id,
      value: line.value || "",
      footprint: line.footprint || "",
      refs: line.refs || [],
    })
    setLinkSheetOpen(true)
  }

  const handleLinkSelect = (component: SearchComponentItem) => {
    if (!linkSheetTarget) return
    const target = linkSheetTarget
    setLinkSheetOpen(false)
    setLinkSheetTarget(null)
    // Single (or no) ref → assign whole line directly (auto-merges on duplicate component).
    if (target.refs.length <= 1) {
      setComponentMutation.mutate({ lineId: target.lineId, component: component.id })
      return
    }
    // Multiple refs → let the user pick which references get the new component.
    setRefAssignTarget({
      title: `Assign ${component.name} to references`,
      componentId: component.id,
      componentName: component.name,
      lineId: target.lineId,
      refs: target.refs,
      selected: [...target.refs],
    })
  }

  const handleRefAssignConfirm = () => {
    if (!refAssignTarget) return
    const { lineId, componentId, refs, selected } = refAssignTarget
    if (selected.length === 0) {
      toast.error("Select at least one reference.")
      return
    }
    const allSelected = selected.length >= refs.length
    setComponentMutation.mutate({
      lineId,
      component: componentId,
      refs: allSelected ? undefined : selected,
    })
    setRefAssignTarget(null)
  }

  const openReplaceForReference = () => {
    const target = pendingNotInBomConfirmation
    if (!target?.componentId) {
      toast.error("Could not resolve scanned component.")
      return
    }
    const options = scannerRows
      .filter((row) => (row.refs?.length || 0) > 0)
      .map((row) => ({
        id: row.id,
        label: `${row.ref_group || (row.refs || []).join(", ")}${row.value ? ` · ${row.value}` : ""}`,
        refs: row.refs || [],
      }))
    if (options.length === 0) {
      toast.error("No BOM references available to replace.")
      return
    }
    const first = options[0]
    setPendingNotInBomConfirmation(null)
    setRefAssignTarget({
      title: `Assign ${target.componentName || "component"} to references`,
      componentId: target.componentId,
      componentName: target.componentName || "component",
      lineId: first.id,
      refs: first.refs,
      selected: [...first.refs],
      lineOptions: options,
    })
  }

  const openPacketSheet = (row: (typeof scannerRows)[number], mode: "SOURCED" | "PLACED") => {
    if (!row.component) {
      toast.error("Link component first.")
      return
    }
    setPacketSheetTarget({
      lineId: row.id,
      mode,
      componentId: row.component,
      componentName: row.component_name || row.value || row.component,
      lineProgress: {
        refLabel: row.ref_group || (row.refs && row.refs.length > 0 ? row.refs.join(", ") : "-"),
        needed: toNumber(row.needed),
        sourced: toNumber(row.sourced),
        placed: toNumber(row.placed),
      },
    })
    setPacketSheetOpen(true)
  }

  const openFindPacketSheet = () => {
    setPacketSheetTarget({
      browseMode: true,
      mode: scannerMode === "PLACED" ? "PLACED" : "SOURCED",
      initialSearch: scanInput.trim(),
    })
    setPacketSheetOpen(true)
  }

  const handlePacketSelect = (packet: PacketSelectItem, qty: number) => {
    if (!packetSheetTarget) return
    if (packetSheetTarget.browseMode || !packetSheetTarget.lineId) {
      void executeScan(scannerMode, packet.id)
      setPacketSheetOpen(false)
      setPacketSheetTarget(null)
      return
    }
    manualPacketMutation.mutate({
      mode: packetSheetTarget.mode,
      barcode: packet.id,
      line_id: packetSheetTarget.lineId,
      qty,
    })
  }

  const getQuickPlaceQty = (scan: BomRowScan) => {
    const raw = quickPlaceQtyByScan[scan.id]
    if (raw == null || raw === "") {
      const scannedQty = toNumber(scan.qty)
      return scannedQty > 0 ? scannedQty : 1
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }
    return parsed
  }

  const handleQuickPlaceFromScan = (row: (typeof scannerRows)[number], scan: BomRowScan) => {
    const barcode = scan.resolved_packet_id || scan.barcode
    if (!barcode) {
      toast.error("Packet barcode is missing.")
      return
    }
    const qty = getQuickPlaceQty(scan)
    if (qty <= 0) {
      toast.error("Place quantity must be greater than 0.")
      return
    }

    manualPacketMutation.mutate({
      mode: "PLACED",
      barcode,
      line_id: row.id,
      qty,
    })
  }

  const renderSeriesTableRows = (node: SeriesTreeNode, depth = 0): React.ReactNode[] => {
    const { bom } = node
    const rows: React.ReactNode[] = [
      <TableRow key={bom.id} className={depth > 0 ? "bg-muted/15" : undefined}>
        <TableCell className="min-w-[220px] align-top">
          <div className="flex items-start gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {depth > 0 ? <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
            <div className="min-w-0">
              <div className="font-medium text-foreground">{bom.name}</div>
              {bom.description ? <p className="mt-0.5 text-xs text-muted-foreground">{bom.description}</p> : null}
            </div>
          </div>
        </TableCell>
        <TableCell className="align-top">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", seriesKindBadgeClass(bom.series_kind))}>
            {bom.series_kind === "template" ? "Template" : "Working"}
          </span>
        </TableCell>
        <TableCell className="align-top">
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusBadgeClass(bom.status))}>
            {bom.status}
          </span>
        </TableCell>
        <TableCell className="align-top">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{bom.qty_planned}x</span>
        </TableCell>
        <TableCell className="align-top text-sm text-muted-foreground">
          {bom.planned_date ? new Date(bom.planned_date).toLocaleDateString() : "No date"}
        </TableCell>
        <TableCell className="align-top">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/production/${productDetail!.id}/bom/${bom.id}`)}>
              Open
            </Button>
            <Button variant="outline" size="sm" onClick={() => duplicateBomMutation.mutate(bom.id)}>
              {bom.series_kind === "template" ? "Create working series" : "Duplicate"}
            </Button>
            {bom.series_kind !== "template" && bom.status !== "locked" ? (
              <Button variant="outline" size="sm" onClick={() => lockBomMutation.mutate(bom.id)}>
                Lock
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>,
    ]

    for (const child of node.children) {
      rows.push(...renderSeriesTableRows(child, depth + 1))
    }

    return rows
  }

  return (
    <div
      className="w-full px-4 py-6 lg:px-6"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Productions
            {productDetail?.name ? (
              <span className="text-xl font-medium text-muted-foreground">
                {" · "}
                {productDetail.name}
              </span>
            ) : null}
            {isBomView && selectedBom?.name ? (
              <span className="text-xl font-medium text-muted-foreground">
                {" · "}
                {selectedBom.name}
                {headerSeriesDate ? ` (${headerSeriesDate})` : ""}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">Manage products, BOM series, availability and production flow.</p>
        </div>
        {isBomView && bomId ? (
          <div className="flex flex-wrap items-center gap-2">
            {isTemplateSeries ? (
              <Button
                type="button"
                size="sm"
                onClick={() => duplicateBomMutation.mutate(bomId)}
                disabled={duplicateBomMutation.isPending}
              >
                Create working series
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowBomDetails((value) => !value)}
            >
              {showBomDetails ? "Hide BOM detail" : "Show BOM detail"}
              {showBomDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        ) : null}
      </div>

      <div className={cn("grid grid-cols-1 gap-4", isBomView ? undefined : "lg:grid-cols-[320px_minmax(0,1fr)]")}>
        {!isBomView ? (
          <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Products</CardTitle>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={showCreateFolder ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowCreateFolder((value) => !value)}
                aria-label="Toggle new folder"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={showCreateProduction ? "default" : "outline"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowCreateProduction((value) => !value)}
                aria-label="Toggle new production"
              >
                <FilePlus2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {showCreateFolder ? (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">New folder</p>
                <Input
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <select
                  value={newFolderParent}
                  onChange={(e) => setNewFolderParent(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Root folder</option>
                  {flatFolderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                </select>
                <Button
                  className="w-full"
                  disabled={!newFolderName.trim() || createFolderMutation.isPending}
                  onClick={() => createFolderMutation.mutate()}
                >
                  Create folder
                </Button>
              </div>
            ) : null}
            {showCreateProduction ? (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">New production</p>
                <Input
                  placeholder="Production name"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                />
                <select
                  value={newProductFolder}
                  onChange={(e) => setNewProductFolder(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Select folder</option>
                  {flatFolderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                </select>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Short description"
                  value={newProductDescription}
                  onChange={(e) => setNewProductDescription(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={!newProductName.trim() || !newProductFolder || createProductMutation.isPending}
                  onClick={() => createProductMutation.mutate()}
                >
                  Create production
                </Button>
              </div>
            ) : null}
            {foldersLoading || productsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-5/6" />
                <Skeleton className="h-6 w-4/6" />
              </div>
            ) : (
              <>
                {rootProducts.length > 0 ? (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Unfiled</div>
                    {rootProducts.map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className={cn(
                          "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                          productId === product.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                        )}
                        onClick={() => navigate(`/production/${product.id}`)}
                      >
                        {product.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="space-y-2">{renderFolderTree(folders)}</div>
              </>
            )}
          </CardContent>
          </Card>
        ) : null}

        <div className="min-w-0 w-full space-y-4">
          {!productId || productDetailLoading ? (
            <Card>
              <CardContent className="p-6">
                {products.length === 0 && !productsLoading ? (
                  <p className="text-sm text-muted-foreground">Create a production first, then you can create BOM series.</p>
                ) : (
                  <Skeleton className="h-8 w-1/2" />
                )}
              </CardContent>
            </Card>
          ) : productDetail ? (
            <>
              {!isBomView ? (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Product</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Name</label>
                        <Input
                          value={productDetail.name}
                          onChange={(event) =>
                            queryClient.setQueryData<ProductDetail>(["production-product", productId], {
                              ...productDetail,
                              name: event.target.value,
                            })
                          }
                        />
                        <label className="text-sm font-medium text-foreground">Description</label>
                        <textarea
                          className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={productDetail.description || ""}
                          onChange={(event) =>
                            queryClient.setQueryData<ProductDetail>(["production-product", productId], {
                              ...productDetail,
                              description: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="flex items-start">
                        <Button
                          onClick={() =>
                            updateProductMutation.mutate({
                              name: productDetail.name,
                              description: productDetail.description || "",
                            })
                          }
                          disabled={updateProductMutation.isPending}
                        >
                          Save product
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-lg">Series BOMs</CardTitle>
                      <Button
                        type="button"
                        variant={showCreateSeries ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => setShowCreateSeries((value) => !value)}
                        aria-label="Toggle create series"
                      >
                        <FilePlus2 className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {showCreateSeries ? (
                        <div className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-[1fr_1fr_120px_160px_auto]">
                          <select
                            value={seriesProductId}
                            onChange={(e) => setSeriesProductId(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          >
                            <option value="">Select product</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          <Input placeholder="Series name" value={newBomName} onChange={(e) => setNewBomName(e.target.value)} />
                          <Input placeholder="Qty" value={newBomQty} onChange={(e) => setNewBomQty(e.target.value)} />
                          <Input type="date" value={newBomDate} onChange={(e) => setNewBomDate(e.target.value)} />
                          <Button
                            onClick={() => {
                              if (!seriesProductId) {
                                toast.error("Select a product for the new series.")
                                return
                              }
                              createBomMutation.mutate({ productionId: seriesProductId })
                            }}
                            disabled={createBomMutation.isPending}
                          >
                            Create series
                          </Button>
                        </div>
                      ) : null}
                      {productDetail.templates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No BOM created yet.</p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-border/70">
                          <Table>
                            <TableHeader className="bg-muted/60">
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Kind</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Qty</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {seriesTree.flatMap((node) => renderSeriesTableRows(node))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : null}

              {isBomView && bomId ? (
                bomDetailLoading || !selectedBom ? (
                  <Card className="w-full min-w-0">
                    <CardContent className="p-4">
                      <Skeleton className="h-40 w-full" />
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {showBomDetails ? (
                      <Card className="w-full min-w-0">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">BOM detail</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-[1fr_130px_170px_auto]">
                            <Input
                              value={selectedBom.name}
                              disabled={isTemplateSeries}
                              onChange={(e) =>
                                queryClient.setQueryData<BomItem>(["production-bom", bomId], {
                                  ...selectedBom,
                                  name: e.target.value,
                                })
                              }
                            />
                            <Input
                              value={String(selectedBom.qty_planned)}
                              disabled={isTemplateSeries}
                              onChange={(e) =>
                                queryClient.setQueryData<BomItem>(["production-bom", bomId], {
                                  ...selectedBom,
                                  qty_planned: Math.max(1, Number(e.target.value) || 1),
                                })
                              }
                            />
                            <Input
                              type="date"
                              value={selectedBom.planned_date || ""}
                              disabled={isTemplateSeries}
                              onChange={(e) =>
                                queryClient.setQueryData<BomItem>(["production-bom", bomId], {
                                  ...selectedBom,
                                  planned_date: e.target.value || null,
                                })
                              }
                            />
                            <Button
                              onClick={() =>
                                updateBomMutation.mutate({
                                  name: selectedBom.name,
                                  qty_planned: selectedBom.qty_planned,
                                  planned_date: selectedBom.planned_date || null,
                                  description: selectedBom.description || "",
                                })
                              }
                              disabled={updateBomMutation.isPending || selectedBom.status === "locked"}
                            >
                              Save BOM
                            </Button>
                          </div>

                          <textarea
                            className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={selectedBom.description || ""}
                            onChange={(e) =>
                              queryClient.setQueryData<BomItem>(["production-bom", bomId], {
                                ...selectedBom,
                                description: e.target.value,
                              })
                            }
                            placeholder="BOM notes (Markdown allowed)"
                          />
                        </CardContent>
                      </Card>
                    ) : null}

                    <div className="space-y-4">
                      <div className="border-b border-border/70">
                          <div className="-mb-px flex flex-wrap items-center gap-4" role="tablist" aria-label="BOM sections">
                          {([
                            { key: "bom", label: "BOM", icon: FileText },
                            ...(!isTemplateSeries
                              ? [
                                  { key: "production" as TabKey, label: "Production", icon: ScanLine },
                                  { key: "finalize" as TabKey, label: "Finalize & Lock", icon: Lock },
                                ]
                              : []),
                          ] as Array<{ key: TabKey; label: string; icon: typeof FileText }>).map((tab) => {
                            const Icon = tab.icon
                            const active = activeTab === tab.key
                            return (
                            <button
                              key={tab.key}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => setActiveTab(tab.key)}
                              className={cn(
                                "inline-flex h-9 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors",
                                active
                                  ? "border-primary font-medium text-foreground"
                                  : "border-transparent text-muted-foreground hover:text-foreground",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              {tab.label}
                            </button>
                            )
                          })}
                          </div>
                        </div>

                        {activeTab === "bom" ? (
                          <div className="space-y-4">
                            <div className="rounded-md border border-border/60">
                              <button
                                type="button"
                                onClick={() => setIbomSectionOpen((v) => !v)}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
                              >
                                <span className="flex items-center gap-2">
                                  <Link2 className="h-4 w-4" />
                                  iBOM
                                  <span
                                    className={cn(
                                      "inline-block h-2 w-2 rounded-full",
                                      ibomConnected ? "bg-green-500" : "bg-muted-foreground/30",
                                    )}
                                    title={ibomConnected ? "Bridge connected" : "Bridge disconnected"}
                                  />
                                  {ibomViewUrl ? (
                                    <span className="text-xs font-normal text-muted-foreground">set</span>
                                  ) : (
                                    <span className="text-xs font-normal text-muted-foreground">not set</span>
                                  )}
                                </span>
                                {ibomSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              {ibomSectionOpen ? (
                                <div className="space-y-2 border-t border-border/60 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                      className="h-8 w-64 max-w-full"
                                      placeholder="iBOM URL (HTTPS)"
                                      value={ibomUrlInput}
                                      onChange={(e) => setIbomUrlInput(e.target.value)}
                                      disabled={selectedBom.status === "locked"}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => setIbomMutation.mutate({ file: null })}
                                      disabled={selectedBom.status === "locked" || setIbomMutation.isPending}
                                    >
                                      Save URL
                                    </Button>
                                    <label className="inline-flex cursor-pointer items-center rounded-md border border-input px-2 py-1.5 text-xs">
                                      <input
                                        type="file"
                                        accept=".html,.htm,.zip"
                                        className="hidden"
                                        disabled={selectedBom.status === "locked"}
                                        onChange={(e) => {
                                          const file = e.currentTarget.files?.[0] || null
                                          setIbomMutation.mutate({ file })
                                          e.currentTarget.value = ""
                                        }}
                                      />
                                      Upload
                                    </label>
                                    <Button size="sm" variant="outline" disabled={!ibomViewUrl} onClick={() => setIbomPanelOpen(true)}>
                                      Open panel
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={!ibomIframeSrc} onClick={openIbomInNewTab}>
                                      New tab
                                    </Button>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Last updated:{" "}
                                    {selectedBom.ibom_updated_at ? new Date(selectedBom.ibom_updated_at).toLocaleString() : "not set"}
                                    {" · "}Source: {ibomViewUrl || "not set"}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            {isTemplateSeries ? (
                              <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                                Template series is locked after netlist import. Use &quot;Create working series&quot; to run production.
                              </p>
                            ) : !canImportNetlist ? (
                              <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                                Netlist import is only available on template series or empty series. Duplicate from the template instead.
                              </p>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-3">
                              <Input
                                className="h-8 w-72 max-w-full"
                                placeholder="Source URL (HTTPS)"
                                value={sourceUrlInput}
                                onChange={(e) => setSourceUrlInput(e.target.value)}
                                disabled={!canImportNetlist}
                              />
                              <select
                                value={importMode}
                                onChange={(e) => setImportMode(e.target.value as "replace" | "merge")}
                                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                disabled={!canImportNetlist}
                              >
                                <option value="replace">Replace</option>
                                <option value="merge">Merge</option>
                              </select>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!canImportNetlist || !sourceUrlInput.trim() || importUrlMutation.isPending}
                                onClick={() => importUrlMutation.mutate(sourceUrlInput)}
                              >
                                Import from URL
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!isTemplateSeries || !selectedBom.source_url || reImportMutation.isPending}
                                onClick={() => reImportMutation.mutate()}
                              >
                                Re-import
                              </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="inline-flex items-stretch">
                                <label
                                  className={cn(
                                    "inline-flex items-center gap-2 rounded-l-md border border-input px-3 py-2 text-sm",
                                    canImportNetlist ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                                  )}
                                >
                                  <input
                                    type="file"
                                    accept=".xml,text/xml,application/xml"
                                    onChange={handleImportFile}
                                    className="hidden"
                                    disabled={!canImportNetlist}
                                  />
                                  Import netlist (XML)
                                </label>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="rounded-l-none border-l-0 px-2"
                                      aria-label="Netlist actions"
                                    >
                                      <ChevronDown className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start">
                                    <DropdownMenuItem
                                      onClick={handleImportNetlistFromUrl}
                                      disabled={!canImportNetlistFromUrl || importUrlMutation.isPending}
                                    >
                                      Import from URL
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHideDnp((value) => !value)}
                              >
                                {hideDnp ? "Show DNP" : "Hide DNP"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setGroupedView((value) => !value)}
                              >
                                {groupedView ? "Ungrouped" : "Grouped"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setHideExcluded((value) => !value)}
                              >
                                {hideExcluded ? "Show Excl." : "Hide Excl."}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setGroupByComponent((value) => !value)}
                              >
                                {groupByComponent ? "By line" : "By component"}
                              </Button>
                              {(() => {
                                const linkedLines = selectedBomComponents.filter(
                                  (line) => line.component && !line.dnp,
                                )
                                const reserveItems = linkedLines.map((line) => {
                                  const neededTotal =
                                    line.qty_override_total != null
                                      ? toNumber(line.qty_override_total)
                                      : toNumber(line.qty_per_board) * toNumber(selectedBom.qty_planned)
                                  return {
                                    component_id: line.component!,
                                    quantity: neededTotal,
                                    lineId: line.id,
                                  }
                                })
                                const isBomReserved = reservationsForBom.length > 0
                                return isBomReserved ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      unreserveBomMutation.mutate(
                                        reservationsForBom.map((r) => r.id),
                                      )
                                    }
                                    disabled={
                                      unreserveBomMutation.isPending ||
                                      selectedBom.status === "locked"
                                    }
                                  >
                                    Unreserve BOM ({reservationsForBom.length} item
                                    {reservationsForBom.length === 1 ? "" : "s"})
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      reserveBomMutation.mutate(reserveItems)
                                    }
                                    disabled={
                                      reserveBomMutation.isPending ||
                                      selectedBom.status === "locked" ||
                                      reserveItems.length === 0
                                    }
                                  >
                                    Reserve BOM
                                    {reserveItems.length > 0
                                      ? ` (${reserveItems.length} item${reserveItems.length === 1 ? "" : "s"})`
                                      : ""}
                                  </Button>
                                )
                              })()}
                            </div>

                            <div className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
                              <Input placeholder="Manual value" value={newLineValue} onChange={(e) => setNewLineValue(e.target.value)} disabled={selectedBom.status === "locked"} />
                              <Input placeholder="Footprint" value={newLineFootprint} onChange={(e) => setNewLineFootprint(e.target.value)} disabled={selectedBom.status === "locked"} />
                              <Input placeholder="Qty/board" value={newLineQty} onChange={(e) => setNewLineQty(e.target.value)} disabled={selectedBom.status === "locked"} />
                              <Button onClick={handleAddManualLine} disabled={selectedBom.status === "locked" || addLineMutation.isPending}>
                                Add manual line
                              </Button>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-border/70">
                              <TooltipProvider>
                              <Table className="text-[13px]">
                                <TableHeader className="bg-muted/60">
                                  <TableRow>
                                    <TableHead className="h-10 w-[70px] px-3 py-2 align-top">#</TableHead>
                                    <TableHead className="h-10 w-[220px] px-3 py-2 align-top">Ref</TableHead>
                                    <TableHead className="h-10 w-[400px] px-3 py-2 align-top">BOM</TableHead>
                                    <TableHead className="h-10 w-[320px] px-3 py-2 align-top">Component</TableHead>
                                    <TableHead className="h-10 px-3 py-2 align-top">Warehouse</TableHead>
                                    <TableHead className="h-10 w-[180px] px-3 py-2 align-top">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(groupedView ? groupedRows : ungroupedRows).map((line, index) => {
                                    const lineId = line.id
                                    const refsLabel = groupedView
                                      ? line.ref_group || (line.refs.length ? line.refs.join(",") : "-")
                                      : (line as BomRow & { ref_single: string }).ref_single
                                    const lineRefs = (groupedView ? line.refs || [] : [(line as BomRow & { ref_single: string }).ref_single]).map(
                                      (r) => [r, toNumber(line.qty_per_board) || 1] as [string, number]
                                    )
                                    const neededTotal =
                                      line.qty_override_total != null
                                        ? toNumber(line.qty_override_total)
                                        : toNumber(line.qty_per_board) * toNumber(selectedBom.qty_planned)
                                    const availabilityRow = availabilityByLineId.get(lineId)
                                    const inStock = availabilityRow ? toNumber(availabilityRow.in_stock) : 0
                                    const totalQty = availabilityRow ? toNumber(availabilityRow.total_quantity ?? 0) : 0
                                    const shortageFromApi = availabilityRow ? availabilityRow.shortage : inStock < neededTotal
                                    const shortage = line.dnp ? false : shortageFromApi
                                    const isExact = !line.dnp && Math.abs(inStock - neededTotal) < 0.000001
                                    const locations = availabilityRow?.locations || []
                                    return (
                                      <TableRow
                                        key={`${lineId}-${refsLabel}`}
                                        className={cn(
                                          "align-top",
                                          index % 2 === 0 ? "bg-muted/20" : "bg-background",
                                          highlightedLineId === lineId ? "bg-amber-100/40" : undefined,
                                        )}
                                        onMouseEnter={() => sendIbomHover(lineRefs, lineId)}
                                        onMouseLeave={() => sendIbomHover(null, lineId)}
                                      >
                                        <TableCell className="px-3 py-2 align-top">
                                          <p className="font-semibold text-foreground">#{index + 1}</p>
                                          <p className="text-[11px] font-semibold text-muted-foreground">{line.qty_per_board}x</p>
                                          <p className="text-[11px] font-semibold text-foreground">{neededTotal}</p>
                                        </TableCell>
                                        <TableCell className="px-3 py-2 align-top">
                                          {groupedView && line.refs && line.refs.length > 0 ? (
                                            <p className="font-medium text-emerald-700">
                                              {line.refs.map((ref, refIndex) => (
                                                <span key={ref}>
                                                  {refIndex > 0 ? ", " : null}
                                                  <span
                                                    className="cursor-pointer hover:underline"
                                                    onMouseEnter={(e) => {
                                                      e.stopPropagation()
                                                      sendIbomHover([[ref, toNumber(line.qty_per_board) || 1]], lineId)
                                                    }}
                                                    onMouseLeave={(e) => {
                                                      e.stopPropagation()
                                                      sendIbomHover(lineRefs, lineId)
                                                    }}
                                                  >
                                                    {ref}
                                                  </span>
                                                </span>
                                              ))}
                                            </p>
                                          ) : (
                                            <p className="font-medium text-emerald-700">{refsLabel || "-"}</p>
                                          )}
                                          <p className="text-[11px] text-muted-foreground">
                                            {(groupedView ? line.refs.length : 1) || 1} ref{(groupedView ? line.refs.length : 1) === 1 ? "" : "s"}
                                          </p>
                                          <div className="mt-1">
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                              {lineBadge(line)}
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell className="px-3 py-2 align-top">
                                          <div className="space-y-0.5 text-[12px] leading-tight">
                                            <div className="grid grid-cols-[86px_1fr] gap-x-2">
                                              <span className="font-semibold text-foreground">Value:</span>
                                              <span className={line.needs_review ? "font-medium text-amber-700" : ""}>{line.value || "-"}</span>
                                            </div>
                                            <div className="grid grid-cols-[86px_1fr] gap-x-2">
                                              <span className="font-semibold text-foreground">Footprint:</span>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="truncate">{line.footprint || "-"}</span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <span className="block max-w-[420px] whitespace-normal">
                                                    {line.footprint || "-"}
                                                  </span>
                                                </TooltipContent>
                                              </Tooltip>
                                            </div>
                                            <div className="grid grid-cols-[86px_1fr] gap-x-2">
                                              <span className="font-semibold text-foreground">Description:</span>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="truncate">{line.bom_description || "-"}</span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <span className="block max-w-[420px] whitespace-normal">
                                                    {line.bom_description || "-"}
                                                  </span>
                                                </TooltipContent>
                                              </Tooltip>
                                            </div>
                                            <div className="grid grid-cols-[86px_1fr] gap-x-2">
                                              <span className="font-semibold text-foreground">Datasheet:</span>
                                              <span>
                                                {line.datasheet ? (
                                                  line.datasheet.startsWith("http://") || line.datasheet.startsWith("https://") ? (
                                                    <a
                                                      href={line.datasheet}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      className="text-primary hover:underline"
                                                    >
                                                      Open
                                                    </a>
                                                  ) : (
                                                    line.datasheet
                                                  )
                                                ) : (
                                                  "-"
                                                )}
                                              </span>
                                            </div>
                                            {line.qty_override_total != null ? (
                                              <div className="grid grid-cols-[86px_1fr] gap-x-2">
                                                <span className="font-semibold text-foreground">Override:</span>
                                                <span>{toNumber(line.qty_override_total)}</span>
                                              </div>
                                            ) : null}
                                            <div className="mt-1 flex flex-wrap gap-1">
                                              {line.dnp ? (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                  DNP
                                                </span>
                                              ) : null}
                                              {line.exclude_from_bom ? (
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                                  Excl. BOM
                                                </span>
                                              ) : null}
                                              {line.needs_review ? (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                                  Needs review
                                                </span>
                                              ) : null}
                                              {line._valueMismatch ? (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700" title="Multiple values across grouped lines">
                                                  ! Value
                                                </span>
                                              ) : null}
                                              {line._footprintMismatch ? (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700" title="Multiple footprints across grouped lines">
                                                  ! Footprint
                                                </span>
                                              ) : null}
                                              {line._bomDescriptionMismatch ? (
                                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700" title="Multiple descriptions across grouped lines">
                                                  ! Desc
                                                </span>
                                              ) : null}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell className="px-3 py-2 align-top">
                                          {line.component ? (
                                            <div className="space-y-0.5 text-[12px] leading-tight">
                                              <div className="grid grid-cols-[96px_1fr] gap-x-2">
                                                <span className="font-semibold text-foreground">Component:</span>
                                                <ComponentInfoPopover
                                                  component={{
                                                    id: line.component_detail?.id || line.component,
                                                    name: line.component_detail?.name || line.component_name || line.component,
                                                    description: line.component_detail?.description || null,
                                                    primary_image_url: line.component_detail?.primary_image_url || null,
                                                    category: line.component_detail?.category || null,
                                                  }}
                                                  openOnHover
                                                >
                                                  <Link
                                                    to={`/store/component/${line.component}`}
                                                    className="truncate text-primary hover:underline"
                                                  >
                                                    {line.component_name || line.component}
                                                  </Link>
                                                </ComponentInfoPopover>
                                              </div>
                                              <div className="grid grid-cols-[96px_1fr] gap-x-2">
                                                <span className="font-semibold text-foreground">ID:</span>
                                                <span className="truncate font-mono text-xs text-muted-foreground">{line.component}</span>
                                              </div>
                                              {line.component_kicad_footprint ? (
                                                <div className="grid grid-cols-[96px_1fr] gap-x-2">
                                                  <span className="font-semibold text-foreground">KiCAD:Footprint:</span>
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span className="truncate">{line.component_kicad_footprint}</span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                      <span className="block max-w-[420px] whitespace-normal">
                                                        {line.component_kicad_footprint}
                                                      </span>
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </div>
                                              ) : null}
                                              <div className="grid grid-cols-[96px_1fr] gap-x-2">
                                                <span className="font-semibold text-foreground">Description:</span>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <span className="truncate">
                                                      {line.component_detail?.description || line.bom_description || "-"}
                                                    </span>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <span className="block max-w-[420px] whitespace-normal">
                                                      {line.component_detail?.description || line.bom_description || "-"}
                                                    </span>
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                            </div>
                                          ) : (
                                            <span className="text-[13px] text-muted-foreground">Unlinked</span>
                                          )}
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            "px-3 py-2 align-top",
                                            line.dnp
                                              ? "bg-muted/40"
                                              : shortage
                                                ? "bg-rose-100/70"
                                                : isExact
                                                  ? "bg-amber-100/70"
                                                  : "bg-emerald-100/70",
                                          )}
                                        >
                                          <div className="space-y-1.5 text-[12px]">
                                            <div className="flex items-center gap-1.5">
                                              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                              <span className={cn("font-semibold", line.dnp ? "text-muted-foreground" : shortage ? "text-rose-700" : isExact ? "text-amber-800" : "text-emerald-800")}>
                                                {inStock} / {neededTotal}
                                              </span>
                                              <span className="text-muted-foreground">
                                                {line.dnp ? "DNP" : shortage ? "Shortage" : isExact ? "Exact" : "In stock"}
                                              </span>
                                            </div>
                                            {availabilityData?.home_location_full_path != null && availabilityRow && availabilityRow.total_in_home != null ? (
                                              <div className="flex items-start gap-1.5">
                                                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                  In <strong className="text-foreground">{availabilityData.home_location_full_path}</strong>: <strong className="text-foreground">{availabilityRow.total_in_home}</strong> total
                                                </span>
                                              </div>
                                            ) : null}
                                            <div className="flex items-start gap-1.5">
                                              <Package className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                              <span className="text-muted-foreground">
                                                {totalQty > 0 ? (
                                                  <>All: <strong className="text-foreground">{totalQty}</strong> total, <strong className="text-foreground">{inStock}</strong> available</>
                                                ) : (
                                                  "No stock"
                                                )}
                                              </span>
                                            </div>
                                            {locations.length > 0 ? (
                                              <div className="flex items-start gap-1.5">
                                                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                                <span className="text-muted-foreground">
                                                  {locations.map((loc) => (
                                                    <span key={loc.packet_id} className="block">
                                                      {loc.location}: <strong className="text-foreground">{loc.quantity}</strong>
                                                    </span>
                                                  ))}
                                                </span>
                                              </div>
                                            ) : null}
                                          </div>
                                        </TableCell>
                                        <TableCell className="px-3 py-2 align-top">
                                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                                            <button
                                              type="button"
                                              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                              disabled={selectedBom.status === "locked"}
                                              onClick={() => {
                                                const nextValue = window.prompt("Value", line.value || "")
                                                if (nextValue == null) return
                                                const nextFootprint = window.prompt("Footprint", line.footprint || "")
                                                if (nextFootprint == null) return
                                                const nextDescription = window.prompt("Description", line.bom_description || "")
                                                if (nextDescription == null) return
                                                updateLineMutation.mutate({
                                                  lineId,
                                                  payload: {
                                                    value: nextValue,
                                                    footprint: nextFootprint,
                                                    bom_description: nextDescription,
                                                  },
                                                })
                                              }}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                              disabled={selectedBom.status === "locked"}
                                              onClick={() => openLinkSheet(line)}
                                            >
                                              {line.component ? "Relink" : "Link"}
                                            </button>
                                            {line.component ? (
                                              <button
                                                type="button"
                                                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                                disabled={selectedBom.status === "locked"}
                                                onClick={() =>
                                                  updateLineMutation.mutate({
                                                    lineId,
                                                    payload: { component: null },
                                                  })
                                                }
                                              >
                                                Unlnk
                                              </button>
                                            ) : null}
                                            <button
                                              type="button"
                                              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                              disabled={selectedBom.status === "locked"}
                                              onClick={() =>
                                                updateLineMutation.mutate({
                                                  lineId,
                                                  payload: { dnp: !line.dnp },
                                                })
                                              }
                                            >
                                              {line.dnp ? "DNP on" : "DNP off"}
                                            </button>
                                            <button
                                              type="button"
                                              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                              disabled={selectedBom.status === "locked"}
                                              onClick={() =>
                                                updateLineMutation.mutate({
                                                  lineId,
                                                  payload: { exclude_from_bom: !line.exclude_from_bom },
                                                })
                                              }
                                            >
                                              {line.exclude_from_bom ? "Excl. on" : "Excl. off"}
                                            </button>
                                            <button
                                              type="button"
                                              className="text-rose-700 hover:underline disabled:text-muted-foreground disabled:no-underline"
                                              disabled={selectedBom.status === "locked"}
                                              onClick={() => {
                                                if (!window.confirm("Delete this BOM line?")) return
                                                deleteLineMutation.mutate(lineId)
                                              }}
                                            >
                                              Del
                                            </button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                  {(groupedView ? groupedRows.length === 0 : ungroupedRows.length === 0) ? (
                                    <TableRow>
                                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                                        No BOM rows.
                                      </TableCell>
                                    </TableRow>
                                  ) : null}
                                </TableBody>
                              </Table>
                              </TooltipProvider>
                            </div>
                          </div>
                        ) : null}

                        {activeTab === "production" ? (
                          <div className="space-y-3">
                            <form onSubmit={handleScanSubmit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                              <Input
                                ref={scanInputRef}
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                placeholder="Scan barcode or search..."
                              />
                              <Button
                                type="button"
                                variant="outline"
                                disabled={
                                  scanLookupMutation.isPending
                                  || scanCommitMutation.isPending
                                  || Boolean(scanActionTarget)
                                  || Boolean(pendingNotInBomConfirmation)
                                }
                                onClick={openFindPacketSheet}
                              >
                                Find packet
                              </Button>
                              <Button
                                type="submit"
                                disabled={
                                  scanLookupMutation.isPending
                                  || scanCommitMutation.isPending
                                  || Boolean(scanActionTarget)
                                  || Boolean(pendingNotInBomConfirmation)
                                  || !scanInput.trim()
                                }
                              >
                                Scan
                              </Button>
                            </form>

                            <div className="flex flex-wrap items-center gap-2">
                              {(["FIND", "SOURCED", "PLACED"] as const).map((mode) => (
                                <Button
                                  key={mode}
                                  size="sm"
                                  variant={scannerMode === mode ? "default" : "outline"}
                                  disabled={
                                    scanLookupMutation.isPending
                                    || scanCommitMutation.isPending
                                    || Boolean(scanActionTarget)
                                    || Boolean(pendingNotInBomConfirmation)
                                  }
                                  onClick={() => setScannerMode(mode)}
                                >
                                  {mode}
                                </Button>
                              ))}
                              <Button variant="outline" size="sm" onClick={() => undoMutation.mutate()}>
                                Undo last scan
                              </Button>
                            </div>

                            <div className="grid gap-2 rounded-md border border-border/70 bg-muted/15 p-2 text-xs sm:grid-cols-2">
                              <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-2 py-1.5">
                                <span className="leading-tight">
                                  <span className="block font-medium text-foreground">Follow iBOM hover</span>
                                  <span className="block text-muted-foreground">Auto-focus table row while moving in iBOM.</span>
                                </span>
                                <Switch checked={followIbomHover} onCheckedChange={setFollowIbomHover} />
                              </label>
                              <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-2 py-1.5">
                                <span className="leading-tight">
                                  <span className="block font-medium text-foreground">Sync 100% to iBOM</span>
                                  <span className="block text-muted-foreground">Auto-check refs only when row reaches full sourced/placed.</span>
                                </span>
                                <Switch checked={autoSyncIbomCompletion} onCheckedChange={setAutoSyncIbomCompletion} />
                              </label>
                            </div>

                            <div className="rounded-md border border-border/70 bg-muted/10 p-2">
                              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-tight">
                                <span className="font-medium text-foreground">Assembly progress</span>
                                <span className="text-muted-foreground">Need: {formatQty(assemblyProgress.needed)}</span>
                                <span className="text-amber-700">Sourced: {formatQty(assemblyProgress.sourced)}</span>
                                <span className="text-emerald-700">Placed: {formatQty(assemblyProgress.placed)}</span>
                                <span className="text-muted-foreground">{Math.round(assemblyProgress.placedPct)}%</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="flex h-2 w-full flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="bg-amber-400" style={{ width: `${assemblyProgress.sourcedPct}%` }} />
                                  <div className="bg-emerald-500" style={{ width: `${assemblyProgress.placedPct}%` }} />
                                  <div className="bg-muted" style={{ width: `${assemblyProgress.emptyPct}%` }} />
                                </div>
                                {assemblyProgress.sourcedOverflow > 0 ? (
                                  <span className="inline-flex rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                                    (+{formatQty(assemblyProgress.sourcedOverflow)})
                                  </span>
                                ) : null}
                                {assemblyProgress.placedOverflow > 0 ? (
                                  <span className="inline-flex rounded border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                                    (+{formatQty(assemblyProgress.placedOverflow)})
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-border/70">
                              <Table>
                                <TableHeader className="bg-muted/40">
                                  <TableRow>
                                    <TableHead>Refs</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead>Component</TableHead>
                                    <TableHead>Progress</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {scannerRows.length > 0 ? (
                                    scannerRows.map((row) => {
                                      const ibomHighlighted = highlightedRefs && (row.refs || []).some((r: string) => highlightedRefs.includes(r))
                                      const rowRefs = (row.refs || []).map((r) => [r, toNumber(row.qty_per_board) || 1] as [string, number])
                                      return (
                                      <Fragment key={row.id}>
                                        <TableRow
                                          ref={(element) => {
                                            scannerRowRefs.current[row.id] = element
                                          }}
                                          tabIndex={-1}
                                          className={cn("text-xs", highlightedLineId === row.id ? "bg-amber-100/50" : undefined, ibomHighlighted ? "ring-2 ring-inset ring-blue-400/60" : undefined)}
                                          onMouseEnter={() => {
                                            if (rowRefs.length > 0) {
                                              sendIbomHover(rowRefs, row.id)
                                              // Emit unconditionally: ibom.ready handshake may have been
                                              // missed (iBOM in another tab / connected before NI), so
                                              // ibomConnected can be stale-false. Harmless if no iBOM listens.
                                              if (row.refs[0]) highlightInIbom(row.refs[0])
                                            }
                                          }}
                                          onMouseLeave={() => sendIbomHover(null, row.id)}
                                        >
                                          <TableCell
                                            className={ibomConnected ? "cursor-pointer hover:text-primary" : undefined}
                                            onClick={() => {
                                              const firstRef = row.refs?.[0]
                                              if (firstRef) highlightInIbom(firstRef)
                                            }}
                                          >
                                            {row.refs && row.refs.length > 0 ? (
                                              row.refs.map((ref, refIndex) => (
                                                <span key={ref}>
                                                  {refIndex > 0 ? ", " : null}
                                                  <span
                                                    className="cursor-pointer hover:underline"
                                                    onMouseEnter={(e) => {
                                                      e.stopPropagation()
                                                      sendIbomHover([[ref, toNumber(row.qty_per_board) || 1]], row.id)
                                                    }}
                                                    onMouseLeave={(e) => {
                                                      e.stopPropagation()
                                                      sendIbomHover(rowRefs, row.id)
                                                    }}
                                                  >
                                                    {ref}
                                                  </span>
                                                </span>
                                              ))
                                            ) : (
                                              row.ref_group || "-"
                                            )}
                                          </TableCell>
                                          <TableCell>{row.value || "-"}</TableCell>
                                          <TableCell>
                                            {row.component ? (
                                              <ComponentInfoPopover
                                                component={{
                                                  id: row.component_detail?.id || row.component,
                                                  name: row.component_detail?.name || row.component_name || row.component,
                                                  description: row.component_detail?.description || null,
                                                  primary_image_url: row.component_detail?.primary_image_url || null,
                                                  category: row.component_detail?.category || null,
                                                }}
                                                openOnHover
                                              >
                                                <Link
                                                  to={`/store/component/${row.component}`}
                                                  className="text-primary hover:underline"
                                                >
                                                  {row.component_name || row.component}
                                                </Link>
                                              </ComponentInfoPopover>
                                            ) : (
                                              <span className="text-muted-foreground">Unlinked</span>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {(() => {
                                              const segments = buildProgressSegments(
                                                toNumber(row.needed),
                                                toNumber(row.sourced),
                                                toNumber(row.placed),
                                              )
                                              return (
                                                <>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
                                              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                                Per product: {toNumber(row.qty_per_board)}
                                              </span>
                                              <span className="text-[11px] text-muted-foreground">
                                                Need: <span className="font-medium text-foreground">{toNumber(row.needed)}</span>
                                              </span>
                                              <span className="text-[11px] text-amber-700">
                                                Sourced: <span className="font-medium">{toNumber(row.sourced)}</span>
                                              </span>
                                              <span className="text-[11px] text-emerald-700">
                                                Placed: <span className="font-medium">{toNumber(row.placed)}</span>
                                              </span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-1.5">
                                              <div className="flex h-1.5 w-full flex-1 overflow-hidden rounded-full bg-muted">
                                                <div className="bg-amber-400" style={{ width: `${segments.sourcedPct}%` }} />
                                                <div className="bg-emerald-500" style={{ width: `${segments.placedPct}%` }} />
                                                <div className="bg-muted" style={{ width: `${segments.emptyPct}%` }} />
                                              </div>
                                              {segments.sourcedOverflow > 0 ? (
                                                <span className="inline-flex rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                                                  (+{formatQty(segments.sourcedOverflow)})
                                                </span>
                                              ) : null}
                                              {segments.placedOverflow > 0 ? (
                                                <span className="inline-flex rounded border border-emerald-300 bg-emerald-100 px-1 py-0.5 text-[10px] font-medium text-emerald-800">
                                                  (+{formatQty(segments.placedOverflow)})
                                                </span>
                                              ) : null}
                                            </div>
                                                </>
                                              )
                                            })()}
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                              <button
                                                type="button"
                                                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                                disabled={selectedBom.status === "locked"}
                                                onClick={() => openPacketSheet(row, "SOURCED")}
                                              >
                                                Source bag
                                              </button>
                                              <button
                                                type="button"
                                                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                                disabled={selectedBom.status === "locked"}
                                                onClick={() => openPacketSheet(row, "PLACED")}
                                              >
                                                Place from bag
                                              </button>
                                              <button
                                                type="button"
                                                className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                                                disabled={selectedBom.status === "locked"}
                                                onClick={() => openLinkSheet(row)}
                                              >
                                                Change
                                              </button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                        <TableRow className={cn("bg-muted/20", highlightedLineId === row.id ? "bg-amber-100/30" : undefined)}>
                                          <TableCell colSpan={5} className="py-1.5">
                                            {row.scans && row.scans.length > 0 ? (
                                              <div className="space-y-0.5">
                                                {row.scans.map((scan) => (
                                                  <div
                                                    key={scan.id}
                                                    className="grid grid-cols-1 gap-x-2 gap-y-0.5 px-2 text-[11px] sm:grid-cols-[60px_1fr_70px_150px_auto]"
                                                  >
                                                    <span
                                                      className={cn(
                                                        "font-medium uppercase leading-tight",
                                                        scan.mode === "placed" ? "text-emerald-700" : "text-primary",
                                                      )}
                                                    >
                                                      {scan.mode}
                                                    </span>
                                                    <span className="font-mono text-muted-foreground leading-tight">
                                                      {scan.resolved_packet_id || scan.barcode}
                                                    </span>
                                                    <span className="leading-tight">
                                                      {toNumber(row.placed) >= toNumber(row.needed) && scan.mode === "sourced" ? null : `Qty: ${toNumber(scan.qty)}`}
                                                    </span>
                                                    <span className="text-muted-foreground leading-tight">
                                                      {new Date(scan.created_at).toLocaleString()}
                                                    </span>
                                                    {scan.mode === "sourced" ? (
                                                      <div className="flex items-center gap-1 sm:justify-end">
                                                        {toNumber(row.placed) >= toNumber(row.needed) ? null : (
                                                          <>
                                                            <Input
                                                              type="number"
                                                              min="0"
                                                              step="any"
                                                              className="h-6 w-20 text-[11px]"
                                                              value={quickPlaceQtyByScan[scan.id] ?? ""}
                                                              placeholder={String(Math.max(toNumber(scan.qty), 1))}
                                                              onChange={(event) =>
                                                                setQuickPlaceQtyByScan((prev) => ({
                                                                  ...prev,
                                                                  [scan.id]: event.target.value,
                                                                }))
                                                              }
                                                              disabled={selectedBom.status === "locked"}
                                                            />
                                                            <Button
                                                              type="button"
                                                              size="sm"
                                                              className="h-6 px-2 text-[11px]"
                                                              disabled={selectedBom.status === "locked" || manualPacketMutation.isPending}
                                                              onClick={() => handleQuickPlaceFromScan(row, scan)}
                                                            >
                                                              Place
                                                            </Button>
                                                          </>
                                                        )}
                                                        <Button
                                                          type="button"
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-6 px-2 text-[11px]"
                                                          disabled={selectedBom.status === "locked" || removeScanMutation.isPending}
                                                          onClick={() => removeScanMutation.mutate(scan.id)}
                                                        >
                                                          Remove
                                                        </Button>
                                                      </div>
                                                    ) : (
                                                      <div className="flex items-center sm:justify-end">
                                                        <Button
                                                          type="button"
                                                          variant="outline"
                                                          size="sm"
                                                          className="h-6 px-2 text-[11px]"
                                                          disabled={selectedBom.status === "locked" || removeScanMutation.isPending}
                                                          onClick={() => removeScanMutation.mutate(scan.id)}
                                                        >
                                                          Remove
                                                        </Button>
                                                      </div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-xs text-muted-foreground">No selected bags.</p>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      </Fragment>
                                    )})
                                  ) : (
                                    <TableRow>
                                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                                        No production rows.
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ) : null}

                        {activeTab === "finalize" ? (
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Review sourced/placed components and other materials below. The
                              listed quantities are deducted from warehouse stock on finalize;
                              stock may go negative.
                            </p>
                            <div className="overflow-hidden rounded-lg border border-border/70">
                              <Table>
                                <TableHeader className="bg-muted/40">
                                  <TableRow>
                                    <TableHead>Refs</TableHead>
                                    <TableHead>Linked component</TableHead>
                                    <TableHead>Needed total</TableHead>
                                    <TableHead>Sourced</TableHead>
                                    <TableHead>Placed</TableHead>
                                    <TableHead>Actual used</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {scannerRows.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell>{row.ref_group || "-"}</TableCell>
                                      <TableCell>
                                        <span className="flex flex-wrap items-center gap-2">
                                          {row.component_name || "Unlinked"}
                                          {row.source_type === "manual" ? (
                                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                                              material
                                            </span>
                                          ) : null}
                                        </span>
                                      </TableCell>
                                      <TableCell>{row.needed}</TableCell>
                                      <TableCell>{row.sourced}</TableCell>
                                      <TableCell>{row.placed}</TableCell>
                                      <TableCell>
                                        <Input
                                          value={actualUsed[row.id] ?? String(row.needed)}
                                          onChange={(e) =>
                                            setActualUsed((prev) => ({
                                              ...prev,
                                              [row.id]: e.target.value,
                                            }))
                                          }
                                        />
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Button onClick={() => printMutation.mutate()} disabled={printMutation.isPending}>
                                Print A4 (queue)
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => finalizeMutation.mutate()}
                                disabled={selectedBom.status === "locked" || finalizeMutation.isPending}
                              >
                                Finalize & Lock
                              </Button>
                              {selectedBom.status !== "locked" ? (
                                <Button variant="outline" onClick={() => lockBomMutation.mutate(selectedBom.id)}>
                                  Lock without finalize
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                    </div>
                  </>
                )
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Select a product to continue.</CardContent>
            </Card>
          )}
        </div>
      </div>

      <ComponentSearchSheet
        open={linkSheetOpen}
        onOpenChange={(open) => {
          setLinkSheetOpen(open)
          if (!open) {
            setLinkSheetTarget(null)
          }
        }}
        initialSearch={(linkSheetTarget?.value || "").trim()}
        onSelect={handleLinkSelect}
      />
      <PacketSelectSheet
        open={packetSheetOpen}
        onOpenChange={(open) => {
          setPacketSheetOpen(open)
          if (!open) {
            setPacketSheetTarget(null)
          }
        }}
        componentId={packetSheetTarget?.componentId}
        componentName={packetSheetTarget?.componentName}
        modeLabel={packetSheetTarget?.mode || "SOURCED"}
        lineProgress={packetSheetTarget?.lineProgress || null}
        initialSearch={packetSheetTarget?.initialSearch || ""}
        browseMode={packetSheetTarget?.browseMode}
        homePath={availabilityData?.home_location_full_path || null}
        onSelect={handlePacketSelect}
      />
      <Dialog
        open={Boolean(pendingNotInBomConfirmation)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingNotInBomConfirmation(null)
            refocusScanInput()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Component is not in BOM</DialogTitle>
            <DialogDescription>
              {pendingNotInBomConfirmation?.componentName
                ? `${pendingNotInBomConfirmation.componentName} is not linked in this BOM.`
                : "Scanned component is not linked in this BOM."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Add it as a new BOM line, or replace the component on selected references of an existing line.
          </p>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={scanLookupMutation.isPending}
              onClick={() => {
                setPendingNotInBomConfirmation(null)
                refocusScanInput()
              }}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={openReplaceForReference}>
                Replace for reference
              </Button>
              <Button type="button" disabled={scanLookupMutation.isPending} onClick={() => void handleConfirmNotInBom()}>
                Add to BOM
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScanActionDialog
        target={scanActionTarget}
        defaultOperation={scannerMode}
        homePath={availabilityData?.home_location_full_path || null}
        isPending={scanCommitMutation.isPending}
        onCommit={(operation, qty, barcode) => void handleScanActionCommit(operation, qty, barcode)}
        onFind={() => {
          setScanActionTarget(null)
          toast.success("Found in BOM.")
          refocusScanInput()
        }}
        onClose={() => {
          setScanActionTarget(null)
          refocusScanInput()
        }}
      />
      <Dialog open={Boolean(refAssignTarget)} onOpenChange={(open) => (open ? undefined : setRefAssignTarget(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{refAssignTarget?.title || "Assign component to references"}</DialogTitle>
            <DialogDescription>
              {refAssignTarget?.componentName
                ? `Select which references get "${refAssignTarget.componentName}". Unselected references keep their current component.`
                : "Select references."}
            </DialogDescription>
          </DialogHeader>
          {refAssignTarget ? (
            <div className="space-y-3">
              {refAssignTarget.lineOptions && refAssignTarget.lineOptions.length > 0 ? (
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-foreground">BOM line</span>
                  <select
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    value={refAssignTarget.lineId}
                    onChange={(e) => {
                      const opt = refAssignTarget.lineOptions?.find((o) => o.id === e.target.value)
                      if (!opt) return
                      setRefAssignTarget((prev) =>
                        prev ? { ...prev, lineId: opt.id, refs: opt.refs, selected: [...opt.refs] } : prev,
                      )
                    }}
                  >
                    {refAssignTarget.lineOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="max-h-[40vh] space-y-1 overflow-auto rounded-md border border-border/60 p-2">
                {refAssignTarget.refs.map((ref) => {
                  const checked = refAssignTarget.selected.includes(ref)
                  return (
                    <label key={ref} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setRefAssignTarget((prev) => {
                            if (!prev) return prev
                            const selected = e.target.checked
                              ? [...prev.selected, ref]
                              : prev.selected.filter((r) => r !== ref)
                            return { ...prev, selected }
                          })
                        }
                      />
                      <span className="font-mono">{ref}</span>
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() =>
                    setRefAssignTarget((prev) => (prev ? { ...prev, selected: [...prev.refs] } : prev))
                  }
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setRefAssignTarget((prev) => (prev ? { ...prev, selected: [] } : prev))}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRefAssignTarget(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={setComponentMutation.isPending} onClick={handleRefAssignConfirm}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet open={ibomPanelOpen} onOpenChange={setIbomPanelOpen}>
        <SheetContent side="right" className="h-full w-screen max-w-none p-0">
          <SheetHeader className="border-b border-border/70 px-4 py-3">
            <SheetTitle className="flex items-center gap-2">
              iBOM viewer
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  ibomConnected ? "bg-green-500" : "bg-muted-foreground/30",
                )}
                title={ibomConnected ? "Bridge connected" : "Bridge disconnected"}
              />
            </SheetTitle>
            <SheetDescription className="sr-only">Interactive BOM viewer panel</SheetDescription>
          </SheetHeader>
          {ibomIframeSrc ? (
            <iframe
              src={ibomIframeSrc}
              title="iBOM full panel"
              className="h-[calc(100vh-61px)] w-full"
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">iBOM source is not set.</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
