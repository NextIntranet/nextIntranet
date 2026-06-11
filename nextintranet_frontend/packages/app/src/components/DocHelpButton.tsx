import { CircleHelp } from "lucide-react"

import { useDocumentationSheet } from "@/components/DocumentationSheetContext"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { type DocPagePath } from "@/lib/documentation"

type DocHelpButtonProps = {
  page: DocPagePath | (string & {})
  hash?: string
  className?: string
  label?: string
}

export function DocHelpButton({
  page,
  hash,
  className,
  label = "Help",
}: DocHelpButtonProps) {
  const { openDocSheet } = useDocumentationSheet()

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={label}
      onClick={() => openDocSheet({ page, hash })}
    >
      <CircleHelp className="h-4 w-4" />
    </Button>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
