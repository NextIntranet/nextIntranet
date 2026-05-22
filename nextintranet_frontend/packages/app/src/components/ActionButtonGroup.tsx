import type { ReactNode } from "react"

import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ActionButtonGroupProps = {
  children: ReactNode
  className?: string
}

/** Layout wrapper for grouping toolbar actions (print, edit, menus, etc.). */
export function ActionButtonGroup({ children, className }: ActionButtonGroupProps) {
  return <div className={cn("inline-flex items-center gap-1", className)}>{children}</div>
}

/** Icon button sized for table action groups. */
export function ActionIconButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}
