import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@nextintranet/core"
import { ChevronRight, ClipboardList } from "lucide-react"
import Select, { type SingleValue, type StylesConfig } from "react-select"

import { useHotkeys } from "@/lib/hotkeys"
import { CampaignProgressSummary } from "@/components/CampaignProgressSummary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  STOCKTAKING_PROGRESS_REFETCH_MS,
  type StocktakingProgress,
} from "@/lib/stocktaking"
import type { PaginatedResponse } from "@/lib/inventory"

interface LocationNode {
  id: string
  name: string
  full_path: string
  children?: LocationNode[]
}

interface StocktakingCampaign {
  id: string
  name: string
  is_active: boolean
  progress?: StocktakingProgress
}

interface LocationProgressRow {
  location_id: string | null
  total_packets: number
  inactive_packets: number
  inventoried_packets: number
}

interface LocationProgressResponse {
  locations: LocationProgressRow[]
}

type CampaignOption = {
  value: string
  label: string
}

const campaignSelectStyles: StylesConfig<CampaignOption, false> = {
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
}

const emptyAggregate = (): StocktakingProgress => ({
  total_packets: 0,
  inactive_packets: 0,
  inventoried_packets: 0,
  pending_packets: 0,
  progress_percent: 0,
})

/**
 * Roll the per-location stats up the tree: every node's aggregate includes
 * all of its nested locations.
 */
const buildAggregates = (
  nodes: LocationNode[],
  statsById: Map<string | null, LocationProgressRow>,
  out: Map<string, StocktakingProgress>,
): StocktakingProgress => {
  const sum = emptyAggregate()
  for (const node of nodes) {
    const own = statsById.get(node.id)
    const childSum = node.children?.length
      ? buildAggregates(node.children, statsById, out)
      : emptyAggregate()
    const active = (own?.total_packets ?? 0) + childSum.total_packets
    const inactive = (own?.inactive_packets ?? 0) + childSum.inactive_packets
    const inventoried = (own?.inventoried_packets ?? 0) + childSum.inventoried_packets
    const aggregate: StocktakingProgress = {
      total_packets: active,
      inactive_packets: inactive,
      inventoried_packets: inventoried,
      pending_packets: Math.max(0, active - inventoried),
      progress_percent: active > 0 ? Math.round((inventoried / active) * 100) : 0,
    }
    out.set(node.id, aggregate)
    sum.total_packets += active
    sum.inactive_packets += inactive
    sum.inventoried_packets += inventoried
  }
  sum.pending_packets = Math.max(0, sum.total_packets - sum.inventoried_packets)
  sum.progress_percent =
    sum.total_packets > 0
      ? Math.round((sum.inventoried_packets / sum.total_packets) * 100)
      : 0
  return sum
}

export function InventoryLocationStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedCampaignId, setSelectedCampaignId] = useState(
    () => searchParams.get("campaign") ?? "",
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const expandedInitialized = useRef(false)
  const defaultCampaignApplied = useRef(false)

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
    refetchInterval: STOCKTAKING_PROGRESS_REFETCH_MS,
    refetchIntervalInBackground: true,
  })

  const campaigns = Array.isArray(campaignsData)
    ? campaignsData
    : campaignsData?.results || []
  const activeCampaign = campaigns.find((campaign) => campaign.is_active)
  const selectedCampaign = campaigns.find(
    (campaign) => campaign.id === selectedCampaignId,
  )

  const { data: selectedCampaignDetail } = useQuery<StocktakingCampaign>({
    queryKey: ["stocktaking-detail", selectedCampaignId],
    queryFn: () =>
      apiFetch<StocktakingCampaign>(`/api/v1/store/stocktaking/${selectedCampaignId}/`),
    enabled: Boolean(selectedCampaignId.trim()),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  })

  const { data: locationProgress, isLoading: progressLoading } =
    useQuery<LocationProgressResponse>({
      queryKey: ["stocktaking-location-progress", selectedCampaignId],
      queryFn: () =>
        apiFetch<LocationProgressResponse>(
          `/api/v1/store/stocktaking/${selectedCampaignId}/location-progress/`,
        ),
      enabled: Boolean(selectedCampaignId.trim()),
      refetchInterval: 10_000,
      refetchIntervalInBackground: true,
    })

  useEffect(() => {
    const campaignParam = searchParams.get("campaign")
    if (campaignParam) {
      setSelectedCampaignId((current) =>
        current === campaignParam ? current : campaignParam,
      )
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

  // Expand the root level once the tree arrives.
  useEffect(() => {
    if (expandedInitialized.current || !locationsTree?.length) {
      return
    }
    setExpanded(new Set(locationsTree.map((node) => node.id)))
    expandedInitialized.current = true
  }, [locationsTree])

  const statsById = useMemo(() => {
    const map = new Map<string | null, LocationProgressRow>()
    for (const row of locationProgress?.locations ?? []) {
      map.set(row.location_id, row)
    }
    return map
  }, [locationProgress])

  const aggregates = useMemo(() => {
    const out = new Map<string, StocktakingProgress>()
    if (locationsTree?.length) {
      buildAggregates(locationsTree, statsById, out)
    }
    return out
  }, [locationsTree, statsById])

  const noLocationStats = statsById.get(null)

  const campaignOptions: CampaignOption[] = campaigns.map((campaign) => ({
    value: campaign.id,
    label: campaign.is_active ? `${campaign.name} (Open)` : campaign.name,
  }))
  const selectedCampaignOption =
    campaignOptions.find((option) => option.value === selectedCampaignId) ?? null

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const collectAllIds = (nodes: LocationNode[]): string[] => {
    const ids: string[] = []
    const walk = (items: LocationNode[]) => {
      for (const node of items) {
        ids.push(node.id)
        if (node.children?.length) walk(node.children)
      }
    }
    walk(nodes)
    return ids
  }

  useHotkeys([
    {
      keys: "e",
      description: "Expand all locations",
      group: "Packet status",
      handler: () => {
        if (locationsTree?.length) {
          setExpanded(new Set(collectAllIds(locationsTree)))
        }
      },
    },
    {
      keys: "c",
      description: "Collapse all locations",
      group: "Packet status",
      handler: () => setExpanded(new Set()),
    },
  ])

  const packetListLink = (locationId?: string) => {
    const params = new URLSearchParams()
    if (selectedCampaignId.trim()) {
      params.set("campaign", selectedCampaignId.trim())
    }
    if (locationId) {
      params.set("location", locationId)
    }
    return `/store/inventory/packets?${params.toString()}`
  }

  const renderNode = (node: LocationNode, depth: number) => {
    const progress = aggregates.get(node.id) ?? emptyAggregate()
    const hasChildren = Boolean(node.children?.length)
    const isExpanded = expanded.has(node.id)
    const hasPackets = progress.total_packets + progress.inactive_packets > 0

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 border-b border-border/40 px-2 py-1.5 hover:bg-muted/30",
            !hasPackets && "opacity-50",
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node.id)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={node.full_path}>
            {node.name}
          </span>
          <div className="w-56 shrink-0 sm:w-72">
            {hasPackets ? (
              <CampaignProgressSummary
                progress={progress}
                loading={progressLoading}
                label=""
              />
            ) : (
              <span className="text-[11px] text-muted-foreground">No packets</span>
            )}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={packetListLink(node.id)}
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
                  !hasPackets && "pointer-events-none",
                )}
                aria-label={`Open packet list for ${node.full_path}`}
              >
                <ClipboardList className="h-3.5 w-3.5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>Open in packet list</TooltipContent>
          </Tooltip>
        </div>
        {hasChildren && isExpanded
          ? node.children!.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Packet status</h1>
          <p className="text-sm text-muted-foreground">
            Inventory progress per warehouse location, including nested locations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to={packetListLink()}>Packet list</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/store/inventory">Do inventory</Link>
          </Button>
        </div>
      </div>

      <div className="mt-4 max-w-xl space-y-2">
        <label className="text-sm font-medium text-foreground">Campaign</label>
        <Select<CampaignOption, false>
          isClearable
          classNamePrefix="rs"
          styles={campaignSelectStyles}
          options={campaignOptions}
          value={selectedCampaignOption}
          onChange={(option: SingleValue<CampaignOption>) =>
            setSelectedCampaignId(option?.value ?? "")
          }
          placeholder="Select a campaign"
        />
      </div>

      {selectedCampaignId.trim() ? (
        <>
          <div className="mt-4 rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
            <CampaignProgressSummary
              progress={selectedCampaignDetail?.progress ?? selectedCampaign?.progress}
              variant="full"
              label={
                selectedCampaign
                  ? `Inventoried in ${selectedCampaign.name}`
                  : "Inventoried packets"
              }
            />
          </div>

          <TooltipProvider delayDuration={200}>
            <div className="mt-4 overflow-hidden rounded-lg border border-border/70">
              <div className="flex items-center gap-2 border-b border-border/50 bg-muted/40 px-2 py-1.5">
                <span className="w-5 shrink-0" />
                <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </span>
                <span className="w-56 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:w-72">
                  Progress
                </span>
                <span className="w-6 shrink-0" />
              </div>
              {locationsLoading || (progressLoading && !locationProgress) ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              ) : locationsTree?.length ? (
                <>
                  {locationsTree.map((node) => renderNode(node, 0))}
                  {noLocationStats &&
                  noLocationStats.total_packets + noLocationStats.inactive_packets > 0 ? (
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="w-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm italic text-muted-foreground">
                        Without location
                      </span>
                      <div className="w-56 shrink-0 sm:w-72">
                        <CampaignProgressSummary
                          progress={{
                            total_packets: noLocationStats.total_packets,
                            inactive_packets: noLocationStats.inactive_packets,
                            inventoried_packets: noLocationStats.inventoried_packets,
                            pending_packets: Math.max(
                              0,
                              noLocationStats.total_packets -
                                noLocationStats.inventoried_packets,
                            ),
                            progress_percent:
                              noLocationStats.total_packets > 0
                                ? Math.round(
                                    (noLocationStats.inventoried_packets /
                                      noLocationStats.total_packets) *
                                      100,
                                  )
                                : 0,
                          }}
                          loading={progressLoading}
                          label=""
                        />
                      </div>
                      <span className="w-6 shrink-0" />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">No locations defined.</p>
              )}
            </div>
          </TooltipProvider>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Select a campaign to see per-location inventory progress.
        </p>
      )}
    </div>
  )
}
