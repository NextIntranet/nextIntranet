import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border",
        "bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  )
}

const KEY_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  meta: "⌘",
  cmd: "⌘",
  shift: "Shift",
}

/** Render a hotkey spec ("g i", "ctrl+k", "?") as a row of key caps. */
export function KbdKeys({ keys }: { keys: string }) {
  const steps = keys.split(" ")
  return (
    <span className="inline-flex items-center gap-1">
      {steps.map((step, stepIndex) => (
        <span key={`${step}-${stepIndex}`} className="inline-flex items-center gap-1">
          {stepIndex > 0 && (
            <span className="text-[10px] text-muted-foreground">then</span>
          )}
          {step.split("+").map((part, partIndex) => (
            <span key={`${part}-${partIndex}`} className="inline-flex items-center gap-1">
              {partIndex > 0 && (
                <span className="text-[10px] text-muted-foreground">+</span>
              )}
              <Kbd>{KEY_LABELS[part.toLowerCase()] ?? part.toUpperCase()}</Kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}
