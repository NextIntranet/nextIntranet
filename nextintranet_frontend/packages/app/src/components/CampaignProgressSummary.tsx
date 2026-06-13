import type { ReactNode } from "react"

import { cn } from "@/lib/utils"
import {
  emptyStocktakingProgress,
  type StocktakingProgress,
} from "@/lib/stocktaking"

interface CampaignProgressSummaryProps {
  progress?: StocktakingProgress | null
  loading?: boolean
  className?: string
  label?: string
  headerAction?: ReactNode
  variant?: "compact" | "full"
}

const getProgressSegments = (stats: StocktakingProgress) => {
  const safeActive = Math.max(0, stats.total_packets)
  const safeInactive = Math.max(0, stats.inactive_packets ?? 0)
  const safeInventoried = Math.max(0, Math.min(stats.inventoried_packets, safeActive))
  // Inactive packets count as done.
  const safeDone = safeInventoried + safeInactive
  const safePending = Math.max(0, safeActive - safeInventoried)
  const barTotal = safeActive + safeInactive

  if (barTotal <= 0) {
    return {
      safeActive,
      safeInactive,
      safeInventoried,
      safeDone,
      safePending,
      barTotal,
      inventoriedWidth: 0,
      pendingWidth: 0,
      inactiveWidth: 0,
    }
  }

  return {
    safeActive,
    safeInactive,
    safeInventoried,
    safeDone,
    safePending,
    barTotal,
    inventoriedWidth: (safeInventoried / barTotal) * 100,
    pendingWidth: (safePending / barTotal) * 100,
    inactiveWidth: (safeInactive / barTotal) * 100,
  }
}

function CampaignProgressBar({
  stats,
  loading = false,
}: {
  stats: StocktakingProgress
  loading?: boolean
}) {
  const { inventoriedWidth, pendingWidth, inactiveWidth } = getProgressSegments(stats)

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/70">
      {inventoriedWidth > 0 ? (
        <div
          className={cn(
            "h-2 bg-green-600 transition-[width] duration-300",
            loading && "opacity-40",
          )}
          style={{ width: `${inventoriedWidth}%` }}
        />
      ) : null}
      {pendingWidth > 0 ? (
        <div
          className="h-2 transition-[width] duration-300"
          style={{ width: `${pendingWidth}%` }}
        />
      ) : null}
      {inactiveWidth > 0 ? (
        <div
          className={cn(
            "h-2 bg-muted-foreground/35 transition-[width] duration-300",
            loading && "opacity-40",
          )}
          style={{ width: `${inactiveWidth}%` }}
        />
      ) : null}
    </div>
  )
}

export function CampaignProgressSummary({
  progress,
  loading = false,
  className,
  label = "Inventoried",
  headerAction,
  variant = "compact",
}: CampaignProgressSummaryProps) {
  const stats = progress ?? emptyStocktakingProgress()
  const { safeInactive, safeDone, safePending, barTotal } = getProgressSegments(stats)
  const percent = barTotal > 0 ? Math.round((safeDone / barTotal) * 100) : 0

  if (variant === "full") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {headerAction}
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {loading ? "…" : `${percent} %`}
          </span>
        </div>
        <CampaignProgressBar stats={stats} loading={loading} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Done:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {loading ? "…" : safeDone.toLocaleString()}
            </span>
          </span>
          <span>
            Remaining:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {loading ? "…" : safePending.toLocaleString()}
            </span>
          </span>
          {safeInactive > 0 ? (
            <span>
              Incl. inactive:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {loading ? "…" : safeInactive.toLocaleString()}
              </span>
            </span>
          ) : null}
          <span>
            Total:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {loading ? "…" : barTotal.toLocaleString()}
            </span>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">
          {loading ? "…" : `${safeDone} / ${barTotal}`}
          {!loading && barTotal > 0 ? ` (${percent}%)` : ""}
        </span>
      </div>
      <CampaignProgressBar stats={stats} loading={loading} />
    </div>
  )
}
