import { Boxes } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ShowComponentsButtonProps {
  to: string
  className?: string
}

export function ShowComponentsButton({ to, className }: ShowComponentsButtonProps) {
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
          <Link to={to} aria-label="Show containing components">
            <Boxes className="h-4 w-4" />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Show components</TooltipContent>
    </Tooltip>
  )
}
