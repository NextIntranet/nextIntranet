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

export function CampaignProgressSummary({
  progress,
  loading = false,
  className,
  label = "Inventoried",
  headerAction,
  variant = "compact",
}: CampaignProgressSummaryProps) {
  const stats = progress ?? emptyStocktakingProgress()
  const safeTotal = Math.max(0, stats.total_packets)
  const safeInventoried = Math.max(0, Math.min(stats.inventoried_packets, safeTotal))
  const safePending = Math.max(0, stats.pending_packets)
  const percent =
    safeTotal > 0 ? stats.progress_percent : 0

  if (variant === "full") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {headerAction}
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {loading ? "…" : `${percent}%`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/70">
          <div
            className={cn(
              "h-2 rounded-full bg-green-600 transition-[width] duration-300",
              loading && "opacity-40",
            )}
            style={{ width: loading ? "0%" : `${percent}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Done:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {loading ? "…" : safeInventoried.toLocaleString()}
            </span>
          </span>
          <span>
            Remaining:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {loading ? "…" : safePending.toLocaleString()}
            </span>
          </span>
          <span>
            Total:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {loading ? "…" : safeTotal.toLocaleString()}
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
          {loading ? "…" : `${safeInventoried} / ${safeTotal}`}
          {!loading && safeTotal > 0 ? ` (${percent}%)` : ""}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/70">
        <div
          className={cn(
            "h-2 rounded-full bg-green-600 transition-[width] duration-300",
            loading && "opacity-40",
          )}
          style={{ width: loading ? "0%" : `${percent}%` }}
        />
      </div>
    </div>
  )
}
