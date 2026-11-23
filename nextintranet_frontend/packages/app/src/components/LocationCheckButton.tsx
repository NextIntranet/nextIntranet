import { ClipboardCheck } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface LocationCheckButtonProps {
  locationId: string
  className?: string
}

/** Icon link that opens the location check for one location. */
export function LocationCheckButton({ locationId, className }: LocationCheckButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            className,
          )}
          asChild
        >
          <Link to={`/store/location-check/${locationId}`} aria-label="Location check">
            <ClipboardCheck className="h-4 w-4" />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Location check</TooltipContent>
    </Tooltip>
  )
}
