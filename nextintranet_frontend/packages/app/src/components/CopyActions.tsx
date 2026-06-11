import { Copy, Link as LinkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { copyToClipboard } from "@/lib/clipboard"
import { cn } from "@/lib/utils"

interface CopyActionsProps {
  /** The ID copied by the first button. */
  id: string
  /** App-relative path; the copied link is prefixed with the current origin. */
  linkPath: string
  /** Lowercase noun used in tooltips and toasts, e.g. "component" or "packet". */
  subject: string
  /** "xs" matches the compact table rows, "sm" suits popovers and detail views. */
  size?: "xs" | "sm"
  className?: string
}

export function CopyActions({
  id,
  linkPath,
  subject,
  size = "sm",
  className,
}: CopyActionsProps) {
  const capitalized = subject.charAt(0).toUpperCase() + subject.slice(1)
  const buttonClass =
    size === "xs"
      ? "h-4 w-4 text-muted-foreground [&_svg]:size-2.5"
      : "h-6 w-6 text-muted-foreground [&_svg]:size-3.5"

  return (
    <TooltipProvider delayDuration={200}>
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={buttonClass}
              onClick={() => copyToClipboard(id, `${capitalized} ID copied.`)}
              aria-label={`Copy ${subject} ID`}
            >
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy {subject} ID</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={buttonClass}
              onClick={() =>
                copyToClipboard(
                  `${window.location.origin}${linkPath}`,
                  `${capitalized} link copied.`,
                )
              }
              aria-label={`Copy ${subject} link`}
            >
              <LinkIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy {subject} link</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  )
}
