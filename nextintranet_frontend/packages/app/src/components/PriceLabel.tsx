import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type Props = {
  value?: number | null
  currency?: string
  className?: string
}

export function PriceLabel({ value, currency = "CZK", className }: Props) {
  const numericValue = typeof value === "number" ? value : value ? Number(value) : null
  if (numericValue === null || Number.isNaN(numericValue)) {
    return <span className="text-muted-foreground">-</span>
  }

  const displayValue = numericValue.toFixed(2)
  const fullValue = numericValue.toFixed(4)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex items-baseline gap-1", className)}>
          <span className="tabular-nums">{displayValue}</span>
          <span className="text-xs text-muted-foreground">{currency}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {fullValue} <span className="text-xs text-muted-foreground">{currency}</span>
      </TooltipContent>
    </Tooltip>
  )
}
