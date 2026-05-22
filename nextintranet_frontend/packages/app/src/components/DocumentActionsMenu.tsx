import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type DocumentActionsMenuProps = {
  onRemove?: () => void
  onDeleteCompletely?: () => void
  pending?: boolean
  compact?: boolean
  className?: string
}

export function DocumentActionsMenu({
  onRemove,
  onDeleteCompletely,
  pending = false,
  compact = false,
  className,
}: DocumentActionsMenuProps) {
  if (!onRemove && !onDeleteCompletely) {
    return null
  }

  const triggerClassName = compact ? "h-7 w-7" : "h-8 w-8"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn(triggerClassName, className)}
          disabled={pending}
          aria-label="Document actions"
          title="Document actions"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        {onRemove ? (
          <DropdownMenuItem onClick={onRemove} disabled={pending}>
            Remove from component
          </DropdownMenuItem>
        ) : null}
        {onDeleteCompletely ? (
          <DropdownMenuItem
            onClick={onDeleteCompletely}
            disabled={pending}
            className="text-destructive focus:text-destructive"
          >
            Delete completely
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
