import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import {
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Copy,
  Package,
} from "lucide-react"
import Select, { type SingleValue, type StylesConfig } from "react-select"
import { toast } from "sonner"

import { CampaignProgressSummary } from "@/components/CampaignProgressSummary"
import { LocationDisplay } from "@/components/LocationDisplay"
import { LocationParentSelect } from "@/components/LocationParentSelect"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getInventoryStatusLabel,
  postInventoryOperation,
  type PaginatedResponse,
} from "@/lib/inventory"
import { type StocktakingProgress } from "@/lib/stocktaking"

interface StocktakingCampaign {
  id: string
  name: string
  is_active: boolean
  progress?: StocktakingProgress
}

interface PacketComponent {
  id: string
  name: string
}

interface PacketLocation {
  id: string
  full_path: string
}

interface Packet {
  id: string
  count?: number | null
  is_active?: boolean
  inventory_op_count?: number
  component: PacketComponent
  location?: PacketLocation | null
}

interface LocationNode {
  id: string
  name: string
  full_path: string
  children?: LocationNode[]
}

interface UserMe {
  settings?: {
    home_location?: string | null
  }
}

type CampaignOption = {
  value: string
  label: string
}

type StatusFilter = "all" | "pending" | "inventoried" | "multiple"

type StatusFilterOption = {
  value: StatusFilter
  label: string
}

type ActiveFilter = "active" | "inactive" | "all"

type ActiveFilterOption = {
  value: ActiveFilter
  label: string
}

const PAGE_SIZE = 100

const compactHeadClass =
  "h-6 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
const compactCellClass = "h-7 px-2 py-0.5 text-xs text-foreground"

type PageOption = {
  value: string
  label: string
}

type PacketListFilters = {
  locationId: string
  componentSearch: string
  activeFilter: ActiveFilter
  selectedCampaignId: string
  statusFilter: StatusFilter
}

function buildPacketListSearchParams(
  filters: PacketListFilters,
  options?: {
    page?: number
    pageSize?: number
    inventoryStatus?: StatusFilter
    applyInventoryStatus?: boolean
  },
): URLSearchParams {
  const params = new URLSearchParams()
  const page = options?.page
  const pageSize = options?.pageSize ?? PAGE_SIZE
  const applyInventoryStatus = options?.applyInventoryStatus ?? true

  if (page !== undefined) {
    params.set("page", String(page))
  }
  params.set("page_size", String(pageSize))

  if (filters.locationId.trim()) {
    params.set("location", filters.locationId.trim())
  }
  if (filters.activeFilter === "active") {
    params.set("is_active", "true")
  } else if (filters.activeFilter === "inactive") {
    params.set("is_active", "false")
  }
  const search = filters.componentSearch.trim()
  if (search) {
    params.set("component_name", search)
  }
  if (filters.selectedCampaignId.trim()) {
    params.set("inventory_campaign", filters.selectedCampaignId.trim())
  }

  if (applyInventoryStatus) {
    const inventoryStatus = options?.inventoryStatus ?? filters.statusFilter
    if (filters.selectedCampaignId.trim() && inventoryStatus !== "all") {
      params.set("inventory_status", inventoryStatus)
    }
  }

  return params
}

function InventoryStatusIcon({
  opCount,
  hasCampaign,
}: {
  opCount?: number
  hasCampaign: boolean
}) {
  if (!hasCampaign) {
    return <span className="text-muted-foreground">—</span>
  }
  if (!opCount) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Not inventoried</TooltipContent>
      </Tooltip>
    )
  }
  if (opCount === 1) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          </span>
        </TooltipTrigger>
        <TooltipContent>Inventoried</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span className="absolute -right-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-semibold leading-none text-white">
            {opCount}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{getInventoryStatusLabel(opCount)}</TooltipContent>
    </Tooltip>
  )
}

const baseSelectStyles = {
  control: (base) => ({
    ...base,
    minHeight: "40px",
    borderColor: "hsl(var(--input))",
    boxShadow: "none",
    ":hover": { borderColor: "hsl(var(--input))" },
    backgroundColor: "hsl(var(--background))",
  }),
  menu: (base) => ({
    ...base,
    zIndex: 20,
    backgroundColor: "hsl(var(--background))",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused
      ? "hsl(var(--accent))"
      : "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  }),
  singleValue: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
  }),
  input: (base) => ({
    ...base,
    color: "hsl(var(--foreground))",
  }),
} satisfies StylesConfig<CampaignOption, false>

const campaignSelectStyles: StylesConfig<CampaignOption, false> = baseSelectStyles
const statusSelectStyles =
  baseSelectStyles as StylesConfig<StatusFilterOption, false>
const activeSelectStyles =
  baseSelectStyles as StylesConfig<ActiveFilterOption, false>
const pageSelectStyles =
  baseSelectStyles as StylesConfig<PageOption, false>
const statusFilterOptions: StatusFilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "inventoried", label: "Inventoried" },
  { value: "multiple", label: "Inventoried multiple" },
]
const activeFilterOptions: ActiveFilterOption[] = [
  { value: "all", label: "All packets" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
]

interface ComponentPacketGroup {
  component: PacketComponent
  packets: Packet[]
}

interface LocationPacketGroup {
  location: PacketLocation | null
  components: ComponentPacketGroup[]
  packetCount: number
}

function groupPacketsByLocationAndComponent(packets: Packet[]): LocationPacketGroup[] {
  const locationGroups: LocationPacketGroup[] = []
  const locationIndex = new Map<string, number>()

  for (const packet of packets) {
    const locationKey = packet.location?.id ?? "__none__"
    let locationGroupIndex = locationIndex.get(locationKey)

    if (locationGroupIndex === undefined) {
      locationGroupIndex = locationGroups.length
      locationIndex.set(locationKey, locationGroupIndex)
      locationGroups.push({
        location: packet.location ?? null,
        components: [],
        packetCount: 0,
      })
    }

    const locationGroup = locationGroups[locationGroupIndex]
    const componentKey = packet.component.id
    let componentGroup = locationGroup.components.find(
      (group) => group.component.id === componentKey,
    )

    if (!componentGroup) {
      componentGroup = { component: packet.component, packets: [] }
      locationGroup.components.push(componentGroup)
    }

    componentGroup.packets.push(packet)
    locationGroup.packetCount += 1
  }

  return locationGroups
}

export function InventoryPacketListPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    () => searchParams.get("campaign") ?? "",
  )
  const [locationId, setLocationId] = useState("")
  const [locationInitialized, setLocationInitialized] = useState(false)
  const [componentSearch, setComponentSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all")
  const [page, setPage] = useState(1)
  const [rowCounts, setRowCounts] = useState<Record<string, string>>({})
  const [pendingPacketId, setPendingPacketId] = useState<string | null>(null)
  const [pendingTogglePacketId, setPendingTogglePacketId] = useState<string | null>(null)

  const { data: locationsTree, isLoading: locationsLoading } = useQuery<LocationNode[]>({
    queryKey: ["locations-tree"],
    queryFn: () => apiFetch<LocationNode[]>("/api/v1/store/location/tree/"),
  })

  const { data: campaignsData } = useQuery<
    StocktakingCampaign[] | PaginatedResponse<StocktakingCampaign>
  >({
    queryKey: ["stocktaking"],
    queryFn: () =>
      apiFetch<StocktakingCampaign[] | PaginatedResponse<StocktakingCampaign>>(
        "/api/v1/store/stocktaking/?page_size=1000",
      ),
  })

  const campaigns = Array.isArray(campaignsData)
    ? campaignsData
    : campaignsData?.results || []

  const activeCampaign = campaigns.find((campaign) => campaign.is_active)
  const defaultCampaignApplied = useRef(false)
  const { data: user } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => apiFetch<UserMe>("/api/v1/me/"),
  })

  const homeLocationId = user?.settings?.home_location ?? null

  useEffect(() => {
    if (user === undefined || locationInitialized) {
      return
    }
    if (homeLocationId) {
      setLocationId(homeLocationId)
    }
    setLocationInitialized(true)
  }, [user, homeLocationId, locationInitialized])

  useEffect(() => {
    const campaignParam = searchParams.get("campaign")
    if (campaignParam) {
      setSelectedCampaignId((current) => (current === campaignParam ? current : campaignParam))
      defaultCampaignApplied.current = true
      return
    }
    if (defaultCampaignApplied.current || !activeCampaign) {
      return
    }
    setSelectedCampaignId(activeCampaign.id)
    defaultCampaignApplied.current = true
  }, [activeCampaign, searchParams])

  useEffect(() => {
    const campaignParam = selectedCampaignId.trim()
    setSearchParams(
      (prev) => {
        const current = prev.get("campaign") ?? ""
        if (campaignParam === current) {
          return prev
        }
        const next = new URLSearchParams(prev)
        if (campaignParam) {
          next.set("campaign", campaignParam)
        } else {
          next.delete("campaign")
        }
        return next
      },
      { replace: true },
    )
  }, [selectedCampaignId, setSearchParams])

  useEffect(() => {
    setPage(1)
  }, [locationId, selectedCampaignId, statusFilter, activeFilter, componentSearch])

  const packetListFilters = useMemo<PacketListFilters>(
    () => ({
      locationId,
      componentSearch,
      activeFilter,
      selectedCampaignId,
      statusFilter,
    }),
    [locationId, componentSearch, activeFilter, selectedCampaignId, statusFilter],
  )

  const selectedActiveFilterOption =
    activeFilterOptions.find((option) => option.value === activeFilter) ??
    activeFilterOptions.find((option) => option.value === "all") ??
    null

  const packetQueryKey = ["inventory-packet-list", page, packetListFilters]

  const { data: packetsData, isLoading: packetsLoading } = useQuery<
    Packet[] | PaginatedResponse<Packet>
  >({
    queryKey: packetQueryKey,
    queryFn: () => {
      const params = buildPacketListSearchParams(packetListFilters, { page })
      return apiFetch<Packet[] | PaginatedResponse<Packet>>(
        `/api/v1/store/packet/?${params.toString()}`,
      )
    },
    enabled: locationInitialized,
  })

  const packets = Array.isArray(packetsData) ? packetsData : packetsData?.results ?? []
  const totalPacketCount = Array.isArray(packetsData)
    ? packets.length
    : packetsData?.count ?? packets.length
  const hasNextPage = Array.isArray(packetsData) ? false : Boolean(packetsData?.next)
  const hasPreviousPage = page > 1
  const totalPages = Math.max(1, Math.ceil(totalPacketCount / PAGE_SIZE))

  const pageOptions = useMemo(
    () =>
      Array.from({ length: totalPages }, (_, index) => ({
        value: String(index + 1),
        label: `Page ${index + 1}`,
      })),
    [totalPages],
  )

  const selectedPageOption =
    pageOptions.find((option) => option.value === String(page)) ?? pageOptions[0]

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)

  const campaignOptions: CampaignOption[] = campaigns.map((campaign) => ({
    value: campaign.id,
    label: campaign.is_active ? `${campaign.name} (Open)` : campaign.name,
  }))

  const selectedCampaignOption =
    campaignOptions.find((option) => option.value === selectedCampaignId) ?? null

  const groupedPackets = useMemo(
    () => groupPacketsByLocationAndComponent(packets),
    [packets],
  )

  const toggleActiveMutation = useMutation({
    mutationFn: (payload: { packetId: string; is_active: boolean }) => {
      setPendingTogglePacketId(payload.packetId)
      return apiFetch(`/api/v1/store/packet/${payload.packetId}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: payload.is_active }),
      })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-packet-list"] })
      queryClient.invalidateQueries({ queryKey: ["stocktaking"] })
      toast.success(
        variables.is_active ? "Packet marked active." : "Packet marked inactive.",
      )
    },
    onError: () => {
      toast.error("Failed to update packet status.")
    },
    onSettled: () => {
      setPendingTogglePacketId(null)
    },
  })

  const inventoryMutation = useMutation({
    mutationFn: (payload: {
      packetId: string
      quantity: number
      countedQuantity: number
      recordedCount: number
    }) => {
      setPendingPacketId(payload.packetId)
      return postInventoryOperation({
        packet: payload.packetId,
        quantity: payload.quantity,
        countedQuantity: payload.countedQuantity,
        recordedCount: payload.recordedCount,
        reference: selectedCampaignId.trim() || null,
        fast: true,
      })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inventory-packet-list"] })
      queryClient.invalidateQueries({ queryKey: ["stocktaking"] })
      queryClient.invalidateQueries({ queryKey: ["stocktaking-active"] })
      setRowCounts((prev) => {
        const next = { ...prev }
        delete next[variables.packetId]
        return next
      })
      toast.success("Inventory recorded.")
    },
    onError: () => {
      toast.error("Failed to record inventory. Please try again.")
    },
    onSettled: () => {
      setPendingPacketId(null)
    },
  })

  const handleCopyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error("Unable to copy to clipboard.")
    }
  }

  const handleRecordInventory = (packet: Packet) => {
    const raw = rowCounts[packet.id]?.trim() ?? ""
    const countedQuantity = Number(raw)
    if (raw === "" || Number.isNaN(countedQuantity)) {
      return
    }
    const recordedCount = packet.count ?? 0
    const quantity = countedQuantity - recordedCount
    inventoryMutation.mutate({
      packetId: packet.id,
      quantity,
      countedQuantity,
      recordedCount,
    })
  }

  const handleCampaignChange = (option: SingleValue<CampaignOption>) => {
    setSelectedCampaignId(option?.value ?? "")
  }

  return (
    <div className="w-full px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Packet list</h1>
          <p className="text-sm text-muted-foreground">
            Overview of all packets with per-campaign inventory status and fast inline counting.
          </p>
          {selectedCampaign && (
            <p className="mt-1 text-sm text-muted-foreground">
              Campaign: <span className="text-foreground">{selectedCampaign.name}</span>
              {selectedCampaign.is_active ? " · Open" : " · Closed"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/store/inventory-campaign">Inventory campaigns</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/store/inventory">Do inventory</Link>
          </Button>
        </div>
      </div>

      {selectedCampaignId.trim() ? (
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
          <CampaignProgressSummary
            progress={selectedCampaign?.progress}
            variant="full"
            label={
              selectedCampaign
                ? `Inventoried in ${selectedCampaign.name}`
                : "Inventoried packets"
            }
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Select a campaign to track inventory progress.
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-foreground">Campaign</label>
          <Select<CampaignOption, false>
            isClearable
            classNamePrefix="rs"
            styles={campaignSelectStyles}
            options={campaignOptions}
            value={selectedCampaignOption}
            onChange={handleCampaignChange}
            placeholder="No campaign (ad-hoc inventory)"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-medium text-foreground">Location</label>
          <LocationParentSelect
            locations={locationsTree || []}
            value={locationId || null}
            onChange={(value) => setLocationId(value ?? "")}
            isLoading={locationsLoading}
            emptyLabel="All locations"
            placeholder="Filter by location"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Component search</label>
          <Input
            value={componentSearch}
            onChange={(e) => setComponentSearch(e.target.value)}
            placeholder="Filter by component name"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Inventory status</label>
          <Select<StatusFilterOption, false>
            classNamePrefix="rs"
            styles={statusSelectStyles}
            options={statusFilterOptions}
            value={statusFilterOptions.find((option) => option.value === statusFilter) ?? null}
            onChange={(option: SingleValue<StatusFilterOption>) =>
              setStatusFilter(option?.value ?? "all")
            }
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Packet status</label>
          <Select<ActiveFilterOption, false>
            classNamePrefix="rs"
            styles={activeSelectStyles}
            options={activeFilterOptions}
            value={selectedActiveFilterOption}
            onChange={(option: SingleValue<ActiveFilterOption>) =>
              setActiveFilter(option?.value ?? "all")
            }
          />
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/50">
                <TableHead className={compactHeadClass}>Location</TableHead>
                <TableHead className={compactHeadClass}>Component</TableHead>
                <TableHead className={`${compactHeadClass} w-[72px]`}>Recorded</TableHead>
                <TableHead className={`${compactHeadClass} w-10 text-center`}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex justify-center">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Inventory status</TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className={`${compactHeadClass} w-[108px]`}>Count</TableHead>
                <TableHead className={`${compactHeadClass} w-11 text-center`}>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packetsLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell colSpan={6} className={compactCellClass}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : packets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="px-2 py-6 text-center text-xs text-muted-foreground"
                  >
                    No packets match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                groupedPackets.flatMap((locationGroup) =>
                  locationGroup.components.flatMap((componentGroup) =>
                    componentGroup.packets.map((packet, packetIndex) => {
                      const isFirstInLocation =
                        locationGroup.components[0] === componentGroup && packetIndex === 0
                      const isFirstInComponent = packetIndex === 0
                      const isLastInComponent =
                        packetIndex === componentGroup.packets.length - 1
                      const opCount = selectedCampaignId
                        ? packet.inventory_op_count ?? 0
                        : undefined
                      const rowValue = rowCounts[packet.id] ?? ""
                      const parsedCount = rowValue.trim() === "" ? null : Number(rowValue)
                      const canSubmit =
                        parsedCount !== null &&
                        !Number.isNaN(parsedCount) &&
                        pendingPacketId !== packet.id
                      const isInactive = packet.is_active === false
                      const inactiveRowClass = isInactive
                        ? "text-muted-foreground line-through"
                        : ""

                      return (
                        <TableRow
                          key={packet.id}
                          className={`border-border/50 ${
                            isInactive ? "bg-muted/20 opacity-70" : ""
                          } ${!isLastInComponent ? "border-b border-dashed border-border/40" : ""}`}
                        >
                          {isFirstInLocation ? (
                            <TableCell
                              rowSpan={locationGroup.packetCount}
                              className={`${compactCellClass} align-top`}
                            >
                              <LocationDisplay
                                location={locationGroup.location}
                                className="text-xs"
                                labelClassName="text-xs"
                              />
                            </TableCell>
                          ) : null}
                          <TableCell
                            className={`${compactCellClass} align-top ${
                              !isFirstInComponent ? "pt-0.5" : ""
                            }`}
                          >
                            <div className="flex min-w-0 items-start gap-1">
                              <div className="min-w-0 flex-1">
                                {isFirstInComponent ? (
                                  <div className="flex min-w-0 items-center gap-1">
                                    <Link
                                      to={`/store/component/${packet.component.id}?packet=${packet.id}`}
                                      className={`truncate font-medium hover:underline ${inactiveRowClass || "text-foreground"}`}
                                      title={packet.component.name}
                                    >
                                      {packet.component.name}
                                    </Link>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Link
                                          to={`/store/packet/${packet.id}`}
                                          className="inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                          aria-label="Open packet detail"
                                        >
                                          <Package className="h-3 w-3" />
                                        </Link>
                                      </TooltipTrigger>
                                      <TooltipContent>Open packet</TooltipContent>
                                    </Tooltip>
                                  </div>
                                ) : null}
                                <div
                                  className={`flex min-w-0 items-center gap-0.5 ${
                                    isFirstInComponent ? "mt-0.5" : ""
                                  }`}
                                >
                                  <span
                                    className={`truncate font-mono text-[10px] leading-tight ${inactiveRowClass || "text-muted-foreground"}`}
                                    title={packet.id}
                                  >
                                    {packet.id}
                                  </span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 shrink-0 text-muted-foreground [&_svg]:size-2.5"
                                        onClick={() =>
                                          handleCopyText(packet.id, "Packet ID copied.")
                                        }
                                        aria-label="Copy packet ID"
                                      >
                                        <Copy />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy packet ID</TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className={`${compactCellClass} tabular-nums`}>
                            <span className={inactiveRowClass}>{packet.count ?? 0}</span>
                          </TableCell>
                          <TableCell className={`${compactCellClass} text-center`}>
                            <InventoryStatusIcon
                              opCount={opCount}
                              hasCampaign={!!selectedCampaignId}
                            />
                          </TableCell>
                          <TableCell className={compactCellClass}>
                            <div className="flex h-6 w-full min-w-[96px] items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                              <input
                                type="number"
                                value={rowValue}
                                onChange={(e) =>
                                  setRowCounts((prev) => ({
                                    ...prev,
                                    [packet.id]: e.target.value,
                                  }))
                                }
                                placeholder="Count"
                                className="min-w-0 flex-1 border-0 bg-transparent px-2 text-xs focus-visible:outline-none"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && canSubmit) {
                                    handleRecordInventory(packet)
                                  }
                                }}
                              />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex w-7 shrink-0 items-center justify-center border-l border-input text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!canSubmit || inventoryMutation.isPending}
                                    onClick={() => handleRecordInventory(packet)}
                                    aria-label="Record inventory"
                                  >
                                    {pendingPacketId === packet.id ? (
                                      <span className="text-[10px] leading-none">…</span>
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Record inventory</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell className={`${compactCellClass} text-center`}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex shrink-0">
                                  <Switch
                                    checked={!isInactive}
                                    disabled={
                                      toggleActiveMutation.isPending &&
                                      pendingTogglePacketId === packet.id
                                    }
                                    className="scale-[0.72]"
                                    onCheckedChange={(checked) =>
                                      toggleActiveMutation.mutate({
                                        packetId: packet.id,
                                        is_active: checked,
                                      })
                                    }
                                    aria-label={
                                      isInactive ? "Activate packet" : "Discard packet"
                                    }
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isInactive
                                  ? "Activate packet"
                                  : "Discard packet (mark inactive)"}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      )
                    }),
                  ),
                )
              )}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {packetsLoading
            ? "Loading packets…"
            : totalPacketCount > 0
              ? `${totalPacketCount} packets match filters`
              : "No packets match filters"}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={!hasPreviousPage || packetsLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <div className="w-[130px]">
              <Select<PageOption, false>
                classNamePrefix="rs"
                styles={pageSelectStyles}
                options={pageOptions}
                value={selectedPageOption}
                isSearchable={totalPages > 10}
                onChange={(option: SingleValue<PageOption>) => {
                  if (option?.value) {
                    setPage(Number(option.value))
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
              disabled={!hasNextPage || packetsLoading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Next
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
