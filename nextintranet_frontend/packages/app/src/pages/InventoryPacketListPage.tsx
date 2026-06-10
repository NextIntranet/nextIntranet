import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Package,
} from "lucide-react"
import Select, { type SingleValue, type StylesConfig } from "react-select"
import { toast } from "sonner"

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
  fetchAllPaginated,
  getInventoryStatusLabel,
  groupInventoryOpsByPacket,
  postInventoryOperation,
  type InventoryStockOperation,
  type PaginatedResponse,
} from "@/lib/inventory"

interface StocktakingCampaign {
  id: string
  name: string
  is_active: boolean
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
  component: PacketComponent
  location?: PacketLocation | null
}

interface LocationNode {
  id: string
  name: string
  full_path: string
  children?: LocationNode[]
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

const PAGE_SIZE = 100

const compactHeadClass =
  "h-7 px-2 py-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
const compactCellClass = "h-8 px-2 py-1 text-xs text-foreground"

type PageOption = {
  value: string
  label: string
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
const pageSelectStyles =
  baseSelectStyles as StylesConfig<PageOption, false>

const statusFilterOptions: StatusFilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "inventoried", label: "Inventoried" },
  { value: "multiple", label: "Inventoried multiple" },
]

export function InventoryPacketListPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    () => searchParams.get("campaign") ?? "",
  )
  const [locationId, setLocationId] = useState("")
  const [componentSearch, setComponentSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [activeOnly, setActiveOnly] = useState(true)
  const [page, setPage] = useState(1)
  const [rowCounts, setRowCounts] = useState<Record<string, string>>({})
  const [pendingPacketId, setPendingPacketId] = useState<string | null>(null)

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
  }, [locationId, selectedCampaignId, statusFilter, activeOnly, componentSearch])

  const packetQueryKey = ["inventory-packet-list", page, locationId, PAGE_SIZE]

  const { data: packetsData, isLoading: packetsLoading } = useQuery<
    Packet[] | PaginatedResponse<Packet>
  >({
    queryKey: packetQueryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (locationId.trim()) {
        params.set("location", locationId.trim())
      }
      return apiFetch<Packet[] | PaginatedResponse<Packet>>(
        `/api/v1/store/packet/?${params.toString()}`,
      )
    },
  })

  const packets = Array.isArray(packetsData) ? packetsData : packetsData?.results || []
  const totalPacketCount = Array.isArray(packetsData)
    ? packets.length
    : packetsData?.count ?? packets.length
  const hasNextPage = Array.isArray(packetsData)
    ? false
    : Boolean(packetsData?.next)
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

  const { data: inventoryOperations = [], isLoading: inventoryOpsLoading } = useQuery({
    queryKey: ["stocktaking-operations-all", selectedCampaignId],
    queryFn: () =>
      fetchAllPaginated<InventoryStockOperation>(
        `/api/v1/store/packet/operation/?operation_type=inventory&reference=${selectedCampaignId}&page_size=1000`,
      ),
    enabled: !!selectedCampaignId.trim(),
  })

  const inventoryOpsByPacket = useMemo(
    () => groupInventoryOpsByPacket(inventoryOperations),
    [inventoryOperations],
  )

  const inventoriedPacketCount = inventoryOpsByPacket.size

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)

  const campaignOptions: CampaignOption[] = campaigns.map((campaign) => ({
    value: campaign.id,
    label: campaign.is_active ? `${campaign.name} (Open)` : campaign.name,
  }))

  const selectedCampaignOption =
    campaignOptions.find((option) => option.value === selectedCampaignId) ?? null

  const filteredPackets = useMemo(() => {
    const search = componentSearch.trim().toLowerCase()
    return packets.filter((packet) => {
      if (activeOnly && packet.is_active === false) {
        return false
      }
      if (search && !packet.component.name.toLowerCase().includes(search)) {
        return false
      }
      const opCount = selectedCampaignId ? inventoryOpsByPacket.get(packet.id) ?? 0 : 0
      if (statusFilter === "pending" && opCount > 0) {
        return false
      }
      if (statusFilter === "inventoried" && opCount === 0) {
        return false
      }
      if (statusFilter === "multiple" && opCount < 2) {
        return false
      }
      return true
    })
  }, [
    packets,
    activeOnly,
    componentSearch,
    inventoryOpsByPacket,
    selectedCampaignId,
    statusFilter,
  ])

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
      queryClient.invalidateQueries({
        queryKey: ["stocktaking-operations-all", selectedCampaignId],
      })
      queryClient.invalidateQueries({
        queryKey: ["stocktaking-operations", selectedCampaignId],
      })
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

  const progressLabel = selectedCampaignId
    ? `${inventoriedPacketCount} / ${totalPacketCount} packets inventoried`
    : "Select a campaign to track inventory status"

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
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
              {selectedCampaignId && !inventoryOpsLoading && (
                <span> · {progressLabel}</span>
              )}
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
        <div className="flex items-center justify-between rounded-lg border border-border/70 px-4 py-3 md:col-span-2">
          <div>
            <p className="text-sm font-medium text-foreground">Active packets only</p>
            <p className="text-xs text-muted-foreground">
              Hide inactive packets from the list.
            </p>
          </div>
          <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="border-border/50">
                <TableHead className={compactHeadClass}>Component</TableHead>
                <TableHead className={compactHeadClass}>Location</TableHead>
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
                <TableHead className={`${compactHeadClass} w-[96px]`}>Count</TableHead>
                <TableHead className={`${compactHeadClass} w-[88px]`}>Action</TableHead>
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
              ) : filteredPackets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="px-2 py-6 text-center text-xs text-muted-foreground"
                  >
                    No packets match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPackets.map((packet) => {
                  const opCount = selectedCampaignId
                    ? inventoryOpsByPacket.get(packet.id) ?? 0
                    : undefined
                  const rowValue = rowCounts[packet.id] ?? ""
                  const parsedCount = rowValue.trim() === "" ? null : Number(rowValue)
                  const canSubmit =
                    parsedCount !== null &&
                    !Number.isNaN(parsedCount) &&
                    pendingPacketId !== packet.id

                  return (
                    <TableRow key={packet.id} className="border-border/50">
                      <TableCell className={compactCellClass}>
                        <div className="flex min-w-0 items-center gap-1">
                          <Link
                            to={`/store/component/${packet.component.id}?packet=${packet.id}`}
                            className="truncate font-medium text-foreground hover:underline"
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
                          {packet.is_active === false && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              Inactive
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={compactCellClass}>
                        <LocationDisplay
                          location={packet.location}
                          className="text-xs"
                          labelClassName="text-xs"
                        />
                      </TableCell>
                      <TableCell className={`${compactCellClass} tabular-nums`}>
                        {packet.count ?? 0}
                      </TableCell>
                      <TableCell className={`${compactCellClass} text-center`}>
                        <InventoryStatusIcon
                          opCount={opCount}
                          hasCampaign={!!selectedCampaignId}
                        />
                      </TableCell>
                      <TableCell className={compactCellClass}>
                        <Input
                          type="number"
                          value={rowValue}
                          onChange={(e) =>
                            setRowCounts((prev) => ({
                              ...prev,
                              [packet.id]: e.target.value,
                            }))
                          }
                          placeholder="Count"
                          className="h-7 px-2 text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && canSubmit) {
                              handleRecordInventory(packet)
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className={compactCellClass}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          disabled={!canSubmit || inventoryMutation.isPending}
                          onClick={() => handleRecordInventory(packet)}
                        >
                          {pendingPacketId === packet.id ? "…" : "Record"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {totalPacketCount > 0 ? `${totalPacketCount} packets total` : "No packets"}
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
