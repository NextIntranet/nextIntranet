import { ReactNode } from "react"
import { useDroppable } from "@dnd-kit/core"

import { cn } from "@/lib/utils"

import { ROOT_DROP_ID } from "./types"

interface Props {
  children: ReactNode
}

export function UngroupedSection({ children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID })

  return (
    <div ref={setNodeRef} className={cn("mt-4 rounded-md", isOver && "bg-primary/5 ring-1 ring-primary/40")}>
      <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Ungrouped
      </p>
      {children}
    </div>
  )
}
