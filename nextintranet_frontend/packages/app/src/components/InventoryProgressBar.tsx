import { cn } from "@/lib/utils"

interface InventoryProgressBarProps {
  inventoried: number
  total: number
  loading?: boolean
  className?: string
  label?: string
}

export function InventoryProgressBar({
  inventoried,
  total,
  loading = false,
  className,
  label = "Inventoried",
}: InventoryProgressBarProps) {
  const safeTotal = Math.max(0, total)
  const safeInventoried = Math.max(0, Math.min(inventoried, safeTotal))
  const percent = safeTotal > 0 ? (safeInventoried / safeTotal) * 100 : 0

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="shrink-0 tabular-nums">
          {loading ? "…" : `${safeInventoried} / ${safeTotal}`}
          {!loading && safeTotal > 0 ? ` (${Math.round(percent)}%)` : ""}
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
